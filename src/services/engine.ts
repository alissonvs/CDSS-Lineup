import { getDatabase } from '../database/connection.js';
import {
  NavioLineup,
  ResumoOperacional,
  PranchaProdutividade,
  TimelineBlock,
  SnapshotHistoricoPrevisao,
  MetricasAcuraciaPrevisao
} from '../types/index.js';
import { obterHorasChuva } from './weather.js';
import {
  analisarRestricaoMareNavio,
  sincronizarTabuaMaresNoBanco,
  obterCaladosOperacionaisNavio,
  encontrarProximaJanelaPreamarCompativel
} from './tideService.js';
import { identificarBercoPorCoordenadas } from './bercoGeoService.js';

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
 * Catálogo e calibrador inteligente de produtividade por mercadoria (Porto de São Sebastião)
 * Implementa categorização realista de PMD e fallbacks específicos por categoria (Melhoria 4.2)
 */
export function obterPranchaParaMercadoria(
  mercadoriaRaw: string,
  pranchas: Record<string, PranchaProdutividade> = {}
): PranchaProdutividade {
  const merc = (mercadoriaRaw || '').toLowerCase().trim();

  // 1. Match direto ou substring nas pranchas registradas no banco
  for (const [k, v] of Object.entries(pranchas)) {
    const kLow = k.toLowerCase().trim();
    if (kLow === merc || merc.includes(kLow) || kLow.includes(merc)) {
      return v;
    }
  }

  // 2. Normalização sem acentos para categorização portuária especializada
  const mercNorm = merc
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // A. Granéis Vegetais / Sólidos Agrícolas (Trigo, Cevada, Malte, Soja, Milho, Grãos)
  // Produtividade real CDSS: 4.500 a 5.000 t/dia com descarregadores/guindastes
  if (
    mercNorm.includes('trigo') ||
    mercNorm.includes('malte') ||
    mercNorm.includes('cevada') ||
    mercNorm.includes('soja') ||
    mercNorm.includes('milho') ||
    mercNorm.includes('grao')
  ) {
    return {
      mercadoria: mercadoriaRaw || 'Granéis Vegetais',
      prancha_minima_dia: 3000,
      pmd_historica: 4500,
      sensivel_chuva: 1
    };
  }

  // B. Carga Viva / Pecuária (Bovinos, Animais Vivos)
  // Produtividade real CDSS: ~3.500 t/dia (embarque por passarelas contínuas; insensível a chuva)
  if (
    mercNorm.includes('animal') ||
    mercNorm.includes('vivos') ||
    mercNorm.includes('viva') ||
    mercNorm.includes('bovino') ||
    mercNorm.includes('gado')
  ) {
    return {
      mercadoria: mercadoriaRaw || 'Animais Vivos',
      prancha_minima_dia: 2500,
      pmd_historica: 3500,
      sensivel_chuva: 0
    };
  }

  // C. Granéis Químicos e Minerais Sólidos (Barrilha, Alumina Calcinada, Coque, Fertilizantes)
  // Produtividade real CDSS: 3.200 a 3.800 t/dia
  if (
    mercNorm.includes('barrilha') ||
    mercNorm.includes('alumina') ||
    mercNorm.includes('coque') ||
    mercNorm.includes('fertiliz') ||
    mercNorm.includes('adubo') ||
    mercNorm.includes('sulfato') ||
    mercNorm.includes('cloreto')
  ) {
    const isBarrilha = mercNorm.includes('barrilha');
    return {
      mercadoria: mercadoriaRaw || (isBarrilha ? 'Barrilha' : 'Granéis Minerais'),
      prancha_minima_dia: isBarrilha ? 2500 : 2800,
      pmd_historica: isBarrilha ? 3200 : 3800,
      sensivel_chuva: 1
    };
  }

  // D. Carga Projeto / Siderúrgicos / Peças / Breakbulk / Sacaria / Café
  // Produtividade real CDSS: 1.800 a 2.200 t/dia
  if (
    mercNorm.includes('projeto') ||
    mercNorm.includes('peca') ||
    mercNorm.includes('aco') ||
    mercNorm.includes('siderurg') ||
    mercNorm.includes('bobina') ||
    mercNorm.includes('equipamento') ||
    mercNorm.includes('veiculo') ||
    mercNorm.includes('cafe') ||
    mercNorm.includes('sacaria') ||
    mercNorm.includes('container')
  ) {
    return {
      mercadoria: mercadoriaRaw || 'Carga Geral / Projeto',
      prancha_minima_dia: 1500,
      pmd_historica: 2000,
      sensivel_chuva: 0
    };
  }

  // E. Apoio Marítimo / Offshore / Derivados de Petróleo / Combustíveis
  if (
    mercNorm.includes('apoio') ||
    mercNorm.includes('offshore') ||
    mercNorm.includes('oleo') ||
    mercNorm.includes('diesel') ||
    mercNorm.includes('combustivel') ||
    mercNorm.includes('derivado')
  ) {
    return {
      mercadoria: mercadoriaRaw || 'Apoio Marítimo',
      prancha_minima_dia: 2500,
      pmd_historica: 3500,
      sensivel_chuva: 0
    };
  }

  // F. Fallback Carga Geral
  return pranchas['Carga Geral'] || {
    mercadoria: mercadoriaRaw || 'Carga Geral',
    prancha_minima_dia: 1500,
    pmd_historica: 2000,
    sensivel_chuva: 1
  };
}

/**
 * Calibra a produtividade histórica (pmd_historica) de uma mercadoria no banco
 * com base na duração real apurada da operação (Melhoria 4.2)
 */
