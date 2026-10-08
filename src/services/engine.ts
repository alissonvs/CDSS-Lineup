import { getDatabase } from '../database/connection.js';
import {
  NavioLineup,
  ResumoOperacional,
  PranchaProdutividade,
  TimelineBlock
} from '../types/index.js';
import { obterHorasChuva } from './weather.js';
import { analisarRestricaoMareNavio, sincronizarTabuaMaresNoBanco } from './tideService.js';

const DELTA_T_MANOBRA = 2.0; // Constante regulamentar CDSS (2,0 horas de folga de manobra)

/**
 * Busca os parâmetros de produtividade do banco de dados
 */
export async function obterPranchas(): Promise<Record<string, PranchaProdutividade>> {
  const sql = getDatabase();
  const rows = await sql<PranchaProdutividade[]>`SELECT * FROM pranchas_produtividade`;
  const map: Record<string, PranchaProdutividade> = {};
  for (const r of rows) {
    map[r.mercadoria] = r;
  }
  return map;
}

/**
 * Calcula a duração de berço de um navio considerando produtividade, chuva e manobra
 */
/**
 * Calcula a duração de berço de um navio considerando produtividade, chuva e manobra
 */
export async function calcularDuracaoNavio(
  navio: NavioLineup,
  pranchas: Record<string, PranchaProdutividade>,
  inicioEstimado: Date
): Promise<{ duracaoBaseHoras: number; horasChuva: number; tempoTotalHoras: number }> {
  const merc = (navio.mercadoria || '').toLowerCase();
  let prancha: PranchaProdutividade | undefined;

  for (const [k, v] of Object.entries(pranchas)) {
    if (k.toLowerCase() === merc || merc.includes(k.toLowerCase()) || k.toLowerCase().includes(merc)) {
      prancha = v;
      break;
    }
  }

  if (!prancha) {
    if (merc.includes('animais') || merc.includes('vivos') || merc.includes('viva')) {
      prancha = {
        mercadoria: 'Animais Vivos',
        prancha_minima_dia: 2200,
        pmd_historica: 2500,
        sensivel_chuva: 0
      };
    } else if (merc.includes('cevada')) {
      prancha = {
        mercadoria: 'Cevada',
        prancha_minima_dia: 2800,
        pmd_historica: 3200,
        sensivel_chuva: 1
      };
    } else {
      prancha = pranchas['Carga Geral'] || {
        mercadoria: navio.mercadoria,
        prancha_minima_dia: 2000,
        pmd_historica: 2200,
        sensivel_chuva: 1
      };
    }
  }

  const pmdEfetiva = Math.max(prancha.pmd_historica, prancha.prancha_minima_dia);
  const pmdHora = pmdEfetiva / 24.0;
  const duracaoBaseHoras = Math.round((navio.volume_t / pmdHora) * 10) / 10;

  // Estima término provisório para análise de precipitação
  const fimProvisorio = new Date(inicioEstimado.getTime() + (duracaoBaseHoras + DELTA_T_MANOBRA) * 3600000);

  let horasChuva = 0;
  if (prancha.sensivel_chuva === 1) {
    horasChuva = await obterHorasChuva(inicioEstimado, fimProvisorio);
  }

  const tempoTotalHoras = duracaoBaseHoras + horasChuva + DELTA_T_MANOBRA;

  return {
    duracaoBaseHoras,
    horasChuva,
    tempoTotalHoras: Math.round(tempoTotalHoras * 10) / 10
  };
}

/**
 * Faz o parsing rigoroso de datas ISO para objetos Date no fuso UTC invariante
 */
