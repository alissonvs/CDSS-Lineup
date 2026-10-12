import { getDatabase } from '../database/connection.js';
import {
  NavioLineup,
  ResumoOperacional,
  PranchaProdutividade,
  TimelineBlock
} from '../types/index.js';
import { obterHorasChuva } from './weather.js';
import {
  analisarRestricaoMareNavio,
  sincronizarTabuaMaresNoBanco,
  obterCaladosOperacionaisNavio
} from './tideService.js';

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
 * Calcula a desatracação dinâmica de um navio em operação no berço (status_cor = 'VERDE')
 * com base no progresso percentual real, volume remanescente e ritmo operacional efetivo (Run-Rate)
 */
export async function calcularDesatracacaoDinamicaNavioVerde(
  navio: NavioLineup,
  pranchas: Record<string, PranchaProdutividade>,
  berthedAtMs: number,
  agora: Date
): Promise<{
  etdProjetadoMs: number;
  duracaoBaseHoras: number;
  horasChuva: number;
  duracaoTotalHoras: number;
  volumeRestanteT: number;
  taxaEfetivaTHora: number;
  tempoRestanteHoras: number;
  metodo: 'PROGRESSO_REAL' | 'TEORICO';
}> {
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
  const pmdHoraTeorica = pmdEfetiva / 24.0;
  const volumeTotal = Math.max(1, navio.volume_t || 15000);

  const progresso = (navio.progresso_operacao !== null && navio.progresso_operacao !== undefined)
    ? Math.max(0, Math.min(100, Number(navio.progresso_operacao)))
    : null;

  const nowMs = agora.getTime();
  const horasDecorridas = Math.max(0.5, (nowMs - berthedAtMs) / 3600000);

  // Cenário 1: Navio com operação concluída ou em fase final de desamarração (>= 98%)
  if (progresso !== null && progresso >= 98) {
    const tempoResidualManobra = 1.5; // 1h30 para desamarração e desatracação
    const etdMs = nowMs + tempoResidualManobra * 3600000;
    const duracaoTotal = Math.round(((etdMs - berthedAtMs) / 3600000) * 10) / 10;
    return {
      etdProjetadoMs: etdMs,
      duracaoBaseHoras: duracaoTotal,
      horasChuva: 0,
      duracaoTotalHoras: duracaoTotal,
      volumeRestanteT: 0,
      taxaEfetivaTHora: Math.round(pmdHoraTeorica * 10) / 10,
      tempoRestanteHoras: tempoResidualManobra,
      metodo: 'PROGRESSO_REAL'
    };
  }

  // Cenário 2: Navio com progresso registrado (> 0% e < 98%)
  if (progresso !== null && progresso > 0) {
    const volumeOperado = (volumeTotal * progresso) / 100.0;
    const volumeRestante = Math.max(0, volumeTotal - volumeOperado);

    // Avaliação da taxa efetiva de operação (Run-Rate)
    let taxaEfetiva = pmdHoraTeorica;
    if (horasDecorridas >= 3.0 && progresso >= 5) {
      const taxaObservada = volumeOperado / horasDecorridas;
      // Ponderação suavizada: quanto mais tempo decorrido, mais representativa é a taxa observada
      const alpha = Math.min(0.85, horasDecorridas / 24.0);
      taxaEfetiva = alpha * taxaObservada + (1 - alpha) * pmdHoraTeorica;
      // Clamping de salvaguarda operacional (entre 35% e 300% da PMD teórica)
      taxaEfetiva = Math.max(pmdHoraTeorica * 0.35, Math.min(pmdHoraTeorica * 3.0, taxaEfetiva));
    }

    const duracaoRestanteBaseHoras = Math.round((volumeRestante / taxaEfetiva) * 10) / 10;

    // Chuva futura projetada a partir de AGORA até o fim estimado da operação
    let horasChuvaFutura = 0;
    const fimEstimadoProvisorio = new Date(nowMs + (duracaoRestanteBaseHoras + DELTA_T_MANOBRA) * 3600000);
    if (prancha.sensivel_chuva === 1) {
      horasChuvaFutura = await obterHorasChuva(agora, fimEstimadoProvisorio);
    }

    const tempoRestanteTotalHoras = Math.round((duracaoRestanteBaseHoras + horasChuvaFutura + DELTA_T_MANOBRA) * 10) / 10;
    const etdMs = nowMs + tempoRestanteTotalHoras * 3600000;
    const duracaoTotalGeral = Math.round(((etdMs - berthedAtMs) / 3600000) * 10) / 10;

    return {
      etdProjetadoMs: etdMs,
      duracaoBaseHoras: Math.round((volumeTotal / taxaEfetiva) * 10) / 10,
      horasChuva: horasChuvaFutura,
      duracaoTotalHoras: duracaoTotalGeral,
      volumeRestanteT: Math.round(volumeRestante * 10) / 10,
      taxaEfetivaTHora: Math.round(taxaEfetiva * 10) / 10,
      tempoRestanteHoras: tempoRestanteTotalHoras,
      metodo: 'PROGRESSO_REAL'
    };
  }

  // Cenário 3: Fallback padrão (progresso = 0% ou não informado)
  const duracaoBaseHoras = Math.round((volumeTotal / pmdHoraTeorica) * 10) / 10;
  const fimProvisorio = new Date(berthedAtMs + (duracaoBaseHoras + DELTA_T_MANOBRA) * 3600000);
  let horasChuva = 0;
  if (prancha.sensivel_chuva === 1) {
    horasChuva = await obterHorasChuva(new Date(berthedAtMs), fimProvisorio);
  }
  const tempoTotalHoras = duracaoBaseHoras + horasChuva + DELTA_T_MANOBRA;
  const etdMs = berthedAtMs + Math.max(8, tempoTotalHoras) * 3600000;
  const tempoRestante = Math.max(1, Math.round(((etdMs - nowMs) / 3600000) * 10) / 10);

  return {
    etdProjetadoMs: etdMs,
    duracaoBaseHoras,
    horasChuva,
    duracaoTotalHoras: Math.round(tempoTotalHoras * 10) / 10,
    volumeRestanteT: volumeTotal,
    taxaEfetivaTHora: Math.round(pmdHoraTeorica * 10) / 10,
    tempoRestanteHoras: tempoRestante,
    metodo: 'TEORICO'
  };
}