export async function calibrarPranchaComHistorico(
  mercadoria: string,
  volumeT: number,
  horasReais: number
): Promise<boolean> {
  if (!mercadoria || volumeT <= 0 || horasReais <= 0) return false;

  try {
    const sql = getDatabase();
    const taxaRealDia = (volumeT / horasReais) * 24;

    // Sanidade operacional: entre 300 e 20.000 t/dia
    if (taxaRealDia < 300 || taxaRealDia > 20000) return false;

    const pranchaRef = obterPranchaParaMercadoria(mercadoria);
    const mercKey = pranchaRef.mercadoria;

    const rows = await sql<PranchaProdutividade[]>`
      SELECT * FROM pranchas_produtividade WHERE mercadoria = ${mercKey} LIMIT 1
    `;

    if (rows.length > 0) {
      const atual = rows[0];
      const novaPmd = Math.round(atual.pmd_historica * 0.8 + taxaRealDia * 0.2);
      await sql`
        UPDATE pranchas_produtividade
        SET pmd_historica = ${novaPmd}
        WHERE mercadoria = ${mercKey}
      `;
      console.log(`[CalibracaoPrancha] Calibrada PMD de ${mercKey}: ${atual.pmd_historica} -> ${novaPmd} t/dia (op real: ${Math.round(taxaRealDia)} t/dia)`);
    } else {
      const novaPmd = Math.round(taxaRealDia);
      await sql`
        INSERT INTO pranchas_produtividade (mercadoria, prancha_minima_dia, pmd_historica, sensivel_chuva)
        VALUES (${mercKey}, ${pranchaRef.prancha_minima_dia}, ${novaPmd}, ${pranchaRef.sensivel_chuva})
        ON CONFLICT (mercadoria) DO UPDATE SET pmd_historica = ${novaPmd}
      `;
    }
    return true;
  } catch (err) {
    console.error('[CalibracaoPrancha] Erro ao calibrar prancha:', err);
    return false;
  }
}

/**
 * Calcula a duração de berço de um navio considerando produtividade, chuva e manobra
 */
