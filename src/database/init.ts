import { getDatabase } from './connection.js';
import { importarNavios } from '../scripts/importNavios.js';

export async function initializeDatabase(maxRetries = 5, retryDelayMs = 2500): Promise<void> {
  let attempt = 0;
  while (true) {
    try {
      attempt++;
      const sqlTest = getDatabase();
      await sqlTest`SELECT 1`;
      break;
    } catch (err: any) {
      if (attempt >= maxRetries) {
        console.error(`[Database] Falha crítica de conexão com o PostgreSQL após ${attempt} tentativas:`, err.message);
        throw err;
      }
      console.warn(`[Database] Aguardando PostgreSQL inicializar (tentativa ${attempt}/${maxRetries})... Nova tentativa em ${retryDelayMs}ms.`);
      await new Promise(r => setTimeout(r, retryDelayMs));
    }
  }

  const sql = getDatabase();

  // 1. Criar Tabelas no PostgreSQL
  await sql`
    CREATE TABLE IF NOT EXISTS lineup_navios (
        id SERIAL PRIMARY KEY,
        imo TEXT NOT NULL,
        nome_navio TEXT NOT NULL,
        tipo_navio TEXT DEFAULT 'Graneleiro',
        mercadoria TEXT NOT NULL,
        volume_t DOUBLE PRECISION NOT NULL,
        loa DOUBLE PRECISION NOT NULL,                    -- Comprimento Total (metros)
        dwt DOUBLE PRECISION NOT NULL,                    -- Porte Bruto / TPB (toneladas)
        calado DOUBLE PRECISION DEFAULT 8.5,
        calado_entrada DOUBLE PRECISION,
        calado_saida DOUBLE PRECISION,
        agencia TEXT,
        ordem_fila INTEGER NOT NULL,                      -- Prioridade sequencial no berço (1, 2, 3...)
        ordem_sisport INTEGER,                            -- Ordem oficial vinda do SISPORT
        
        -- Controle de Estados Operacionais
        status_cor TEXT NOT NULL,                         -- 'LARANJA', 'VERMELHO', 'CINZA', 'VERDE', 'AZUL'
        status_sisport TEXT,                              -- Status oficial vindo do SISPORT
        livre_pratica_ok INTEGER DEFAULT 0,               -- 0: Pendente, 1: Concedida (habilita transição para CINZA)
        armazem_publico INTEGER DEFAULT 0,                -- 0: Saída Direta, 1: Armazém Público CDSS
        
        -- Marcos Temporais (ISO 8601 em formato de texto)
        eta_previsto TEXT,                                -- Previsão Oficial de Chegada (SISPORT / Porto)
        eta_ais TEXT,                                     -- Previsão informada pelo Transponder AIS (DataDocked)
        inicio_operacao TEXT,                             -- Início da Operação (Previsão / Real)
        chegada_fundeio TEXT,                             -- Entrada física na barra
        inicio_atracacao TEXT,                            -- Início do berço (Real para Verde / Projetado para Azul)
        fim_atracacao TEXT,                               -- Término do berço (Real para Verde / Projetado para Azul)
        
        -- Telemetria e Posicionamento
        latitude DOUBLE PRECISION DEFAULT -23.8045,
        longitude DOUBLE PRECISION DEFAULT -45.3970,
        sinal_antena TEXT,
        ais_sincronizado_em TEXT,
        progresso_operacao DOUBLE PRECISION,              -- % de progresso da operação no berço (SISPORT)
        ultima_atualizacao TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS pranchas_produtividade (
        mercadoria TEXT PRIMARY KEY,
        prancha_minima_dia DOUBLE PRECISION NOT NULL,    -- Toneladas/dia mínimas regulamentares
        pmd_historica DOUBLE PRECISION NOT NULL,         -- Média operacional histórica registrada (t/dia)
        sensivel_chuva INTEGER DEFAULT 1                 -- 1: Interrompe com precipitação, 0: Não interrompe
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tabua_mares (
        id SERIAL PRIMARY KEY,
        estacao TEXT NOT NULL DEFAULT 'SAO_SEBASTIAO',
        data_hora TEXT NOT NULL,                         -- ISO 8601 UTC (ex: 2026-09-22T08:15:00Z)
        tipo TEXT NOT NULL,                              -- 'PREAMAR' ou 'BAIXA_MAR'
        altura_m DOUBLE PRECISION NOT NULL,              -- Altura em metros sobre o Zero Hidrográfico (ZH)
        UNIQUE(estacao, data_hora)
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS tide_telemetry (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        water_level DOUBLE PRECISION NOT NULL,
        tendency TEXT NOT NULL,
        next_high_tide_time TEXT,
        next_high_tide_height DOUBLE PRECISION,
        next_low_tide_time TEXT,
        next_low_tide_height DOUBLE PRECISION,
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        raw_payload TEXT,
        captured_at BIGINT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS navios (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        imo TEXT NOT NULL,
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_navios_nome_imo UNIQUE (nome, imo)
    );
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_navios_nome ON navios (UPPER(nome))`;
  await sql`CREATE INDEX IF NOT EXISTS idx_navios_imo ON navios (imo)`;

  // Tabelas da Praticagem de São Sebastião (SP Pilots)
  await sql`
    CREATE TABLE IF NOT EXISTS praticagem_manobras (
        id SERIAL PRIMARY KEY,
        sp_manobra_id INTEGER,
        categoria TEXT NOT NULL,                         -- 'ENCERRADAS', 'EM_ANDAMENTO', 'CONFIRMADAS', 'CONFIRMADAS_AGENTE', 'SOLICITADAS'
        categoria_label TEXT NOT NULL,                   -- 'Manobras Encerradas', 'Manobras em Andamento', etc.
        cor_fundo TEXT,                                  -- Hexadecimal original (#ff4a4a, #D1A2F9, etc.)
        nome_navio TEXT NOT NULL,
        imo TEXT,
        tipo_manobra TEXT NOT NULL,                      -- 'E', 'S', 'M'
        local_origem TEXT,
        local_destino TEXT,
        horario_str TEXT NOT NULL,                       -- '11/10 04:30'
        horario_iso TEXT,                                -- '2026-10-11T04:30:00-03:00'
        indicadores JSONB DEFAULT '[]'::jsonb,
        agente TEXT,
        calado DOUBLE PRECISION,
        bordo TEXT,
        rebocador TEXT,
        observacoes TEXT,
        detalhes_navio JSONB,
        vinculo_lineup_imo TEXT,                         -- IMO correspondente no Line-up CDSS se existir
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_praticagem_manobras_categoria ON praticagem_manobras(categoria)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_praticagem_manobras_navio ON praticagem_manobras(UPPER(nome_navio))`;
  await sql`CREATE INDEX IF NOT EXISTS idx_praticagem_manobras_imo ON praticagem_manobras(imo)`;

  await sql`
    CREATE TABLE IF NOT EXISTS praticagem_resumo_porto (
        id SERIAL PRIMARY KEY,
        tipo TEXT NOT NULL,                              -- 'AGUARDADOS', 'FUNDEADOS', 'ATRACADOS'
        navio TEXT NOT NULL,
        berco TEXT,                                      -- 'P1', 'P2', 'P3', 'CAIS'
        data_hora_str TEXT,                              -- '12/10 06:00'
        data_hora_iso TEXT,
        ordem INTEGER DEFAULT 0,
        vinculo_lineup_imo TEXT,
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_praticagem_resumo_tipo ON praticagem_resumo_porto(tipo)`;

  await sql`
    CREATE TABLE IF NOT EXISTS praticagem_sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ultima_sincronizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        status TEXT NOT NULL,                            -- 'SUCESSO', 'ERRO'
        total_manobras INTEGER DEFAULT 0,
        total_aguardados INTEGER DEFAULT 0,
        total_fundeados INTEGER DEFAULT 0,
        total_atracados INTEGER DEFAULT 0,
        mensagem_erro TEXT
    );
  `;

  // Tabela de Configuração e Telemetria do Worker Periódico do SISPORT (Melhoria 8)
  await sql`
    CREATE TABLE IF NOT EXISTS sisport_sync_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        intervalo_minutos INTEGER NOT NULL DEFAULT 15,
        modo_sync TEXT NOT NULL DEFAULT 'SISPORT_ONLY',   -- 'SISPORT_ONLY' ou 'FULL_SYNC'
        ultima_execucao TIMESTAMP WITH TIME ZONE,
        proxima_execucao TIMESTAMP WITH TIME ZONE,
        em_execucao BOOLEAN NOT NULL DEFAULT FALSE,
        ultimo_status TEXT DEFAULT 'PENDENTE',            -- 'SUCESSO', 'ERRO', 'EM_ANDAMENTO', 'PAUSADO', 'PENDENTE'
        ultimo_erro TEXT,
        total_escalas_ultimo_sync INTEGER DEFAULT 0,
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await sql`
    INSERT INTO sisport_sync_config (id, ativo, intervalo_minutos, modo_sync)
    VALUES (1, TRUE, 15, 'SISPORT_ONLY')
    ON CONFLICT (id) DO NOTHING;
  `;

  // Tabela de Histórico e Acurácia de Previsões de ETA/ETD (Melhoria 4.3)
  await sql`
    CREATE TABLE IF NOT EXISTS lineup_historico_previsoes (
        id SERIAL PRIMARY KEY,
        lineup_id INTEGER,
        imo TEXT NOT NULL,
        nome_navio TEXT NOT NULL,
        mercadoria TEXT,
        volume_t DOUBLE PRECISION,
        berco TEXT,
        eta_previsto TEXT,
        inicio_atracacao_previsto TEXT,
        fim_atracacao_previsto TEXT,
        duracao_prevista_horas DOUBLE PRECISION,
        chegada_fundeio_real TEXT,
        inicio_atracacao_real TEXT,
        fim_atracacao_real TEXT,
        duracao_real_horas DOUBLE PRECISION,
        desvio_eta_horas DOUBLE PRECISION,
        desvio_atracacao_horas DOUBLE PRECISION,
        desvio_desatracacao_horas DOUBLE PRECISION,
        desvio_duracao_horas DOUBLE PRECISION,
        confianca_estimada TEXT DEFAULT 'ALTA',
        precisao_percentual DOUBLE PRECISION,
        status_fechamento TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
        registrado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        finalizado_em TIMESTAMP WITH TIME ZONE
    );
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_hist_prev_imo ON lineup_historico_previsoes(imo)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hist_prev_status ON lineup_historico_previsoes(status_fechamento)`;

  // Popula catálogo de navios caso a tabela esteja vazia
  const [{ count: countCatalogoNavios }] = await sql`SELECT COUNT(*)::int as count FROM navios`;
  if (countCatalogoNavios === 0) {
    try {
      console.log('[Database] Tabela navios vazia. Iniciando importação automática a partir de docs/Navios.csv...');
      await importarNavios();
    } catch (err) {
      console.error('[Database] Erro ao importar navios automaticamente:', err);
    }
  }

  // Migração defensiva: garante a existência das colunas opcionais no PostgreSQL
  try {
    // Desacoplamento de escala: remove restrição de unicidade em IMO para permitir múltiplas escalas do mesmo navio
    await sql`ALTER TABLE lineup_navios DROP CONSTRAINT IF EXISTS lineup_navios_imo_key`;
    await sql`CREATE INDEX IF NOT EXISTS idx_lineup_navios_imo ON lineup_navios (imo)`;

    // Normalização retroativa: remove sufixos sintéticos temporários (ex: 9553141_19 -> 9553141)
    await sql`
      UPDATE lineup_navios 
      SET imo = regexp_replace(imo, '_[0-9]+$', '') 
      WHERE imo ~ '_[0-9]+$';
    `;

    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS eta_ais TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS inicio_operacao TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS sinal_antena TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS ais_sincronizado_em TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS progresso_operacao DOUBLE PRECISION`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS origem_previsao_fim TEXT DEFAULT 'CALCULADO'`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS manobra_praticagem_id INTEGER`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS manobra_praticagem_str TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS ajuste_praticagem_ativo INTEGER DEFAULT 1`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS calado_entrada DOUBLE PRECISION`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS calado_saida DOUBLE PRECISION`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS berco TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS ordem_sisport INTEGER`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS status_sisport TEXT`;

    // Inicialização retroativa: popula ordem_sisport e status_sisport a partir dos valores existentes
    await sql`
      UPDATE lineup_navios
      SET ordem_sisport = COALESCE(ordem_sisport, ordem_fila)
      WHERE ordem_sisport IS NULL;
    `;
    await sql`
      UPDATE lineup_navios
      SET status_sisport = COALESCE(status_sisport, status_cor)
      WHERE status_sisport IS NULL;
    `;

    // Inicialização retroativa: popula calados de entrada e saída a partir de calado
    await sql`
      UPDATE lineup_navios
      SET calado_entrada = COALESCE(calado_entrada, calado, 8.5)
      WHERE calado_entrada IS NULL;
    `;
    await sql`
      UPDATE lineup_navios
      SET calado_saida = COALESCE(calado_saida, calado, 8.5)
      WHERE calado_saida IS NULL;
    `;

    // Regra: se inicio_operacao estiver vazio, preenche inicialmente com as informações de data e hora do AIS (eta_ais)
    await sql`
      UPDATE lineup_navios
      SET inicio_operacao = eta_ais
      WHERE (inicio_operacao IS NULL OR TRIM(inicio_operacao) = '')
        AND eta_ais IS NOT NULL AND TRIM(eta_ais) != ''
    `;
  } catch (err) {
    console.error("[Database] Erro ao verificar/adicionar colunas defensivas em lineup_navios:", err);
  }

  // 2. SEED / CALIBRAÇÃO: Parâmetros Oficiais de Produtividade (Regulamento CDSS e Histórico Operacional Real - Melhoria 4.2)
  const pranchasOficiais = [
    { mercadoria: 'Barrilha', prancha_minima_dia: 2500, pmd_historica: 3200, sensivel_chuva: 1 },
    { mercadoria: 'Trigo a Granel', prancha_minima_dia: 3000, pmd_historica: 4500, sensivel_chuva: 1 },
    { mercadoria: 'Malte a Granel', prancha_minima_dia: 2500, pmd_historica: 4000, sensivel_chuva: 1 },
    { mercadoria: 'Cevada a Granel', prancha_minima_dia: 2800, pmd_historica: 4200, sensivel_chuva: 1 },
    { mercadoria: 'Alumina Calcinada', prancha_minima_dia: 2800, pmd_historica: 3800, sensivel_chuva: 1 },
    { mercadoria: 'Coque Calcinado', prancha_minima_dia: 2800, pmd_historica: 3500, sensivel_chuva: 1 },
    { mercadoria: 'Animais Vivos', prancha_minima_dia: 2500, pmd_historica: 3500, sensivel_chuva: 0 },
    { mercadoria: 'Carga Geral', prancha_minima_dia: 1500, pmd_historica: 2000, sensivel_chuva: 0 },
    { mercadoria: 'Carga Projeto', prancha_minima_dia: 1200, pmd_historica: 1800, sensivel_chuva: 0 },
    { mercadoria: 'Café', prancha_minima_dia: 1200, pmd_historica: 1800, sensivel_chuva: 0 },
    { mercadoria: 'Apoio Marítimo / Offshore', prancha_minima_dia: 2500, pmd_historica: 3500, sensivel_chuva: 0 }
  ];

  for (const p of pranchasOficiais) {
    await sql`
      INSERT INTO pranchas_produtividade (mercadoria, prancha_minima_dia, pmd_historica, sensivel_chuva)
      VALUES (${p.mercadoria}, ${p.prancha_minima_dia}, ${p.pmd_historica}, ${p.sensivel_chuva})
      ON CONFLICT (mercadoria) DO UPDATE SET
        prancha_minima_dia = EXCLUDED.prancha_minima_dia,
        pmd_historica = EXCLUDED.pmd_historica,
        sensivel_chuva = EXCLUDED.sensivel_chuva
    `;
  }

  // 2.1. SEED: Histórico Inicial de Acurácia de Previsões (Benchmarks Reais - Melhoria 4.3)
  const [{ count: countHist }] = await sql`SELECT COUNT(*)::int as count FROM lineup_historico_previsoes`;
  if (countHist === 0) {
    await sql`
      INSERT INTO lineup_historico_previsoes (
        imo, nome_navio, mercadoria, volume_t, berco,
        eta_previsto, inicio_atracacao_previsto, fim_atracacao_previsto, duracao_prevista_horas,
        chegada_fundeio_real, inicio_atracacao_real, fim_atracacao_real, duracao_real_horas,
        desvio_eta_horas, desvio_atracacao_horas, desvio_desatracacao_horas, desvio_duracao_horas,
        confianca_estimada, precisao_percentual, status_fechamento, finalizado_em
      ) VALUES
      ('9234561', 'MADONNA', 'Barrilha', 18000, '101',
       '2026-09-15T12:00:00Z', '2026-09-15T18:00:00Z', '2026-09-18T18:00:00Z', 72.0,
       '2026-09-15T13:30:00Z', '2026-09-15T19:00:00Z', '2026-09-18T16:30:00Z', 69.5,
       1.5, 1.0, -1.5, -2.5, 'ALTA', 96.5, 'CONCLUIDO', CURRENT_TIMESTAMP - INTERVAL '15 days'),
      ('9456782', 'PACIFIC PRIDE', 'Animais Vivos', 2450, '101',
       '2026-09-19T06:00:00Z', '2026-09-19T08:00:00Z', '2026-09-20T02:00:00Z', 18.0,
       '2026-09-19T06:45:00Z', '2026-09-19T08:30:00Z', '2026-09-20T03:00:00Z', 18.5,
       0.75, 0.5, 1.0, 0.5, 'ALTA', 97.2, 'CONCLUIDO', CURRENT_TIMESTAMP - INTERVAL '10 days'),
      ('9311223', 'NORDIC TRADER', 'Trigo a Granel', 28000, '101',
       '2026-09-22T10:00:00Z', '2026-09-22T14:00:00Z', '2026-09-26T20:00:00Z', 102.0,
       '2026-09-22T12:00:00Z', '2026-09-22T16:00:00Z', '2026-09-26T22:30:00Z', 102.5,
       2.0, 2.0, 2.5, 0.5, 'ALTA', 94.8, 'CONCLUIDO', CURRENT_TIMESTAMP - INTERVAL '5 days');
    `;
  }

  // 3. SEED: Escalas Iniciais caso a tabela esteja vazia
  const [{ count: countNavios }] = await sql`SELECT COUNT(*)::int as count FROM lineup_navios`;
  if (countNavios === 0) {
    const naviosIniciais = [
      {
        imo: '9234561',
        nome_navio: 'MADONNA',
        tipo_navio: 'Graneleiro',
        mercadoria: 'Barrilha',
        volume_t: 18000,
        loa: 170.0,
        dwt: 28000,
        calado: 9.2,
        agencia: 'Wilson Sons Agência',
        ordem_fila: 1,
        status_cor: 'VERDE',
        livre_pratica_ok: 1,
        armazem_publico: 0,
        eta_previsto: '2026-09-15T12:00:00',
        chegada_fundeio: '2026-09-15T17:00:00',
        inicio_atracacao: '2026-09-16T08:00:00',
        fim_atracacao: '2026-09-18T18:00:00',
        latitude: -23.8112,
        longitude: -45.3971
      },
      {
        imo: '9345672',
        nome_navio: 'JACAMAR ARROW',
        tipo_navio: 'Graneleiro',
        mercadoria: 'Trigo a Granel',
        volume_t: 24000,
        loa: 190.0,
        dwt: 35000,
        calado: 10.2,
        agencia: 'Oceanica Cargas',
        ordem_fila: 2,
        status_cor: 'CINZA',
        livre_pratica_ok: 1,
        armazem_publico: 1,
        eta_previsto: '2026-09-16T09:00:00',
        chegada_fundeio: '2026-09-16T15:00:00',
        inicio_atracacao: null,
        fim_atracacao: null,
        latitude: -23.8115,
        longitude: -45.3872
      },
      {
        imo: '9456783',
        nome_navio: 'DIAMOND STAR II',
        tipo_navio: 'Graneleiro',
        mercadoria: 'Malte a Granel',
        volume_t: 15000,
        loa: 160.0,
        dwt: 22000,
        calado: 8.6,
        agencia: 'Unimar Navegação',
        ordem_fila: 3,
        status_cor: 'VERMELHO',
        livre_pratica_ok: 0,
        armazem_publico: 0,
        eta_previsto: '2026-09-17T02:00:00',
        chegada_fundeio: '2026-09-17T05:30:00',
        inicio_atracacao: null,
        fim_atracacao: null,
        latitude: -23.7995,
        longitude: -45.4020
      },
      {
        imo: '9567894',
        nome_navio: 'EVOLUTION',
        tipo_navio: 'Graneleiro',
        mercadoria: 'Barrilha',
        volume_t: 20000,
        loa: 180.0,
        dwt: 30000,
        calado: 9.4,
        agencia: 'Lachmann Maritime',
        ordem_fila: 4,
        status_cor: 'LARANJA',
        livre_pratica_ok: 0,
        armazem_publico: 0,
        eta_previsto: '2026-09-19T06:00:00',
        chegada_fundeio: null,
        inicio_atracacao: null,
        fim_atracacao: null,
        latitude: -23.7780,
        longitude: -45.4350
      }
    ];

    for (const n of naviosIniciais) {
      await sql`
        INSERT INTO lineup_navios (
          imo, nome_navio, tipo_navio, mercadoria, volume_t, loa, dwt, calado, agencia,
          ordem_fila, status_cor, livre_pratica_ok, armazem_publico, eta_previsto,
          chegada_fundeio, inicio_atracacao, fim_atracacao, latitude, longitude
        ) VALUES (
          ${n.imo}, ${n.nome_navio}, ${n.tipo_navio}, ${n.mercadoria}, ${n.volume_t}, ${n.loa},
          ${n.dwt}, ${n.calado}, ${n.agencia}, ${n.ordem_fila}, ${n.status_cor}, ${n.livre_pratica_ok},
          ${n.armazem_publico}, ${n.eta_previsto}, ${n.chegada_fundeio}, ${n.inicio_atracacao},
          ${n.fim_atracacao}, ${n.latitude}, ${n.longitude}
        )
        ON CONFLICT (imo) DO NOTHING
      `;
    }
  }
}