export function parseDateIso(str?: string | null): Date | null {
  if (!str) return null;
  const s = str.trim();
  if (!s) return null;
  const norm = s.endsWith('Z') || s.includes('+') || (s.lastIndexOf('-') > 7) ? s : s + 'Z';
  const d = new Date(norm);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Converte Date em string ISO UTC invariante com terminação Z para persistência estável no SQLite
 */
export function toIsoUtc(d: Date): string {
  return d.toISOString().slice(0, 19) + 'Z';
}

/**
/**
 * Algoritmo Principal do Motor: Encadeamento de Fila de Berço Único sem Colisão Temporal
 * e Geração Determinística de TimelineBlocks (Verde, Azul, Vermelho, Laranja)
 */
export async function recalcularLineupComMotor(): Promise<{
  navios: NavioLineup[];
  operacional: ResumoOperacional;
}> {
  const sql = getDatabase();
  const rawNavios = (await sql<NavioLineup[]>`SELECT * FROM lineup_navios ORDER BY ordem_fila ASC`) as NavioLineup[];

  const pranchas = await obterPranchas();

  // Momento de referência do sistema: Data/hora atual em tempo real
  const agora = new Date();
  const nowMs = agora.getTime();

  // 1. Identificar o navio atualmente no berço (status_cor = 'VERDE')
  // Restrição CDSS: No máximo 1 navio simultâneo operando no berço comercial único
  const navioVerde = rawNavios.find((n) => n.status_cor === 'VERDE');

  // Navios aguardando na fila (todos os não-verdes)
  const naviosFila = rawNavios
    .filter((n) => !navioVerde || n.id !== navioVerde.id);

  // Ordenação inteligente da fila de espera para evitar ociosidade no cais:
  // Navios prontos/disponíveis no porto (ETA <= agora ou fundeados) têm precedência para ocupar o cais liberado
  naviosFila.sort((a, b) => {
    const etaA = parseDateIso(a.chegada_fundeio || a.eta_previsto)?.getTime() || nowMs;
    const etaB = parseDateIso(b.chegada_fundeio || b.eta_previsto)?.getTime() || nowMs;

    const aDisponivel = etaA <= nowMs || a.status_cor === 'VERMELHO';
    const bDisponivel = etaB <= nowMs || b.status_cor === 'VERMELHO';

    if (aDisponivel && bDisponivel) {
      return (a.ordem_fila || 999) - (b.ordem_fila || 999) || etaA - etaB;
    }
    if (aDisponivel && !bDisponivel) return -1;
    if (!aDisponivel && bDisponivel) return 1;

    // Se a diferença de chegada for estreita (<= 24h), respeita preferência regulamentar de Carga Viva ou prioridade
    if (Math.abs(etaA - etaB) <= 24 * 3600 * 1000) {
      const vivaA = (a.mercadoria || '').toLowerCase().includes('animais') ? 1 : 0;
      const vivaB = (b.mercadoria || '').toLowerCase().includes('animais') ? 1 : 0;
      if (vivaA !== vivaB) return vivaB - vivaA;
      return (b.volume_t || 0) - (a.volume_t || 0);
    }

    // Navios futuros em trânsito ordenados cronologicamente pelo ETA
    return etaA - etaB || (a.ordem_fila || 999) - (b.ordem_fila || 999);
  });

  let navioVerdeProcessado: NavioLineup | null = null;
  const naviosFilaProcessados: NavioLineup[] = [];
  let totalHorasOcupadasBerco = 0;
  let totalVolumeT = 0;
  let ultimoFimBerco: Date;

  // 2. Processar o navio que já está no berço comercial (Verde = Ordem #1)
  if (navioVerde) {
    const navio: NavioLineup = { ...navioVerde };
    totalVolumeT += navio.volume_t || 0;

    // Tempo já operado no passado (horasJaOperadasMs):
    // Garante um bloco verde expressivo cobrindo a operação real decorrida no cais (12h no passado)
    const horasJaOperadasMs = 12 * 3600 * 1000;
    let berthedAtMs = nowMs - horasJaOperadasMs;
    if (navio.inicio_atracacao) {
      const parsedInicio = parseDateIso(navio.inicio_atracacao);
      if (parsedInicio && parsedInicio.getTime() <= nowMs - 4 * 3600 * 1000) {
        berthedAtMs = parsedInicio.getTime();
      }
    }

    const { duracaoBaseHoras, horasChuva, tempoTotalHoras } = await calcularDuracaoNavio(
      navio,
      pranchas,
      new Date(berthedAtMs)
    );

    // Duração restante de cais projetada a partir de AGORA (pelo menos as horas estimadas da carga)
    const horasRestantesMs = Math.max(8, tempoTotalHoras) * 3600000;
    const etdProjetadoMs = nowMs + horasRestantesMs;
    const blocos: TimelineBlock[] = [];
    const caladoCriticoVerde = (navio.calado || 0) > 9.50;

    // A. Histórico de Fundeio Real (se ancorou na barra antes de atracar)
    if (navio.chegada_fundeio) {
      const anchoredAt = parseDateIso(navio.chegada_fundeio);
      if (anchoredAt && anchoredAt.getTime() < berthedAtMs) {
        const anchoredAtMs = anchoredAt.getTime();
        const duracaoFundeioRealHoras = Math.round(((berthedAtMs - anchoredAtMs) / 3600000) * 10) / 10;
        blocos.push({
          tipo: 'VERMELHO',
          label: `No Fundeio Real • ${duracaoFundeioRealHoras}h`,
          inicioIso: toIsoUtc(new Date(anchoredAtMs)),
          fimIso: toIsoUtc(new Date(berthedAtMs)),
          duracaoHoras: duracaoFundeioRealHoras
        });
      }
    }

    // B. Bloco Verde (Operando Real: Passado até NOW)
    const duracaoVerdeHoras = Math.round(((nowMs - berthedAtMs) / 3600000) * 10) / 10;
    blocos.push({
      tipo: 'VERDE',
      label: `Operando Real • ${duracaoVerdeHoras}h`,
      inicioIso: toIsoUtc(new Date(berthedAtMs)),
      fimIso: toIsoUtc(new Date(nowMs)),
      duracaoHoras: duracaoVerdeHoras,
      caladoCritico: caladoCriticoVerde
    });

    // C. Bloco Azul (Previsão Término: NOW até ETD)
    const duracaoAzulHoras = Math.round(((etdProjetadoMs - nowMs) / 3600000) * 10) / 10;
    blocos.push({
      tipo: 'AZUL',
      label: `Previsão Término • ${duracaoAzulHoras}h`,
      inicioIso: toIsoUtc(new Date(nowMs)),
      fimIso: toIsoUtc(new Date(etdProjetadoMs)),
      duracaoHoras: duracaoAzulHoras,
      caladoCritico: caladoCriticoVerde
    });
    ultimoFimBerco = new Date(etdProjetadoMs);

    const duracaoTotalGeral = Math.round(((etdProjetadoMs - berthedAtMs) / 3600000) * 10) / 10;
    navio.duracao_base_horas = duracaoBaseHoras;
    navio.horas_chuva = horasChuva;
    navio.duracao_estimada_horas = duracaoTotalGeral;
    navio.delta_t_manobra = DELTA_T_MANOBRA;
    navio.inicio_atracacao = toIsoUtc(new Date(berthedAtMs));
    navio.fim_atracacao = toIsoUtc(new Date(etdProjetadoMs));
    navio.blocos = blocos;

    totalHorasOcupadasBerco += duracaoTotalGeral;
    navioVerdeProcessado = navio;
  } else {
    ultimoFimBerco = agora;
  }

  // 3. Processar estritamente os navios da fila em série temporal contínua (SEM SOBREPOSIÇÃO)
  let cursorBercoMs = ultimoFimBerco.getTime() + DELTA_T_MANOBRA * 3600000;

  for (const n of naviosFila) {
    const navio: NavioLineup = { ...n };
    totalVolumeT += navio.volume_t || 0;

    // Data de prontidão do navio (ETA ou Chegada no Fundeio)
    const etaD = parseDateIso(navio.chegada_fundeio || navio.eta_previsto) || agora;
    const etaMs = etaD.getTime();

    // Regra matemática do encadeamento estrito de berço único:
    // Início = max(cursorBercoMs, etaMs)
    const inicioOperacaoMs = Math.max(cursorBercoMs, etaMs);
    const inicioOperacaoDate = new Date(inicioOperacaoMs);

    const { duracaoBaseHoras, horasChuva, tempoTotalHoras } = await calcularDuracaoNavio(
      navio,
      pranchas,
      inicioOperacaoDate
    );

    const fimOperacaoMs = inicioOperacaoMs + tempoTotalHoras * 3600000;
    const blocos: TimelineBlock[] = [];

    // Se o navio já estiver fisicamente fundeado na barra (status VERMELHO)
    if (navio.status_cor === 'VERMELHO' || navio.chegada_fundeio) {
      const anchoredAtMs = parseDateIso(navio.chegada_fundeio)?.getTime() || etaMs;
      const fimFundeioRealMs = Math.min(nowMs, inicioOperacaoMs);
      const duracaoFundeioReal = Math.round(((fimFundeioRealMs - anchoredAtMs) / 3600000) * 10) / 10;

      // Bloco Vermelho: Tempo decorrido de fundeio real até agora
      blocos.push({
        tipo: 'VERMELHO',
        label: `No Fundeio Real • ${duracaoFundeioReal}h`,
        inicioIso: toIsoUtc(new Date(anchoredAtMs)),
        fimIso: toIsoUtc(new Date(fimFundeioRealMs)),
        duracaoHoras: duracaoFundeioReal
      });

      // Bloco Laranja: Espera projetada de agora até o início da atracação
      if (inicioOperacaoMs > nowMs) {
        const duracaoProjetado = Math.round(((inicioOperacaoMs - nowMs) / 3600000) * 10) / 10;
        blocos.push({
          tipo: 'LARANJA',
          label: `Fundeio Projetado • ${duracaoProjetado}h`,
          inicioIso: toIsoUtc(new Date(nowMs)),
          fimIso: toIsoUtc(new Date(inicioOperacaoMs)),
          duracaoHoras: duracaoProjetado
        });
      }
    } else {
      // Navio esperado em trânsito: Bloco Laranja do ETA até o início da atracação
      if (inicioOperacaoMs > etaMs) {
        const duracaoPrevisto = Math.round(((inicioOperacaoMs - etaMs) / 3600000) * 10) / 10;
        blocos.push({
          tipo: 'LARANJA',
          label: `Fundeio Previsto (ETA) • ${duracaoPrevisto}h`,
          inicioIso: toIsoUtc(new Date(etaMs)),
          fimIso: toIsoUtc(new Date(inicioOperacaoMs)),
          duracaoHoras: duracaoPrevisto
        });
      }
    }

    // Bloco Azul de Operação: Conectado perfeitamente ao final do bloco laranja
    const caladoCritico = (navio.calado || 0) > 9.50;
    const duracaoOperacaoHoras = Math.round(tempoTotalHoras * 10) / 10;
    const labelOperacao = caladoCritico
      ? `⚠️ RESTRITO (>9.5m) • ${navio.nome_navio} • ${duracaoOperacaoHoras.toFixed(1)}h`
      : `Operação • ${duracaoOperacaoHoras.toFixed(1)}h`;

    blocos.push({
      tipo: 'AZUL',
      label: labelOperacao,
      inicioIso: toIsoUtc(new Date(inicioOperacaoMs)),
      fimIso: toIsoUtc(new Date(fimOperacaoMs)),
      duracaoHoras: duracaoOperacaoHoras,
      caladoCritico
    });

    // Atualiza o cursor do berço para o próximo navio com folga de manobra
    cursorBercoMs = fimOperacaoMs + DELTA_T_MANOBRA * 3600000;

    // Normaliza status visual de fila se não for vermelho
    if (navio.status_cor !== 'VERMELHO') {
      navio.status_cor = inicioOperacaoMs - nowMs <= 48 * 3600000 ? 'LARANJA' : 'AZUL';
    }

    navio.duracao_base_horas = duracaoBaseHoras;
    navio.horas_chuva = horasChuva;
    navio.duracao_estimada_horas = tempoTotalHoras;
    navio.delta_t_manobra = DELTA_T_MANOBRA;
    navio.inicio_atracacao = toIsoUtc(new Date(inicioOperacaoMs));
    navio.fim_atracacao = toIsoUtc(new Date(fimOperacaoMs));
    navio.blocos = blocos;

    totalHorasOcupadasBerco += tempoTotalHoras;
    naviosFilaProcessados.push(navio);
  }

  // 4. REORDENAÇÃO FINAL EM CASCATA TEMPORAL ESTRITA (WATERFALL)
  // Ordena a fila de espera estritamente pelo início da operação no cais (inicio_atracacao)
  naviosFilaProcessados.sort((a, b) => {
    const startA = parseDateIso(a.inicio_atracacao)?.getTime() || 0;
    const startB = parseDateIso(b.inicio_atracacao)?.getTime() || 0;
    return startA - startB;
  });

  // Reatribuição rigorosa da numeração da fila sequencial:
  // Linha 1: Navio no berço (se houver)
  // Linha 2, 3, 4...: Sequência cronológica exata de atendimento no berço
  const naviosProcessados: NavioLineup[] = [];
  if (navioVerdeProcessado) {
    navioVerdeProcessado.ordem_fila = 1;
    naviosProcessados.push(navioVerdeProcessado);
  }

  naviosFilaProcessados.forEach((item, index) => {
    item.ordem_fila = navioVerdeProcessado ? index + 2 : index + 1;
    const blocoAzul = item.blocos?.find((b) => b.tipo === 'AZUL');
    if (blocoAzul) {
      const caladoCritico = (item.calado || 0) > 9.50;
      blocoAzul.caladoCritico = caladoCritico;
      blocoAzul.label = caladoCritico
        ? `⚠️ RESTRITO (>9.5m) • ${item.nome_navio} • ${Number(blocoAzul.duracaoHoras).toFixed(1)}h`
        : `Operação • ${Number(blocoAzul.duracaoHoras).toFixed(1)}h`;
    }
    naviosProcessados.push(item);
  });

  // 4.1. Análise Náutica de Restrição de Calado e Maré da DHN (São Sebastião)
  for (const n of naviosProcessados) {
    n.restricao_mare = analisarRestricaoMareNavio(n, n.inicio_atracacao, n.fim_atracacao);
  }

  // 4. Persistir as janelas calculadas, status corrigido e ordem da fila diretamente no PostgreSQL
  for (const n of naviosProcessados) {
    if (n.id) {
      await sql`
        UPDATE lineup_navios SET
          ordem_fila = ${n.ordem_fila},
          status_cor = ${n.status_cor},
          inicio_atracacao = ${n.inicio_atracacao ?? null},
          fim_atracacao = ${n.fim_atracacao ?? null}
        WHERE id = ${n.id}
      `;
    }
  }

  // 5. Taxa de ocupação do berço calculada sobre o horizonte operacional (30 dias / 720h)
  const horasMes = 720;
  const taxaOcupacao = Math.min(100, Math.round((totalHorasOcupadasBerco / horasMes) * 1000) / 10);

  // Total de navios com espera ativa (bloco VERMELHO ou LARANJA)
  const totalEmEspera = naviosProcessados.filter(
    (n) =>
      n.status_cor !== 'VERDE' &&
      n.blocos &&
      n.blocos.some((b) => b.tipo === 'VERMELHO' || b.tipo === 'LARANJA')
  ).length;

  // Sincroniza a tábua de marés da DHN no PostgreSQL para a janela operacional
  await sincronizarTabuaMaresNoBanco(agora, new Date(agora.getTime() + 35 * 24 * 3600 * 1000));

  const resumo: ResumoOperacional = {
    taxa_ocupacao_berco: taxaOcupacao,
    total_navios: naviosProcessados.length,
    navios_em_operacao: naviosProcessados.filter((n) => n.status_cor === 'VERDE').length,
    navios_fundeados: totalEmEspera,
    horas_ocupadas: Math.round(totalHorasOcupadasBerco * 10) / 10,
    volume_total_t: Math.round(totalVolumeT * 10) / 10
  };

  return {
    navios: naviosProcessados,
    operacional: resumo
  };
}