export async function calcularDuracaoNavio(
  navio: NavioLineup,
  pranchas: Record<string, PranchaProdutividade>,
  inicioEstimado: Date
): Promise<{ duracaoBaseHoras: number; horasChuva: number; tempoTotalHoras: number }> {
  const prancha = obterPranchaParaMercadoria(navio.mercadoria, pranchas);

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
  const prancha = obterPranchaParaMercadoria(navio.mercadoria, pranchas);

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
  let horasChuvaFutura = 0;
  const fimProvisorio = new Date(nowMs + (duracaoBaseHoras + DELTA_T_MANOBRA) * 3600000);
  if (prancha.sensivel_chuva === 1) {
    horasChuvaFutura = await obterHorasChuva(agora, fimProvisorio);
  }
  const tempoRestanteTotalHoras = Math.round((duracaoBaseHoras + horasChuvaFutura + DELTA_T_MANOBRA) * 10) / 10;
  // Como o navio está atracado operando no berço com 0% ou início de operação,
  // todo o volume ainda pendente precisa ser operado a partir do presente:
  const etdMs = nowMs + tempoRestanteTotalHoras * 3600000;
  const duracaoTotalGeral = Math.round(((etdMs - berthedAtMs) / 3600000) * 10) / 10;

  return {
    etdProjetadoMs: etdMs,
    duracaoBaseHoras,
    horasChuva: horasChuvaFutura,
    duracaoTotalHoras: duracaoTotalGeral,
    volumeRestanteT: volumeTotal,
    taxaEfetivaTHora: Math.round(pmdHoraTeorica * 10) / 10,
    tempoRestanteHoras: tempoRestanteTotalHoras,
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
 * Pontuação e peso regulamentar de confiabilidade por categoria da Praticagem (SP Pilots)
 */
export function obterPesoCategoriaManobra(cat?: string | null): number {
  const c = (cat || '').toUpperCase().trim().replace(/\s+/g, '_');
  if (c === 'ENCERRADAS' || c === 'ENCERRADA') return 5;
  if (c === 'EM_ANDAMENTO' || c === 'ANDAMENTO') return 4;
  if (c === 'CONFIRMADAS' || c === 'CONFIRMADA') return 3;
  if (c === 'CONFIRMADAS_AGENTE' || c === 'CONFIRMADAS_PELO_AGENTE' || c === 'CONFIRMADA_AGENTE') return 2;
  if (c === 'SOLICITADAS' || c === 'SOLICITADA') return 1;
  return 0; // CANCELADAS ou desconhecido
}

/**
 * Verifica com rigor se o local refere-se estritamente aos berços do Porto Público de São Sebastião (CDSS).
 * Rejeita explicitamente os píeres Tebar (P1 a P4, Petrobras) e pontos de fundeio/barra (F1 a F7).
 */
export function isBercoPortoPublico(loc?: string | null): boolean {
  if (!loc) return false;
  const l = loc.trim().toUpperCase();
  if (!l) return false;

  // Rejeição expressa de Tebar / Petrobras (P1 a P4) e Fundeios (F1 a F7)
  if (/^P[1-4](\b|\s|$)/.test(l) || l.includes('TEBAR') || l.includes('PETROBRAS') || l.includes('DTSE') || l.includes('PIER 1') || l.includes('PIER 2') || l.includes('PIER 3') || l.includes('PIER 4')) {
    return false;
  }
  if (/^F[1-7](\b|\s|$)/.test(l) || l.includes('FUNDEIO') || l.includes('BARRA') || l.includes('QUARANTINE') || l.includes('ESPERA')) {
    return false;
  }

  // Lista estrita de berços e siglas do Porto Público de São Sebastião (CDSS)
  const padroesPortoPublico = [
    'CAIS',
    'CINT',
    '101',
    '201',
    '202',
    '203',
    '204',
    'CS1',
    'CS2',
    'CN1',
    'CN2',
    'CAIS COMERCIAL',
    'CAIS INTERNO'
  ];

  return padroesPortoPublico.some((p) => l === p || l.includes(p));
}

/**
 * Verifica se um navio é física e operacionalmente compatível com o Berço 202 (Bacia Interna)
 * Requisitos:
 * - LOA <= 75m (extensão da face de acostagem do Berço 202)
 * - Calado operacional <= 6.0m (profundidade ZH 7.0m com UKC mínimo de 0.5m)
 * - Mercadoria não restrita a esteiras/shiploaders de granéis sólidos nem currais de carga viva
 */
export function isCompativelBerco202(navio: NavioLineup): boolean {
  const loa = navio.loa ? Number(navio.loa) : 999;
  const calado = navio.calado ? Number(navio.calado) : (navio.calado_entrada ? Number(navio.calado_entrada) : 999);

  if (loa > 75 || calado > 6.0) {
    return false;
  }

  const merc = (navio.mercadoria || '').toLowerCase();
  // Granéis vegetais/sólidos e Carga Viva requerem infraestrutura exclusiva do Berço 101
  if (
    merc.includes('cevada') ||
    merc.includes('malte') ||
    merc.includes('trigo') ||
    merc.includes('soja') ||
    merc.includes('milho') ||
    merc.includes('granel') ||
    merc.includes('animais') ||
    merc.includes('vivos') ||
    merc.includes('viva') ||
    merc.includes('gado') ||
    merc.includes('boi')
  ) {
    return false;
  }

  return true;
}

interface EngineCache {
  data: {
    navios: NavioLineup[];
    operacional: ResumoOperacional;
  };
  timestamp: number;
}

let engineCache: EngineCache | null = null;
const CACHE_TTL_MS = 20 * 1000; // 20 segundos de TTL para GET /api/lineup
let execucaoEmAndamento: Promise<{ navios: NavioLineup[]; operacional: ResumoOperacional }> | null = null;

/**
 * Invalida o cache do motor em memória, forçando recálculo imediato na próxima chamada
 */
export function invalidarCacheLineup(): void {
  engineCache = null;
}

/**
 * Algoritmo Principal do Motor: Encadeamento de Fila de Berço Único sem Colisão Temporal
 * e Geração Determinística de TimelineBlocks (Verde, Azul, Vermelho, Laranja)
 * 
 * Suporta cache em memória com TTL de 20s e proteção contra concorrência via single-flight lock.
 */
export async function recalcularLineupComMotor(forceRefresh: boolean = false): Promise<{
  navios: NavioLineup[];
  operacional: ResumoOperacional;
}> {
  const agora = Date.now();
  if (!forceRefresh && engineCache && (agora - engineCache.timestamp) < CACHE_TTL_MS) {
    return engineCache.data;
  }

  // Single-flight: se já existe um cálculo em execução, aguarda a mesma Promise
  if (execucaoEmAndamento) {
    return execucaoEmAndamento;
  }

  execucaoEmAndamento = (async () => {
    try {
      const resultado = await executarCalculoMotorInterno();
      engineCache = {
        data: resultado,
        timestamp: Date.now()
      };
      return resultado;
    } finally {
      execucaoEmAndamento = null;
    }
  })();

  return execucaoEmAndamento;
}

async function executarCalculoMotorInterno(): Promise<{
  navios: NavioLineup[];
  operacional: ResumoOperacional;
}> {
  const sql = getDatabase();
  const rawNavios = (
    await sql<NavioLineup[]>`
      SELECT * FROM lineup_navios 
      WHERE (status_sisport != 'DESATRACADO' OR status_sisport IS NULL)
        AND (status_cor = 'VERDE' OR COALESCE(progresso_operacao, 0) < 100)
      ORDER BY COALESCE(ordem_sisport, ordem_fila) ASC, id ASC
    `
  ) as NavioLineup[];

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

  // Verifica com rigor se o local refere-se estritamente aos berços do Porto Público de São Sebastião (CDSS: Cais Comercial, Cais Interno)
  // Rejeita expressamente píeres Tebar (P1 a P4) e fundeios/barra (F1 a F7)
  const isBercoPortoPublicoLocal = (loc?: string | null): boolean => {
    return isBercoPortoPublico(loc);
  };

  // Identifica manobra de entrada agendada para berço do porto público priorizando categoria oficial
  const getManobrasValidasEntrada = (n: NavioLineup) => {
    const mbs = getManobrasNavio(n);
    return mbs.filter((m) => {
      if (m.categoria === 'CANCELADAS') return false;
      const ehEntrada = m.tipo_manobra === 'E';
      const ehMudancaCais = m.tipo_manobra === 'M' && (isBercoPortoPublicoLocal(m.local_destino) || isBercoPortoPublicoLocal(m.local_origem));
      const entraNoCais = isBercoPortoPublicoLocal(m.local_destino) || (ehEntrada && isBercoPortoPublicoLocal(m.local_origem));
      return (ehEntrada && entraNoCais) || ehMudancaCais;
    });
  };

  const getManobraEntradaCais = (n: NavioLineup) => {
    const candidatas = getManobrasValidasEntrada(n);
    if (candidatas.length === 0) return null;

    // Prioridade por categoria: ENCERRADAS > EM_ANDAMENTO > CONFIRMADAS > CONFIRMADAS_AGENTE > SOLICITADAS
    candidatas.sort((a, b) => {
      const pesoA = obterPesoCategoriaManobra(a.categoria);
      const pesoB = obterPesoCategoriaManobra(b.categoria);
      if (pesoA !== pesoB) return pesoB - pesoA;

      const tA = parseDateIso(a.horario_iso)?.getTime() || 0;
      const tB = parseDateIso(b.horario_iso)?.getTime() || 0;
      return tA - tB;
    });

    return candidatas[0];
  };

  // Identifica manobra de saída (desatracação) de berço do porto público priorizando categoria oficial
  const getManobrasValidasSaida = (n: NavioLineup) => {
    const mbs = getManobrasNavio(n);
    return mbs.filter((m) => {
      if (m.categoria === 'CANCELADAS') return false;
      const ehSaida = m.tipo_manobra === 'S';
      const saiDoCais = isBercoPortoPublicoLocal(m.local_origem);
      return ehSaida && saiDoCais;
    });
  };

  const getManobraSaidaCais = (n: NavioLineup) => {
    const candidatas = getManobrasValidasSaida(n);
    if (candidatas.length === 0) return null;

    candidatas.sort((a, b) => {
      const pesoA = obterPesoCategoriaManobra(a.categoria);
      const pesoB = obterPesoCategoriaManobra(b.categoria);
      if (pesoA !== pesoB) return pesoB - pesoA;

      const tA = parseDateIso(a.horario_iso)?.getTime() || 0;
      const tB = parseDateIso(b.horario_iso)?.getTime() || 0;
      return tA - tB;
    });

    return candidatas[0];
  };

  // Momento de referência do sistema: Data/hora atual em tempo real
  const agora = new Date();
  const nowMs = agora.getTime();

  // 1. Identificar todos os navios atualmente no berço (status_cor = 'VERDE')
  // Suporte pleno a múltiplas operações simultâneas (ex: 2 ou mais navios atracados operando)
  const naviosVerdes = rawNavios.filter((n) => n.status_cor === 'VERDE');
  const idsVerdes = new Set(naviosVerdes.map((n) => n.id));

  // Navios aguardando na fila (todos os não-verdes)
  const naviosFila = rawNavios.filter((n) => !idsVerdes.has(n.id));

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
      const ordA = a.ordem_sisport ?? a.ordem_fila ?? 999;
      const ordB = b.ordem_sisport ?? b.ordem_fila ?? 999;
      return ordA - ordB || etaA - etaB;
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
    const ordA = a.ordem_sisport ?? a.ordem_fila ?? 999;
    const ordB = b.ordem_sisport ?? b.ordem_fila ?? 999;
    return etaA - etaB || ordA - ordB;
  });

  const naviosVerdesProcessados: NavioLineup[] = [];
  const finsAtracacaoVerdesMs: number[] = [];
  const naviosFilaProcessados: NavioLineup[] = [];
  let totalHorasOcupadasBerco = 0;
  let totalVolumeT = 0;
  let ultimoFimBerco: Date;

  // 2. Processar todos os navios que já estão operando no cais (status_cor = 'VERDE')
  for (const itemVerde of naviosVerdes) {
    const navio: NavioLineup = { ...itemVerde };
    totalVolumeT += navio.volume_t || 0;

    // Determinação dinâmica do berço para navios atracados (status_cor = 'VERDE'):
    // 1. PRIORIDADE MÁXIMA: Identificação automática por Geofencing e Telemetria AIS (Lat, Lon)
    if (!navio.berco && navio.latitude && navio.longitude && !(navio.latitude === 0 && navio.longitude === 0)) {
      const bercoGeo = identificarBercoPorCoordenadas(
        navio.latitude,
        navio.longitude,
        navio.sog,
        85,
        navio.ais_sincronizado_em || navio.ultima_atualizacao,
        agora
      );
      if (bercoGeo && bercoGeo.dentroTolerancia) {
        navio.berco = bercoGeo.berco;
      }
    }

    // 2. CORRELAÇÃO OFICIAL COM A PRATICAGEM DE SÃO SEBASTIÃO (SP Pilots)
    if (!navio.berco) {
      const resumoNavio = getResumoNavio(navio);
      const entradaAtracada = resumoNavio.find((r) => r.tipo === 'ATRACADOS' || r.berco);
      if (entradaAtracada?.berco) {
        const b = entradaAtracada.berco.toUpperCase();
        if (b.includes('CINT') || b.includes('202')) navio.berco = '202';
        else if (b.includes('201')) navio.berco = '201';
        else if (b.includes('203')) navio.berco = '203';
        else if (b.includes('204')) navio.berco = '204';
        else if (b.includes('CAIS') || b.includes('101')) navio.berco = '101';
      }
    }

    if (!navio.berco) {
      const manobras = getManobrasNavio(navio);
      for (const m of manobras) {
        const loc = `${m.local_destino || ''} ${m.local_origem || ''}`.toUpperCase();
        if (loc.includes('CINT') || loc.includes('202')) {
          navio.berco = '202';
          break;
        } else if (loc.includes('201')) {
          navio.berco = '201';
          break;
        } else if (loc.includes('CAIS') || loc.includes('101')) {
          navio.berco = '101';
          break;
        }
      }
    }

    // 3. ALOCAÇÃO OPERACIONAL DINÂMICA POR CAPACIDADE E DISPONIBILIDADE DE BERÇO
    if (!navio.berco) {
      // Se o Berço 101 (Cais Comercial) já estiver ocupado por outra operação ativa,
      // ou se o navio for de pequeno porte exclusivo para cais interno (LOA <= 80m e calado <= 6.0m):
      const berco101Ocupado = naviosVerdesProcessados.some((v) => v.berco === '101');
      if (berco101Ocupado) {
        navio.berco = '202';
      } else if ((navio.loa && navio.loa <= 80) && (navio.calado && navio.calado <= 6.0)) {
        navio.berco = '202';
      } else {
        navio.berco = '101';
      }
    }

    // Tempo de início da operação no cais comercial:
    // Prioridade máxima: inicio_operacao (editado manualmente ou preenchido automaticamente via AIS)
    const horasJaOperadasMs = 12 * 3600 * 1000;
    let berthedAtMs = nowMs - horasJaOperadasMs;

    // Manobra de atracação na Praticagem (M ou E)
    const manobrasVerde = getManobrasNavio(navio);
    const manobraAtracacaoVerde = manobrasVerde.find(
      (m) => (m.tipo_manobra === 'M' || m.tipo_manobra === 'E') &&
             (isBercoPortoPublico(m.local_destino) || isBercoPortoPublico(m.local_origem))
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
      if (parsedInicio && parsedInicio.getTime() <= nowMs) {
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
        const pesoCat = obterPesoCategoriaManobra(manobraSaidaVerde.categoria);
        navio.origem_previsao_fim = 'PRATICAGEM';
        navio.manobra_praticagem_id = manobraSaidaVerde.id;
        navio.confianca_manobra = pesoCat >= 3 ? 'CONFIRMADA' : 'SOLICITADA';
        navio.categoria_manobra = manobraSaidaVerde.categoria;
        navio.manobra_praticagem_str = `Desatracação (${manobraSaidaVerde.categoria_label || manobraSaidaVerde.categoria}): ${manobraSaidaVerde.horario_str}`;
      } else {
        etdProjetadoMs = resultadoDinamico.etdProjetadoMs;
        navio.origem_previsao_fim = 'CALCULADO';
        navio.confianca_manobra = 'ESTIMADA';
      }
    } else if (navio.origem_previsao_fim === 'MANUAL' && navio.fim_atracacao) {
      const parsedFim = parseDateIso(navio.fim_atracacao);
      etdProjetadoMs = parsedFim ? parsedFim.getTime() : resultadoDinamico.etdProjetadoMs;
      navio.origem_previsao_fim = 'MANUAL';
      navio.confianca_manobra = 'CONFIRMADA';
    } else {
      etdProjetadoMs = resultadoDinamico.etdProjetadoMs;
      navio.origem_previsao_fim = 'CALCULADO';
      navio.confianca_manobra = 'ESTIMADA';
    }

    // SALVAGUARDA INVIOLÁVEL: Navio atracado operando NUNCA pode ter ETD no passado
    // (deve ser no mínimo nowMs + folga residual de manobra de 1.5h)
    etdProjetadoMs = Math.max(etdProjetadoMs, nowMs + 1.5 * 3600000);

    navio.volume_restante_t = resultadoDinamico.volumeRestanteT;
    navio.taxa_efetiva_t_hora = resultadoDinamico.taxaEfetivaTHora;
    navio.tempo_restante_horas = resultadoDinamico.tempoRestanteHoras;

    // Determinação precisa dos 4 Marcos Temporais do Navio no Berço
    const m3 = berthedAtMs;
    const m4 = etdProjetadoMs;
    let m2 = navio.chegada_fundeio ? (parseDateIso(navio.chegada_fundeio)?.getTime() || (m3 - 28 * 3600000)) : (m3 - 28 * 3600000);
    if (m2 >= m3) m2 = m3 - 18 * 3600000;
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
      caladoCritico: false,
      confianca: navio.confianca_manobra || 'CONFIRMADA',
      categoriaPraticagem: navio.categoria_manobra
    });

    navio.marcos = [
      { id: 'previsaoSisport', label: 'Previsão SISPORT', dataIso: toIsoUtc(new Date(m1)) },
      { id: 'fundeio', label: 'Fundeio', dataIso: toIsoUtc(new Date(m2)) },
      { id: 'inicioOperacao', label: 'Início Operação', dataIso: toIsoUtc(new Date(m3)) },
      { id: 'desatracacao', label: 'Prevista Desatracação', dataIso: toIsoUtc(new Date(m4)) }
    ];

    const duracaoTotalGeral = Math.round(((etdProjetadoMs - berthedAtMs) / 3600000) * 10) / 10;
    navio.duracao_base_horas = duracaoBaseHoras;
    navio.horas_chuva = horasChuva;
    navio.duracao_estimada_horas = duracaoTotalGeral;
    navio.delta_t_manobra = DELTA_T_MANOBRA;
    navio.inicio_atracacao = toIsoUtc(new Date(berthedAtMs));
    navio.fim_atracacao = toIsoUtc(new Date(etdProjetadoMs));
    navio.blocos = blocos;

    totalHorasOcupadasBerco += duracaoTotalGeral;
    finsAtracacaoVerdesMs.push(etdProjetadoMs);
    naviosVerdesProcessados.push(navio);
  }

  // Ancoragem determinística multi-berço para a fila de espera (Berço 101 e Berço 202):
  // Inicialização independente dos cursores de cada berço com base nos navios em operação
  const naviosVerdes101 = naviosVerdesProcessados.filter((n) => n.berco === '101');
  let ultimoFim101Ms = nowMs;
  let ultimoFim101EraConfirmado = false;
  if (naviosVerdes101.length > 0) {
    const fins101 = naviosVerdes101.map((n) => parseDateIso(n.fim_atracacao)?.getTime() || nowMs);
    ultimoFim101Ms = Math.max(...fins101);
    ultimoFim101EraConfirmado = naviosVerdes101.some(
      (n) => n.origem_previsao_fim === 'PRATICAGEM' && n.confianca_manobra === 'CONFIRMADA'
    );
  }
  let cursorBerco101Ms = naviosVerdes101.length > 0
    ? Math.max(nowMs, ultimoFim101Ms + DELTA_T_MANOBRA * 3600000)
    : nowMs;

  const naviosVerdes202 = naviosVerdesProcessados.filter((n) => n.berco === '202');
  let ultimoFim202Ms = nowMs;
  let ultimoFim202EraConfirmado = false;
  if (naviosVerdes202.length > 0) {
    const fins202 = naviosVerdes202.map((n) => parseDateIso(n.fim_atracacao)?.getTime() || nowMs);
    ultimoFim202Ms = Math.max(...fins202);
    ultimoFim202EraConfirmado = naviosVerdes202.some(
      (n) => n.origem_previsao_fim === 'PRATICAGEM' && n.confianca_manobra === 'CONFIRMADA'
    );
  }
  let cursorBerco202Ms = naviosVerdes202.length > 0
    ? Math.max(nowMs, ultimoFim202Ms + DELTA_T_MANOBRA * 3600000)
    : nowMs;

  ultimoFimBerco = new Date(Math.max(cursorBerco101Ms, cursorBerco202Ms));

  // 3. Processar a sequência de navios da fila com distribuição paralela inteligente
  for (const n of naviosFila) {
    const navio: NavioLineup = { ...n };
    totalVolumeT += navio.volume_t || 0;

    // Verificar se o navio consta como FUNDEADO na Praticagem
    const resumoNavio = getResumoNavio(navio);
    const estaFundeadoPraticagem = resumoNavio.some((r) => r.tipo === 'FUNDEADOS');
    if (estaFundeadoPraticagem && navio.status_cor !== 'VERDE') {
      navio.status_cor = 'VERMELHO';
      if (!navio.chegada_fundeio) {
        const parsedEtaPrevisto = parseDateIso(navio.eta_previsto);
        const parsedEtaAis = parseDateIso(navio.eta_ais);
        if (parsedEtaPrevisto && parsedEtaPrevisto.getTime() <= nowMs) {
          navio.chegada_fundeio = toIsoUtc(parsedEtaPrevisto);
        } else if (parsedEtaAis && parsedEtaAis.getTime() <= nowMs) {
          navio.chegada_fundeio = toIsoUtc(parsedEtaAis);
        } else {
          navio.chegada_fundeio = toIsoUtc(new Date(nowMs - 6 * 3600000));
        }
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

    // ALOCAÇÃO DINÂMICA DE BERÇO E CURSOR (Multi-Berço 101 vs 202):
    // Se houver indicação explícita da Praticagem (ex: CINT / 202 vs CAIS / 101), respeita a praticagem.
    // Caso contrário, se o navio for compatível com Berço 202 (LOA <= 75m, calado <= 6.0m e carga leve/apoio)
    // e o Berço 202 liberar antes do Berço 101 (cursorBerco202Ms < cursorBerco101Ms), aloca no 202.
    let bercoDestino = '101';
    let bercoExplicitamente202 = false;
    let bercoExplicitamente101 = false;

    if (manobraEntrada) {
      const loc = `${manobraEntrada.local_destino || ''} ${manobraEntrada.local_origem || ''}`.toUpperCase();
      if (loc.includes('CINT') || loc.includes('202')) bercoExplicitamente202 = true;
      else if (loc.includes('CAIS') || loc.includes('101')) bercoExplicitamente101 = true;
    }

    if (!bercoExplicitamente202 && !bercoExplicitamente101) {
      const resumoEntrada = resumoNavio.find((r) => r.berco);
      if (resumoEntrada?.berco) {
        const b = resumoEntrada.berco.toUpperCase();
        if (b.includes('CINT') || b.includes('202')) bercoExplicitamente202 = true;
        else if (b.includes('CAIS') || b.includes('101')) bercoExplicitamente101 = true;
      }
    }

    if (bercoExplicitamente202 || navio.berco === '202') {
      bercoDestino = '202';
    } else if (bercoExplicitamente101 || navio.berco === '101') {
      bercoDestino = '101';
    } else if (isCompativelBerco202(navio) && cursorBerco202Ms < cursorBerco101Ms) {
      bercoDestino = '202';
    } else {
      bercoDestino = '101';
    }

    navio.berco = bercoDestino;

    const cursorAlvoMs = bercoDestino === '202' ? cursorBerco202Ms : cursorBerco101Ms;
    const ultimoFimAlvoMs = bercoDestino === '202' ? ultimoFim202Ms : ultimoFim101Ms;
    const ultimoFimAlvoConfirmado = bercoDestino === '202' ? ultimoFim202EraConfirmado : ultimoFim101EraConfirmado;
    const profundidadeBercoZh = bercoDestino === '202' ? 7.0 : 10.0;

    let entradaConfirmadaPraticagem = false;
    let parsedPratEntradaMs: number | null = null;

    if (manobraEntrada && manobraEntrada.horario_iso) {
      const parsed = parseDateIso(manobraEntrada.horario_iso);
      if (parsed) {
        parsedPratEntradaMs = parsed.getTime();
        const pesoCat = obterPesoCategoriaManobra(manobraEntrada.categoria);
        entradaConfirmadaPraticagem = pesoCat >= 3;
        navio.confianca_manobra = entradaConfirmadaPraticagem ? 'CONFIRMADA' : 'SOLICITADA';
        navio.categoria_manobra = manobraEntrada.categoria;
        navio.manobra_praticagem_id = manobraEntrada.id;
        navio.manobra_praticagem_str = `Entrada agendada na Praticagem (${manobraEntrada.categoria_label || manobraEntrada.categoria}): ${manobraEntrada.horario_str}`;
      }
    }

    let inicioOperacaoMs = cursorAlvoMs;

    // ITEM 2.3: Se tanto a desatracação do navio anterior quanto a entrada deste navio
    // possuem horário oficial confirmado pela Praticagem e a entrada é posterior à saída,
    // utiliza o horário oficial da Praticagem sem impor a folga artificial de 2 horas!
    if (parsedPratEntradaMs !== null) {
      if (parsedPratEntradaMs >= ultimoFimAlvoMs) {
        if (ultimoFimAlvoConfirmado && entradaConfirmadaPraticagem) {
          // Ambos confirmados oficialmente pela Praticagem: usa o horário oficial!
          inicioOperacaoMs = Math.max(nowMs, parsedPratEntradaMs);
        } else {
          // Pelo menos um é estimado: aplica a folga de manobra mínima regulamentar
          inicioOperacaoMs = Math.max(nowMs, cursorAlvoMs, parsedPratEntradaMs);
        }
      } else {
        // Entrada anterior à desatracação do navio que ocupa o berço é fisicamente impossível: aguarda liberação
        inicioOperacaoMs = Math.max(nowMs, cursorAlvoMs);
      }
    } else if (navio.inicio_operacao) {
      const parsedOp = parseDateIso(navio.inicio_operacao);
      if (parsedOp) {
        inicioOperacaoMs = Math.max(nowMs, cursorAlvoMs, parsedOp.getTime());
      }
    } else {
      const etaD = parseDateIso(navio.chegada_fundeio || navio.eta_previsto) || agora;
      inicioOperacaoMs = Math.max(nowMs, cursorAlvoMs, etaD.getTime());
    }

    // ITEM 2.6: AJUSTE DINÂMICO POR RESTRIÇÃO DE MARÉ (DYNAMIC DRAFT WINDOWING)
    // Se o navio tiver calado que exija maré alta para manobrar com segurança (UKC >= 0.5m)
    // e o horário de atracação for estimado pelo motor (sem manobra com horário confirmado pela Praticagem),
    // empurrar inicioOperacaoMs para o pico da preamar astronômica compatível mais próxima
    if (!entradaConfirmadaPraticagem) {
      const caladoEntrada = navio.calado_entrada || navio.calado || 8.5;
      const janelaPreamar = encontrarProximaJanelaPreamarCompativel(
        caladoEntrada,
        new Date(inicioOperacaoMs),
        profundidadeBercoZh
      );
      if (janelaPreamar.ajustadoPorMare && !janelaPreamar.excedeCapacidadeFisica) {
        inicioOperacaoMs = janelaPreamar.dataPreamar.getTime();
        navio.janela_preamar_info = janelaPreamar.mensagem;
      }
    }

    const inicioOperacaoDate = new Date(inicioOperacaoMs);

    const { duracaoBaseHoras, horasChuva, tempoTotalHoras } = await calcularDuracaoNavio(
      navio,
      pranchas,
      inicioOperacaoDate
    );

    let fimOperacaoMs: number;
    let fimConfirmadoPraticagem = false;

    if (manobraSaida && manobraSaida.horario_iso) {
      const parsedSaida = parseDateIso(manobraSaida.horario_iso);
      if (parsedSaida && parsedSaida.getTime() > inicioOperacaoMs) {
        fimOperacaoMs = parsedSaida.getTime();
        const pesoCat = obterPesoCategoriaManobra(manobraSaida.categoria);
        fimConfirmadoPraticagem = pesoCat >= 3;
        navio.origem_previsao_fim = 'PRATICAGEM';
        navio.manobra_praticagem_id = manobraSaida.id;
        if (!navio.confianca_manobra) {
          navio.confianca_manobra = fimConfirmadoPraticagem ? 'CONFIRMADA' : 'SOLICITADA';
          navio.categoria_manobra = manobraSaida.categoria;
        }
        navio.manobra_praticagem_str = `Saída agendada na Praticagem (${manobraSaida.categoria_label || manobraSaida.categoria}): ${manobraSaida.horario_str}`;
      } else {
        fimOperacaoMs = inicioOperacaoMs + tempoTotalHoras * 3600000;
        navio.origem_previsao_fim = 'CALCULADO';
      }
    } else if (navio.origem_previsao_fim === 'MANUAL' && navio.fim_atracacao) {
      const parsedFim = parseDateIso(navio.fim_atracacao);
      if (parsedFim && parsedFim.getTime() > inicioOperacaoMs) {
        fimOperacaoMs = parsedFim.getTime();
        navio.confianca_manobra = 'CONFIRMADA';
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
      caladoCritico,
      confianca: navio.confianca_manobra || 'ESTIMADA',
      categoriaPraticagem: navio.categoria_manobra
    });

    navio.marcos = [
      { id: 'previsaoSisport', label: 'Previsão SISPORT', dataIso: toIsoUtc(new Date(m1)) },
      { id: 'fundeio', label: 'Fundeio', dataIso: toIsoUtc(new Date(m2)) },
      { id: 'inicioOperacao', label: 'Início Operação', dataIso: toIsoUtc(new Date(m3)) },
      { id: 'desatracacao', label: 'Prevista Desatracação', dataIso: toIsoUtc(new Date(m4)) }
    ];

    // Atualiza o cursor do berço específico para o próximo navio com folga de manobra
    const proximoCursorMs = fimOperacaoMs + DELTA_T_MANOBRA * 3600000;
    if (bercoDestino === '202') {
      cursorBerco202Ms = proximoCursorMs;
      ultimoFim202Ms = fimOperacaoMs;
      ultimoFim202EraConfirmado = fimConfirmadoPraticagem;
    } else {
      cursorBerco101Ms = proximoCursorMs;
      ultimoFim101Ms = fimOperacaoMs;
      ultimoFim101EraConfirmado = fimConfirmadoPraticagem;
    }

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
  // 4. REORDENAÇÃO FINAL EM CASCATA TEMPORAL ESTRITA (WATERFALL)
  // Ordena os navios em operação pelo início de atracação
  naviosVerdesProcessados.sort((a, b) => {
    const startA = parseDateIso(a.inicio_atracacao)?.getTime() || 0;
    const startB = parseDateIso(b.inicio_atracacao)?.getTime() || 0;
    return startA - startB;
  });

  const naviosProcessados: NavioLineup[] = [];

  // Atribui as primeiras ordens de fila (1, 2...) aos navios em operação
  naviosVerdesProcessados.forEach((item, index) => {
    item.ordem_fila = index + 1;
    item.restricao_mare = analisarRestricaoMareNavio(item, item.inicio_atracacao, item.fim_atracacao);
    naviosProcessados.push(item);
  });

  // Navios da fila continuam a numeração subsequente (k+1, k+2...)
  const offsetFila = naviosVerdesProcessados.length;
  naviosFilaProcessados.forEach((item, index) => {
    item.ordem_fila = offsetFila + index + 1;
    const rest = analisarRestricaoMareNavio(item, item.inicio_atracacao, item.fim_atracacao);
    item.restricao_mare = rest;

    const blocoOperacao = item.blocos?.find((b) => b.tipo === 'OPERACAO_DESATRACACAO' || b.tipo === 'AZUL');
    if (blocoOperacao) {
      const caladoCritico = rest.temRestricao;
      blocoOperacao.caladoCritico = caladoCritico;
      if (item.janela_preamar_info) {
        blocoOperacao.label = `🌊 JANELA PREAMAR • INÍCIO OP ➔ DESATRAC.`;
      } else {
        blocoOperacao.label = caladoCritico
          ? `⚠️ RESTRITO (${rest.caladoEntrada}m) • INÍCIO OP ➔ DESATRAC.`
          : `⚙ INÍCIO OPERAÇÃO ➔ DESATRACAÇÃO`;
      }
    }
    naviosProcessados.push(item);
  });

  // 4.1. Análise Náutica de Restrição de Calado e Maré da DHN (São Sebastião)
  for (const n of naviosProcessados) {
    n.restricao_mare = analisarRestricaoMareNavio(n, n.inicio_atracacao, n.fim_atracacao);
  }

  // 4. Persistir as janelas calculadas, status corrigido, calados e ordem da fila diretamente no PostgreSQL
  // Execução atômica em transação para evitar race conditions e locks parciais
  await sql.begin(async (tx) => {
    for (const n of naviosProcessados) {
      if (n.id) {
        await tx`
          UPDATE lineup_navios SET
            ordem_fila = ${n.ordem_fila},
            status_cor = ${n.status_cor},
            berco = ${n.berco ?? null},
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
  });

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

  // 6. Rastreamento contínuo de histórico e métricas de acurácia (Melhoria 4.3)
  await registrarOuAtualizarSnapshotsPrevisao(naviosProcessados);
  const metricasAcuracia = await obterMetricasAcuraciaPrevisoes();

  // Atribui nível de confiança estimado a cada navio da fila
  for (const n of naviosProcessados) {
    n.confianca_previsao = metricasAcuracia.confianca_modelo;
    n.precisao_estimada = metricasAcuracia.taxa_acuracia_geral;
  }

  const resumo: ResumoOperacional = {
    taxa_ocupacao_berco: taxaOcupacao,
    total_navios: naviosProcessados.length,
    navios_em_operacao: naviosProcessados.filter((n) => n.status_cor === 'VERDE').length,
    navios_fundeados: totalEmEspera,
    horas_ocupadas: Math.round(totalHorasOcupadasBerco * 10) / 10,
    volume_total_t: Math.round(totalVolumeT * 10) / 10,
    metricas_acuracia: metricasAcuracia
  };

  return {
    navios: naviosProcessados,
    operacional: resumo
  };
}

/**
 * Registra snapshots de previsão e computa acurácia/desvios de início para o histórico (Melhoria 4.3)
 */
export async function registrarOuAtualizarSnapshotsPrevisao(navios: NavioLineup[]): Promise<void> {
  const sql = getDatabase();

  for (const n of navios) {
    if (!n.imo || !n.inicio_atracacao || !n.fim_atracacao) continue;

    try {
      const iniPrev = parseDateIso(n.inicio_atracacao);
      const fimPrev = parseDateIso(n.fim_atracacao);
      if (!iniPrev || !fimPrev) continue;

      const duracaoPrevHoras = Math.round(((fimPrev.getTime() - iniPrev.getTime()) / 3600000) * 10) / 10;
      const isVerde = n.status_cor === 'VERDE';

      // Busca snapshot em andamento para este navio (por lineup_id específico da escala, com fallback por IMO)
      const navioId = n.id ?? null;
      const existentes = await sql<SnapshotHistoricoPrevisao[]>`
        SELECT * FROM lineup_historico_previsoes
        WHERE (lineup_id = ${navioId} OR (lineup_id IS NULL AND imo = ${n.imo}))
          AND status_fechamento = 'EM_ANDAMENTO'
        ORDER BY id DESC LIMIT 1
      `;

      if (existentes.length === 0) {
        // Cria snapshot inicial da previsão calculada
        await sql`
          INSERT INTO lineup_historico_previsoes (
            lineup_id, imo, nome_navio, mercadoria, volume_t, berco,
            eta_previsto, inicio_atracacao_previsto, fim_atracacao_previsto, duracao_prevista_horas,
            chegada_fundeio_real, inicio_atracacao_real,
            confianca_estimada, status_fechamento
          ) VALUES (
            ${n.id || null}, ${n.imo}, ${n.nome_navio}, ${n.mercadoria || null}, ${n.volume_t || null}, ${n.berco || '101'},
            ${n.eta_previsto || null}, ${n.inicio_atracacao}, ${n.fim_atracacao}, ${duracaoPrevHoras},
            ${n.chegada_fundeio || null}, ${isVerde ? n.inicio_atracacao : null},
            'ALTA', 'EM_ANDAMENTO'
          )
        `;
      } else {
        const snap = existentes[0];
        // Se navio está em operação no berço (VERDE) e ainda não possuía registro de início real
        if (isVerde && !snap.inicio_atracacao_real) {
          const iniReal = parseDateIso(n.inicio_atracacao) || new Date();
          const iniPrevOrig = snap.inicio_atracacao_previsto ? parseDateIso(snap.inicio_atracacao_previsto) : null;
          const desvioAtracacao = iniPrevOrig
            ? Math.round(((iniReal.getTime() - iniPrevOrig.getTime()) / 3600000) * 10) / 10
            : 0;

          await sql`
            UPDATE lineup_historico_previsoes SET
              inicio_atracacao_real = ${toIsoUtc(iniReal)},
              desvio_atracacao_horas = ${desvioAtracacao},
              berco = ${(n.berco || snap.berco) ?? null}
            WHERE id = ${snap.id!}
          `;
        }
      }
    } catch (err) {
      console.error(`[HistoricoPrevisoes] Erro ao registrar snapshot de ${n.nome_navio}:`, err);
    }
  }
}

/**
 * Finaliza snapshot de previsão quando a escala é concluída e calibra produtividade real (Melhoria 4.3)
 */
export async function finalizarSnapshotPrevisao(
  imo: string,
  fimRealDate: Date = new Date()
): Promise<boolean> {
  if (!imo) return false;
  try {
    const sql = getDatabase();
    const rows = await sql<SnapshotHistoricoPrevisao[]>`
      SELECT * FROM lineup_historico_previsoes
      WHERE imo = ${imo} AND status_fechamento = 'EM_ANDAMENTO'
      ORDER BY id DESC LIMIT 1
    `;
    if (rows.length === 0) return false;

    const snap = rows[0];
    const fimRealIso = toIsoUtc(fimRealDate);
    const iniReal = snap.inicio_atracacao_real
      ? parseDateIso(snap.inicio_atracacao_real)
      : (snap.inicio_atracacao_previsto ? parseDateIso(snap.inicio_atracacao_previsto) : null);

    const duracaoRealHoras = iniReal
      ? Math.max(1, Math.round(((fimRealDate.getTime() - iniReal.getTime()) / 3600000) * 10) / 10)
      : (snap.duracao_prevista_horas || 24);

    const fimPrev = snap.fim_atracacao_previsto ? parseDateIso(snap.fim_atracacao_previsto) : null;
    const desvioDesatracacao = fimPrev
      ? Math.round(((fimRealDate.getTime() - fimPrev.getTime()) / 3600000) * 10) / 10
      : 0;

    const duracaoPrev = snap.duracao_prevista_horas || duracaoRealHoras;
    const desvioDuracao = Math.round((duracaoRealHoras - duracaoPrev) * 10) / 10;

    const erroRelativo = Math.abs(desvioDuracao) / Math.max(1, duracaoPrev);
    const precisao = Math.max(0, Math.min(100, Math.round((1 - erroRelativo) * 1000) / 10));
    const confianca: 'ALTA' | 'MEDIA' | 'BAIXA' = erroRelativo <= 0.15 ? 'ALTA' : erroRelativo <= 0.30 ? 'MEDIA' : 'BAIXA';

    await sql`
      UPDATE lineup_historico_previsoes SET
        fim_atracacao_real = ${fimRealIso},
        duracao_real_horas = ${duracaoRealHoras},
        desvio_desatracacao_horas = ${desvioDesatracacao},
        desvio_duracao_horas = ${desvioDuracao},
        precisao_percentual = ${precisao},
        confianca_estimada = ${confianca},
        status_fechamento = 'CONCLUIDO',
        finalizado_em = CURRENT_TIMESTAMP
      WHERE id = ${snap.id!}
    `;

    // Calibra a prancha operacional com base no tempo real
    if (snap.mercadoria && snap.volume_t) {
      await calibrarPranchaComHistorico(snap.mercadoria, snap.volume_t, duracaoRealHoras);
    }

    return true;
  } catch (err) {
    console.error(`[HistoricoPrevisoes] Erro ao finalizar snapshot de IMO ${imo}:`, err);
    return false;
  }
}

/**
 * Computa métricas estatísticas de acurácia das previsões históricas (Melhoria 4.3)
 */
export async function obterMetricasAcuraciaPrevisoes(): Promise<MetricasAcuraciaPrevisao> {
  const sql = getDatabase();
  try {
    const rows = await sql<{
      total: number;
      mae_atracacao: number | null;
      mae_desatracacao: number | null;
      media_acuracia: number | null;
    }[]>`
      SELECT
        COUNT(*)::int as total,
        AVG(ABS(desvio_atracacao_horas))::float as mae_atracacao,
        AVG(ABS(desvio_desatracacao_horas))::float as mae_desatracacao,
        AVG(precisao_percentual)::float as media_acuracia
      FROM lineup_historico_previsoes
      WHERE status_fechamento = 'CONCLUIDO'
    `;

    const res = rows[0];
    const total = res?.total || 0;

    if (total === 0) {
      return {
        mae_atracacao_horas: 1.5,
        mae_desatracacao_horas: 2.0,
        taxa_acuracia_geral: 95.0,
        total_escalas_avaliadas: 0,
        confianca_modelo: 'ALTA'
      };
    }

    const maeAtracacao = Math.round((res.mae_atracacao ?? 1.5) * 10) / 10;
    const maeDesatracacao = Math.round((res.mae_desatracacao ?? 2.0) * 10) / 10;
    const taxaAcuracia = Math.round((res.media_acuracia ?? 95.0) * 10) / 10;

    const confianca: 'ALTA' | 'MEDIA' | 'BAIXA' =
      taxaAcuracia >= 88 ? 'ALTA' : taxaAcuracia >= 75 ? 'MEDIA' : 'BAIXA';

    return {
      mae_atracacao_horas: maeAtracacao,
      mae_desatracacao_horas: maeDesatracacao,
      taxa_acuracia_geral: taxaAcuracia,
      total_escalas_avaliadas: total,
      confianca_modelo: confianca
    };
  } catch (err) {
    console.error('[HistoricoPrevisoes] Erro ao obter métricas de acurácia:', err);
    return {
      mae_atracacao_horas: 1.5,
      mae_desatracacao_horas: 2.0,
      taxa_acuracia_geral: 95.0,
      total_escalas_avaliadas: 0,
      confianca_modelo: 'ALTA'
    };
  }
}