/**
 * Faz o parsing rigoroso de datas para objetos Date universais (UTC).
 * - Se a string já tiver indicação de fuso (Z, +, ou offset -03:00), preserva o fuso.
 * - Se for data/hora local sem fuso (ex: SISPORT ou input manual "2026-10-15T12:00:00"),
 *   interpreta no fuso regulamentar do Porto de São Sebastião: Horário de Brasília (BRT, UTC-3).
 */
export function parseDateIso(str?: string | null): Date | null {
  if (!str) return null;
  const s = str.trim();
  if (!s) return null;
  if (s.endsWith('Z') || s.includes('+') || (s.lastIndexOf('-') > 7)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const isoFormatted = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(`${isoFormatted}-03:00`);
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

  // 0. Carregar manobras e resumo de tráfego da Praticagem de São Sebastião (SP Pilots)
  let praticagemManobras: any[] = [];
  let praticagemResumo: any[] = [];
  try {
    praticagemManobras = await sql`
      SELECT id, sp_manobra_id, categoria, categoria_label, cor_fundo, nome_navio, imo,
             tipo_manobra, local_origem, local_destino, horario_str, horario_iso,
             vinculo_lineup_imo, calado
      FROM praticagem_manobras
      ORDER BY id ASC
    `;
    praticagemResumo = await sql`
      SELECT tipo, navio, berco, data_hora_str, data_hora_iso, vinculo_lineup_imo
      FROM praticagem_resumo_porto
    `;
  } catch (errPrat) {
    console.warn('[Engine] Aviso ao carregar tabelas da Praticagem:', errPrat);
  }

  // Funções utilitárias de correlação com a Praticagem
  const normalizarNome = (s?: string | null) => (s || '').trim().toUpperCase().replace(/\s+/g, ' ');

  const getManobrasNavio = (n: NavioLineup) => {
    const nomeN = normalizarNome(n.nome_navio);
    return praticagemManobras.filter((m) => {
      const matchImo = (m.vinculo_lineup_imo && m.vinculo_lineup_imo === n.imo) || (m.imo && m.imo === n.imo);
      if (matchImo) return true;
      const nomeM = normalizarNome(m.nome_navio);
      return nomeN.length >= 4 && (nomeN === nomeM || nomeM.includes(nomeN) || nomeN.includes(nomeM));
    });
  };

  const getResumoNavio = (n: NavioLineup) => {
    const nomeN = normalizarNome(n.nome_navio);
    return praticagemResumo.filter((r) => {
      const matchImo = r.vinculo_lineup_imo && r.vinculo_lineup_imo === n.imo;
      if (matchImo) return true;
      const nomeR = normalizarNome(r.navio);
      return nomeN.length >= 4 && (nomeN === nomeR || nomeR.includes(nomeN) || nomeN.includes(nomeR));
    });
  };

  // Identifica se um navio tem manobra de entrada agendada especificamente para o CAIS comercial
  const getManobraEntradaCais = (n: NavioLineup) => {
    const mbs = getManobrasNavio(n);
    return mbs.find((m) => {
      if (m.categoria === 'CANCELADAS') return false;
      const ehEntrada = m.tipo_manobra === 'E';
      const ehMudancaCais = m.tipo_manobra === 'M' && (m.local_destino || '').toUpperCase().includes('CAIS');
      const entraNoCais = (m.local_origem || '').toUpperCase().includes('CAIS') || (m.local_destino || '').toUpperCase().includes('CAIS');
      return (ehEntrada && entraNoCais) || ehMudancaCais;
    });
  };

  // Identifica manobra de saída (desatracação) do CAIS comercial
  const getManobraSaidaCais = (n: NavioLineup) => {
    const mbs = getManobrasNavio(n);
    return mbs.find((m) => {
      if (m.categoria === 'CANCELADAS') return false;
      const ehSaida = m.tipo_manobra === 'S';
      const saiDoCais = !m.local_origem || (m.local_origem || '').toUpperCase().includes('CAIS');
      return ehSaida && saiDoCais;
    });
  };

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
  // Navios com manobra de entrada no CAIS agendada na Praticagem têm prioridade absoluta de berço!
  naviosFila.sort((a, b) => {
    // 1. Prioridade operacional para navio com manobra de entrada no CAIS na Praticagem
    const mEntradaA = (a.ajuste_praticagem_ativo ?? 1) !== 0 ? getManobraEntradaCais(a) : null;
    const mEntradaB = (b.ajuste_praticagem_ativo ?? 1) !== 0 ? getManobraEntradaCais(b) : null;

    if (mEntradaA && !mEntradaB) return -1;
    if (!mEntradaA && mEntradaB) return 1;
    if (mEntradaA && mEntradaB) {
      const tA = parseDateIso(mEntradaA.horario_iso)?.getTime() || 0;
      const tB = parseDateIso(mEntradaB.horario_iso)?.getTime() || 0;
      if (tA !== tB) return tA - tB;
    }

    // 2. Navios prontos/disponíveis no porto (ETA <= agora ou fundeados) têm precedência
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

    // Tempo de início da operação no cais comercial:
    // Prioridade máxima: inicio_operacao (editado manualmente ou preenchido automaticamente via AIS)
    const horasJaOperadasMs = 12 * 3600 * 1000;
    let berthedAtMs = nowMs - horasJaOperadasMs;

    // Manobra de atracação na Praticagem (M ou E)
    const manobrasVerde = getManobrasNavio(navio);
    const manobraAtracacaoVerde = manobrasVerde.find(
      (m) => (m.tipo_manobra === 'M' || m.tipo_manobra === 'E') &&
             ((m.local_destino || '').toUpperCase().includes('CAIS') || (m.local_origem || '').toUpperCase().includes('CAIS'))
    );
    const manobraSaidaVerde = getManobraSaidaCais(navio);

    // Integração de calados de entrada e saída informados na Praticagem
    if (manobraAtracacaoVerde?.calado && !navio.calado_entrada) {
      navio.calado_entrada = Number(manobraAtracacaoVerde.calado);
    }
    if (manobraSaidaVerde?.calado && !navio.calado_saida) {
      navio.calado_saida = Number(manobraSaidaVerde.calado);
    }
    const caladosVerde = obterCaladosOperacionaisNavio(navio);
    navio.calado_entrada = caladosVerde.caladoEntrada;
    navio.calado_saida = caladosVerde.caladoSaida;
    navio.calado = caladosVerde.caladoMaximo;

    if (navio.inicio_operacao) {
      const parsedInicioOp = parseDateIso(navio.inicio_operacao);
      if (parsedInicioOp) {
        berthedAtMs = parsedInicioOp.getTime();
      }
    } else if (manobraAtracacaoVerde && manobraAtracacaoVerde.horario_iso) {
      const parsedPrat = parseDateIso(manobraAtracacaoVerde.horario_iso);
      if (parsedPrat) {
        berthedAtMs = parsedPrat.getTime();
      }
    } else if (navio.inicio_atracacao) {
      const parsedInicio = parseDateIso(navio.inicio_atracacao);
      if (parsedInicio && parsedInicio.getTime() <= nowMs - 4 * 3600 * 1000) {
        berthedAtMs = parsedInicio.getTime();
      }
    }

    const resultadoDinamico = await calcularDesatracacaoDinamicaNavioVerde(
      navio,
      pranchas,
      berthedAtMs,
      agora
    );

    const duracaoBaseHoras = resultadoDinamico.duracaoBaseHoras;
    const horasChuva = resultadoDinamico.horasChuva;
    const tempoTotalHoras = resultadoDinamico.duracaoTotalHoras;

    // Duração de cais projetada / Desatracação prevista
    let etdProjetadoMs: number;
    // Se o navio tiver manobra de desatracação (S) agendada na Praticagem e o ajuste automático estiver ativo:
    if (manobraSaidaVerde && (navio.ajuste_praticagem_ativo ?? 1) !== 0 && manobraSaidaVerde.horario_iso) {
      const parsedSaida = parseDateIso(manobraSaidaVerde.horario_iso);
      if (parsedSaida) {
        etdProjetadoMs = parsedSaida.getTime();
        navio.origem_previsao_fim = 'PRATICAGEM';
        navio.manobra_praticagem_id = manobraSaidaVerde.id;
        navio.manobra_praticagem_str = `Desatracação confirmada pela Praticagem em ${manobraSaidaVerde.horario_str}`;
      } else {
        etdProjetadoMs = resultadoDinamico.etdProjetadoMs;
        navio.origem_previsao_fim = 'CALCULADO';
      }
    } else if (navio.origem_previsao_fim === 'MANUAL' && navio.fim_atracacao) {
      const parsedFim = parseDateIso(navio.fim_atracacao);
      etdProjetadoMs = parsedFim ? parsedFim.getTime() : resultadoDinamico.etdProjetadoMs;
      navio.origem_previsao_fim = 'MANUAL';
    } else {
      etdProjetadoMs = resultadoDinamico.etdProjetadoMs;
      navio.origem_previsao_fim = 'CALCULADO';
    }

    navio.volume_restante_t = resultadoDinamico.volumeRestanteT;
    navio.taxa_efetiva_t_hora = resultadoDinamico.taxaEfetivaTHora;
    navio.tempo_restante_horas = resultadoDinamico.tempoRestanteHoras;

    // Determinação precisa dos 4 Marcos Temporais do Navio no Berço
    // Marco 3 (Início Operação):
    const m3 = berthedAtMs;
    // Marco 4 (Desatracação Prevista):
    const m4 = etdProjetadoMs;
    // Marco 2 (Chegada ao Fundeio):
    let m2 = navio.chegada_fundeio ? (parseDateIso(navio.chegada_fundeio)?.getTime() || (m3 - 28 * 3600000)) : (m3 - 28 * 3600000);
    if (m2 >= m3) m2 = m3 - 18 * 3600000;
    // Marco 1 (Previsão Oficial SISPORT):
    let m1 = navio.eta_previsto ? (parseDateIso(navio.eta_previsto)?.getTime() || (m2 - 14 * 3600000)) : (m2 - 14 * 3600000);
    if (m1 >= m2) m1 = m2 - 14 * 3600000;

    const blocos: TimelineBlock[] = [];
    const duracaoBloco1 = Math.round(((m2 - m1) / 3600000) * 10) / 10;
    const duracaoBloco2 = Math.round(((m3 - m2) / 3600000) * 10) / 10;
    const duracaoBloco3 = Math.round(((m4 - m3) / 3600000) * 10) / 10;

    // Bloco 1: Laranja (PREVISTO SISPORT ➔ FUNDEIO)
    blocos.push({
      tipo: 'PREVISTO_FUNDEIO',
      label: `PREVISTO SISPORT ➔ FUNDEIO`,
      inicioIso: toIsoUtc(new Date(m1)),
      fimIso: toIsoUtc(new Date(m2)),
      duracaoHoras: duracaoBloco1
    });

    // Bloco 2: Vermelho (⚓ FUNDEADO ➔ INÍCIO OPERAÇÃO)
    blocos.push({
      tipo: 'FUNDEADO_OPERACAO',
      label: `⚓ FUNDEADO ➔ INÍCIO OPERAÇÃO`,
      inicioIso: toIsoUtc(new Date(m2)),
      fimIso: toIsoUtc(new Date(m3)),
      duracaoHoras: duracaoBloco2
    });

    // Bloco 3: Verde (⚙ INÍCIO OPERAÇÃO ➔ DESATRACAÇÃO)
    const labelVerde = (navio.progresso_operacao !== null && navio.progresso_operacao !== undefined && Number(navio.progresso_operacao) > 0)
      ? `⚙ EM OPERAÇÃO (${Number(navio.progresso_operacao).toFixed(0)}%) ➔ DESATRACAÇÃO`
      : `⚙ INÍCIO OPERAÇÃO ➔ DESATRACAÇÃO`;

    blocos.push({
      tipo: 'OPERACAO_DESATRACACAO',
      label: labelVerde,
      inicioIso: toIsoUtc(new Date(m3)),
      fimIso: toIsoUtc(new Date(m4)),
      duracaoHoras: duracaoBloco3,
      caladoCritico: false
    });

    navio.marcos = [
      { id: 'previsaoSisport', label: 'Previsão SISPORT', dataIso: toIsoUtc(new Date(m1)) },
      { id: 'fundeio', label: 'Fundeio', dataIso: toIsoUtc(new Date(m2)) },
      { id: 'inicioOperacao', label: 'Início Operação', dataIso: toIsoUtc(new Date(m3)) },
      { id: 'desatracacao', label: 'Prevista Desatracação', dataIso: toIsoUtc(new Date(m4)) }
    ];

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

    // Verificar se o navio consta como FUNDEADO na Praticagem
    const resumoNavio = getResumoNavio(navio);
    const estaFundeadoPraticagem = resumoNavio.some((r) => r.tipo === 'FUNDEADOS');
    if (estaFundeadoPraticagem && navio.status_cor !== 'VERDE') {
      navio.status_cor = 'VERMELHO';
      if (!navio.chegada_fundeio) {
        navio.chegada_fundeio = toIsoUtc(new Date(nowMs - 6 * 3600000));
      }
    }

    // Verificar manobras de entrada e saída no CAIS na Praticagem
    const manobraEntrada = (navio.ajuste_praticagem_ativo ?? 1) !== 0 ? getManobraEntradaCais(navio) : null;
    const manobraSaida = (navio.ajuste_praticagem_ativo ?? 1) !== 0 ? getManobraSaidaCais(navio) : null;

    if (manobraEntrada?.calado && !navio.calado_entrada) {
      navio.calado_entrada = Number(manobraEntrada.calado);
    }
    if (manobraSaida?.calado && !navio.calado_saida) {
      navio.calado_saida = Number(manobraSaida.calado);
    }
    const caladosFila = obterCaladosOperacionaisNavio(navio);
    navio.calado_entrada = caladosFila.caladoEntrada;
    navio.calado_saida = caladosFila.caladoSaida;
    navio.calado = caladosFila.caladoMaximo;

    let inicioOperacaoMs = cursorBercoMs;
    if (manobraEntrada && manobraEntrada.horario_iso) {
      const parsedPratEntrada = parseDateIso(manobraEntrada.horario_iso);
      if (parsedPratEntrada) {
        // Respeita a liberação física do berço pelo navio anterior (cursorBercoMs = fim do anterior + 2h)
        inicioOperacaoMs = Math.max(cursorBercoMs, parsedPratEntrada.getTime());
        navio.manobra_praticagem_id = manobraEntrada.id;
        navio.manobra_praticagem_str = `Entrada agendada na Praticagem (${manobraEntrada.categoria_label}): ${manobraEntrada.horario_str}`;
      }
    } else if (navio.inicio_operacao) {
      const parsedOp = parseDateIso(navio.inicio_operacao);
      if (parsedOp) {
        inicioOperacaoMs = Math.max(cursorBercoMs, parsedOp.getTime());
      }
    } else {
      const etaD = parseDateIso(navio.chegada_fundeio || navio.eta_previsto) || agora;
      inicioOperacaoMs = Math.max(cursorBercoMs, etaD.getTime());
    }
    const inicioOperacaoDate = new Date(inicioOperacaoMs);

    const { duracaoBaseHoras, horasChuva, tempoTotalHoras } = await calcularDuracaoNavio(
      navio,
      pranchas,
      inicioOperacaoDate
    );

    let fimOperacaoMs: number;

    if (manobraSaida && manobraSaida.horario_iso) {
      const parsedSaida = parseDateIso(manobraSaida.horario_iso);
      if (parsedSaida && parsedSaida.getTime() > inicioOperacaoMs) {
        fimOperacaoMs = parsedSaida.getTime();
        navio.origem_previsao_fim = 'PRATICAGEM';
        navio.manobra_praticagem_id = manobraSaida.id;
        navio.manobra_praticagem_str = `Saída agendada na Praticagem (${manobraSaida.categoria_label}): ${manobraSaida.horario_str}`;
      } else {
        fimOperacaoMs = inicioOperacaoMs + tempoTotalHoras * 3600000;
        navio.origem_previsao_fim = 'CALCULADO';
      }
    } else if (navio.origem_previsao_fim === 'MANUAL' && navio.fim_atracacao) {
      const parsedFim = parseDateIso(navio.fim_atracacao);
      if (parsedFim && parsedFim.getTime() > inicioOperacaoMs) {
        fimOperacaoMs = parsedFim.getTime();
      } else {
        fimOperacaoMs = inicioOperacaoMs + tempoTotalHoras * 3600000;
        navio.origem_previsao_fim = 'CALCULADO';
      }
    } else {
      fimOperacaoMs = inicioOperacaoMs + tempoTotalHoras * 3600000;
      navio.origem_previsao_fim = 'CALCULADO';
    }

    const caladoCritico = false;

    // Determinação precisa dos 4 Marcos Temporais da Embarcação na Fila
    // Marco 3 (Início Operação):
    const m3 = inicioOperacaoMs;
    // Marco 4 (Desatracação Prevista):
    const m4 = fimOperacaoMs;
    // Marco 2 (Chegada ao Fundeio):
    let m2 = navio.chegada_fundeio
      ? (parseDateIso(navio.chegada_fundeio)?.getTime() || (m3 - 28 * 3600000))
      : (m3 - 28 * 3600000);
    if (m2 >= m3) m2 = m3 - 18 * 3600000;

    // Marco 1 (Previsão Oficial SISPORT):
    let m1 = navio.eta_previsto ? (parseDateIso(navio.eta_previsto)?.getTime() || (m2 - 14 * 3600000)) : (m2 - 14 * 3600000);
    if (m1 >= m2) m1 = m2 - 14 * 3600000;

    const blocos: TimelineBlock[] = [];
    const duracaoBloco1 = Math.round(((m2 - m1) / 3600000) * 10) / 10;
    const duracaoBloco2 = Math.round(((m3 - m2) / 3600000) * 10) / 10;
    const duracaoBloco3 = Math.round(((m4 - m3) / 3600000) * 10) / 10;

    // Bloco 1: Laranja (PREVISTO SISPORT ➔ FUNDEIO)
    blocos.push({
      tipo: 'PREVISTO_FUNDEIO',
      label: `PREVISTO SISPORT ➔ FUNDEIO`,
      inicioIso: toIsoUtc(new Date(m1)),
      fimIso: toIsoUtc(new Date(m2)),
      duracaoHoras: duracaoBloco1
    });

    // Bloco 2: Vermelho (⚓ FUNDEADO ➔ INÍCIO OPERAÇÃO)
    blocos.push({
      tipo: 'FUNDEADO_OPERACAO',
      label: `⚓ FUNDEADO ➔ INÍCIO OPERAÇÃO`,
      inicioIso: toIsoUtc(new Date(m2)),
      fimIso: toIsoUtc(new Date(m3)),
      duracaoHoras: duracaoBloco2
    });

    // Bloco 3: Verde/Azul (⚙ INÍCIO OPERAÇÃO ➔ DESATRACAÇÃO)
    blocos.push({
      tipo: 'OPERACAO_DESATRACACAO',
      label: `⚙ INÍCIO OPERAÇÃO ➔ DESATRACAÇÃO`,
      inicioIso: toIsoUtc(new Date(m3)),
      fimIso: toIsoUtc(new Date(m4)),
      duracaoHoras: duracaoBloco3,
      caladoCritico
    });

    navio.marcos = [
      { id: 'previsaoSisport', label: 'Previsão SISPORT', dataIso: toIsoUtc(new Date(m1)) },
      { id: 'fundeio', label: 'Fundeio', dataIso: toIsoUtc(new Date(m2)) },
      { id: 'inicioOperacao', label: 'Início Operação', dataIso: toIsoUtc(new Date(m3)) },
      { id: 'desatracacao', label: 'Prevista Desatracação', dataIso: toIsoUtc(new Date(m4)) }
    ];

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
    const rest = analisarRestricaoMareNavio(item, item.inicio_atracacao, item.fim_atracacao);
    item.restricao_mare = rest;

    const blocoOperacao = item.blocos?.find((b) => b.tipo === 'OPERACAO_DESATRACACAO' || b.tipo === 'AZUL');
    if (blocoOperacao) {
      const caladoCritico = rest.temRestricao;
      blocoOperacao.caladoCritico = caladoCritico;
      blocoOperacao.label = caladoCritico
        ? `⚠️ RESTRITO (${rest.caladoEntrada}m) • INÍCIO OP ➔ DESATRAC.`
        : `⚙ INÍCIO OPERAÇÃO ➔ DESATRACAÇÃO`;
    }
    naviosProcessados.push(item);
  });

  // 4.1. Análise Náutica de Restrição de Calado e Maré da DHN (São Sebastião)
  for (const n of naviosProcessados) {
    n.restricao_mare = analisarRestricaoMareNavio(n, n.inicio_atracacao, n.fim_atracacao);
  }

  // 4. Persistir as janelas calculadas, status corrigido, calados e ordem da fila diretamente no PostgreSQL
  for (const n of naviosProcessados) {
    if (n.id) {
      await sql`
        UPDATE lineup_navios SET
          ordem_fila = ${n.ordem_fila},
          status_cor = ${n.status_cor},
          calado = ${n.calado ?? null},
          calado_entrada = ${n.calado_entrada ?? null},
          calado_saida = ${n.calado_saida ?? null},
          inicio_atracacao = ${n.inicio_atracacao ?? null},
          fim_atracacao = ${n.fim_atracacao ?? null},
          chegada_fundeio = ${n.chegada_fundeio ?? null},
          origem_previsao_fim = ${n.origem_previsao_fim ?? 'CALCULADO'},
          manobra_praticagem_id = ${n.manobra_praticagem_id ?? null},
          manobra_praticagem_str = ${n.manobra_praticagem_str ?? null}
        WHERE id = ${n.id}
      `;
    }
  }

  // 5. Taxa de ocupação do berço calculada sobre o horizonte operacional (30 dias / 720h)
  const horasMes = 720;
  const taxaOcupacao = Math.min(100, Math.round((totalHorasOcupadasBerco / horasMes) * 1000) / 10);

  // Total de navios com espera ativa (bloco FUNDEADO_OPERACAO, VERMELHO ou LARANJA)
  const totalEmEspera = naviosProcessados.filter(
    (n) =>
      n.status_cor !== 'VERDE' &&
      n.blocos &&
      n.blocos.some((b) => b.tipo === 'FUNDEADO_OPERACAO' || b.tipo === 'VERMELHO' || b.tipo === 'LARANJA')
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
