import { getDatabase } from './connection.js';
import { importarNavios } from '../scripts/importNavios.js';

export async function initializeDatabase(): Promise<void> {
  const sql = getDatabase();

  // 1. Criar Tabelas no PostgreSQL
  await sql`
    CREATE TABLE IF NOT EXISTS lineup_navios (
        id SERIAL PRIMARY KEY,
        imo TEXT UNIQUE NOT NULL,
        nome_navio TEXT NOT NULL,
        tipo_navio TEXT DEFAULT 'Graneleiro',
        mercadoria TEXT NOT NULL,
        volume_t DOUBLE PRECISION NOT NULL,
        loa DOUBLE PRECISION NOT NULL,                    -- Comprimento Total (metros)
        dwt DOUBLE PRECISION NOT NULL,                    -- Porte Bruto / TPB (toneladas)
        calado DOUBLE PRECISION DEFAULT 8.5,
        agencia TEXT,
        ordem_fila INTEGER NOT NULL,                      -- Prioridade sequencial no berço (1, 2, 3...)
        
        -- Controle de Estados Operacionais
        status_cor TEXT NOT NULL,                         -- 'LARANJA', 'VERMELHO', 'CINZA', 'VERDE', 'AZUL'
        livre_pratica_ok INTEGER DEFAULT 0,               -- 0: Pendente, 1: Concedida (habilita transição para CINZA)
        armazem_publico INTEGER DEFAULT 0,                -- 0: Saída Direta, 1: Armazém Público CDSS
        
        -- Marcos Temporais (ISO 8601 em formato de texto)
        eta_previsto TEXT,                                -- Previsão Oficial de Chegada (SISPORT / Porto)
        eta_ais TEXT,                                     -- Previsão informada pelo Transponder AIS (DataDocked)
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
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS eta_ais TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS sinal_antena TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS ais_sincronizado_em TEXT`;
    await sql`ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS progresso_operacao DOUBLE PRECISION`;
  } catch (err) {
    console.error("[Database] Erro ao verificar/adicionar colunas defensivas em lineup_navios:", err);
  }

  // 2. SEED: Parâmetros Oficiais de Produtividade (Regulamento CDSS)
  const [{ count: countPranchas }] = await sql`SELECT COUNT(*)::int as count FROM pranchas_produtividade`;
  if (countPranchas === 0) {
    const pranchasIniciais = [
      {
        mercadoria: 'Barrilha',
        prancha_minima_dia: 2500,
        pmd_historica: 2800,
        sensivel_chuva: 1
      },
      {
        mercadoria: 'Trigo a Granel',
        prancha_minima_dia: 3000,
        pmd_historica: 3400,
        sensivel_chuva: 1
      },
      {
        mercadoria: 'Malte a Granel',
        prancha_minima_dia: 2200,
        pmd_historica: 2600,
        sensivel_chuva: 1
      },
      {
        mercadoria: 'Carga Geral',
        prancha_minima_dia: 1200,
        pmd_historica: 1500,
        sensivel_chuva: 0
      }
    ];

    for (const p of pranchasIniciais) {
      await sql`
        INSERT INTO pranchas_produtividade (mercadoria, prancha_minima_dia, pmd_historica, sensivel_chuva)
        VALUES (${p.mercadoria}, ${p.prancha_minima_dia}, ${p.pmd_historica}, ${p.sensivel_chuva})
        ON CONFLICT (mercadoria) DO NOTHING
      `;
    }
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
        latitude: -23.8242,
        longitude: -45.3931
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
