import { getDatabase } from '../database/connection.js';
import {
  MarePonto,
  MareExtremo,
  MareStatusAtual,
  RestricaoMareNavio,
  AnaliseManobraMare,
  NavioLineup,
  TipoExtremoMare,
  TendenciaMare
} from '../types/index.js';

// Parâmetros Regulamentares Oficiais do Porto de São Sebastião (CDSS)
export const PROFUNDIDADE_BERCO_ZH = 10.0; // Profundidade nominal de projeto do cais comercial CDSS sobre o Zero Hidrográfico (ZH)
export const UKC_MINIMO_REGULAMENTAR = 0.5; // Folga Mínima Abaixo da Quilha (Under Keel Clearance) exigida pela Marinha (0,5m)
export const CALADO_CRITICO_LIMIAR = 10.0; // Limiar de calado a partir do qual a manobra depende de maré favorável

/**
 * Constantes Harmônicas da Estação Maregráfica de São Sebastião (DHN / Marinha do Brasil)
 * Código Estação: São Sebastião - SP (Canal de São Sebastião / TEBAR)
 * Coordenadas: 23° 48.3' S / 045° 23.8' W
 */
interface ComponenteHarmonica {
  nome: string;
  velocidadeGrausHora: number; // Velocidade angular (graus/hora)
  amplitude: number;           // Amplitude média em metros
  faseGraus: number;           // Fase local (g)
}

const Z0_NIVEL_MEDIO = 0.72; // Nível médio do mar sobre o Zero Hidrográfico (ZH)

// Principais constituintes harmônicos da maré de São Sebastião
const COMPONENTES_HARMONICAS: ComponenteHarmonica[] = [
  { nome: 'M2', velocidadeGrausHora: 28.9841042, amplitude: 0.35, faseGraus: 74.0 }, // Principal lunar semi-diurna
  { nome: 'S2', velocidadeGrausHora: 30.0000000, amplitude: 0.17, faseGraus: 91.0 }, // Principal solar semi-diurna
  { nome: 'K1', velocidadeGrausHora: 15.0410686, amplitude: 0.13, faseGraus: 64.0 }, // Diurna lunar-solar
  { nome: 'O1', velocidadeGrausHora: 13.9430356, amplitude: 0.11, faseGraus: 49.0 }, // Principal diurna lunar
  { nome: 'N2', velocidadeGrausHora: 28.4397295, amplitude: 0.08, faseGraus: 58.0 }, // Lunar elíptica maior
  { nome: 'M4', velocidadeGrausHora: 57.9682084, amplitude: 0.03, faseGraus: 120.0 }  // Águas rasas (canal)
];

// Data de época de referência astronômica estável (01/01/2026 00:00:00 UTC)
const EPOCH_REF_MS = new Date('2026-01-01T00:00:00Z').getTime();

/**
 * Calcula a altura da maré (em metros sobre o ZH) para qualquer data/hora
 * utilizando a síntese harmônica da DHN para o Canal de São Sebastião
 */
export function calcularAlturaMare(data: Date): number {
  const tHoras = (data.getTime() - EPOCH_REF_MS) / (1000 * 60 * 60);

  let altura = Z0_NIVEL_MEDIO;
  for (const comp of COMPONENTES_HARMONICAS) {
    const rad = ((comp.velocidadeGrausHora * tHoras - comp.faseGraus) * Math.PI) / 180;
    altura += comp.amplitude * Math.cos(rad);
  }

  // A maré em São Sebastião raramente ultrapassa 1.55m ou cai abaixo de 0.05m
  const alturaClamp = Math.max(0.05, Math.min(1.60, altura));
  return Math.round(alturaClamp * 100) / 100;
}

/**
 * Retorna a série contínua da maré (curva de maré) em intervalos regulares
 */
export function obterCurvaMare(inicio: Date, fim: Date, stepMinutos: number = 30): MarePonto[] {
  const pontos: MarePonto[] = [];
  const stepMs = stepMinutos * 60 * 1000;
  let currMs = inicio.getTime();
  const fimMs = fim.getTime();

  while (currMs <= fimMs) {
    const d = new Date(currMs);
    const alt = calcularAlturaMare(d);

    // Avalia a tendência nos 15 minutos seguintes
    const altNext = calcularAlturaMare(new Date(currMs + 15 * 60 * 1000));
    let tendencia: TendenciaMare = 'ESTAVEL';
    if (altNext > alt + 0.01) tendencia = 'SUBINDO';
    else if (altNext < alt - 0.01) tendencia = 'DESCENDO';

    pontos.push({
      dataHoraIso: d.toISOString(),
      altura_m: alt,
      tendencia
    });

    currMs += stepMs;
  }

  return pontos;
}

/**
 * Identifica os extremos diários (Preamares e Baixa-mares) no intervalo solicitado
 */
export function obterExtremosMare(inicio: Date, fim: Date): MareExtremo[] {
  const extremos: MareExtremo[] = [];
  const stepMin = 5; // Resolução de 5 minutos para detecção precisa do ápice
  const stepMs = stepMin * 60 * 1000;

  let currMs = inicio.getTime() + stepMs;
  const fimMs = fim.getTime() - stepMs;

  while (currMs < fimMs) {
    const dPrev = new Date(currMs - stepMs);
    const dCurr = new Date(currMs);
    const dNext = new Date(currMs + stepMs);

    const hPrev = calcularAlturaMare(dPrev);
    const hCurr = calcularAlturaMare(dCurr);
    const hNext = calcularAlturaMare(dNext);

    // Preamar: ponto máximo local
    if (hCurr >= hPrev && hCurr > hNext && hCurr >= 0.85) {
      extremos.push({
        dataHoraIso: dCurr.toISOString(),
        altura_m: hCurr,
        tipo: 'PREAMAR',
        label: `Preamar ${hCurr.toFixed(2)}m`
      });
      // Pula pelo menos 3 horas para evitar falsos picos próximos
      currMs += 3 * 3600 * 1000;
      continue;
    }

    // Baixa-mar: ponto mínimo local
    if (hCurr <= hPrev && hCurr < hNext && hCurr <= 0.65) {
      extremos.push({
        dataHoraIso: dCurr.toISOString(),
        altura_m: hCurr,
        tipo: 'BAIXA_MAR',
        label: `Baixa-mar ${hCurr.toFixed(2)}m`
      });
      currMs += 3 * 3600 * 1000;
      continue;
    }

    currMs += stepMs;
  }

  return extremos;
}

/**
 * Retorna o status da maré em tempo real no Canal de São Sebastião
 */
export function obterStatusMareAtual(dataReferencia: Date = new Date()): MareStatusAtual {
  const altAtual = calcularAlturaMare(dataReferencia);
  const altMais15 = calcularAlturaMare(new Date(dataReferencia.getTime() + 15 * 60 * 1000));

  const tendencia: TendenciaMare = altMais15 >= altAtual ? 'SUBINDO' : 'DESCENDO';

  // Busca o próximo extremo nas próximas 12 horas
  const proximosExtremos = obterExtremosMare(
    dataReferencia,
    new Date(dataReferencia.getTime() + 14 * 3600 * 1000)
  );

  const proximoExtremo = proximosExtremos.length > 0
    ? proximosExtremos[0]
    : {
        dataHoraIso: new Date(dataReferencia.getTime() + 4 * 3600 * 1000).toISOString(),
        altura_m: tendencia === 'SUBINDO' ? 1.30 : 0.35,
        tipo: (tendencia === 'SUBINDO' ? 'PREAMAR' : 'BAIXA_MAR') as TipoExtremoMare,
        label: tendencia === 'SUBINDO' ? 'Preamar 1.30m' : 'Baixa-mar 0.35m'
      };

  const desc = tendencia === 'SUBINDO'
    ? `Maré Enchendo (${altAtual.toFixed(2)}m)`
    : `Maré Vazando (${altAtual.toFixed(2)}m)`;

  return {
    dataHoraIso: dataReferencia.toISOString(),
    altura_m: altAtual,
    tendencia,
    estacao: 'Porto de São Sebastião (DHN)',
    proximoExtremo,
    marareCorrenteDescricao: desc
  };
}

/**
 * Analisa a segurança da manobra de um navio com base em seu calado e na maré prevista
 */
export function analisarManobraIndividual(
  calado: number,
  dataHora: Date,
  tipoManobra: 'ATRACACAO' | 'DESATRACACAO',
  profundidadeZh: number = PROFUNDIDADE_BERCO_ZH
): AnaliseManobraMare {
  const alturaMare = calcularAlturaMare(dataHora);
  const profundidadeTotalZh = Math.round((profundidadeZh + alturaMare) * 100) / 100;
  const ukcCalculado = Math.round((profundidadeTotalZh - calado) * 100) / 100;

  // Busca a Preamar mais próxima (6h antes a 6h depois)
  const extremosJanela = obterExtremosMare(
    new Date(dataHora.getTime() - 6 * 3600 * 1000),
    new Date(dataHora.getTime() + 8 * 3600 * 1000)
  ).filter(e => e.tipo === 'PREAMAR');

  const proximaPreamar = extremosJanela.length > 0 ? extremosJanela[0] : undefined;

  let nivelRisco: 'SEGURO' | 'ATENCAO' | 'CRITICO' = 'SEGURO';
  let seguro = true;
  let alertaMensagem = '';

  const tipoTexto = tipoManobra === 'ATRACACAO' ? 'Atracação' : 'Desatracação';

  if (ukcCalculado < 0) {
    nivelRisco = 'CRITICO';
    seguro = false;
    alertaMensagem = `${tipoTexto} em Maré Baixa (${alturaMare.toFixed(2)}m): Risco de encalhe! Calado ${calado.toFixed(2)}m excede profundidade disponível (${profundidadeTotalZh.toFixed(2)}m).`;
  } else if (ukcCalculado < UKC_MINIMO_REGULAMENTAR) {
    nivelRisco = 'ATENCAO';
    seguro = false;
    alertaMensagem = `${tipoTexto} com UKC reduzido (${ukcCalculado.toFixed(2)}m < 0.50m exigido pela Marinha). Recomenda-se aguardar Preamar.`;
  }

  return {
    dataHoraIso: dataHora.toISOString(),
    tipoManobra,
    alturaMare,
    profundidadeTotalZh,
    caladoManobra: calado,
    ukcCalculado,
    ukcMinimoExigido: UKC_MINIMO_REGULAMENTAR,
    seguro,
    nivelRisco,
    alertaMensagem: alertaMensagem || undefined,
    proximaPreamar
  };
}

/**
 * Obtém os calados operacionais de entrada e saída do navio
 * com fallback inteligente para dedução por tipo de operação (Carga vs Descarga)
 */
export function obterCaladosOperacionaisNavio(navio: NavioLineup): {
  caladoEntrada: number;
  caladoSaida: number;
  caladoMaximo: number;
} {
  const merc = (navio.mercadoria || '').toLowerCase();
  const caladoPrincipal = navio.calado ? Number(navio.calado) : 8.5;

  let caladoEntrada = navio.calado_entrada !== undefined && navio.calado_entrada !== null && Number(navio.calado_entrada) > 0
    ? Number(navio.calado_entrada)
    : caladoPrincipal;

  let caladoSaida = navio.calado_saida !== undefined && navio.calado_saida !== null && Number(navio.calado_saida) > 0
    ? Number(navio.calado_saida)
    : caladoPrincipal;

  // Dedução automática caso calado_entrada ou calado_saida não tenham sido definidos explicitamente
  const entradaNaoInformada = navio.calado_entrada === undefined || navio.calado_entrada === null;
  const saidaNaoInformada = navio.calado_saida === undefined || navio.calado_saida === null;

  if (entradaNaoInformada || saidaNaoInformada) {
    if (merc.includes('animais') || merc.includes('vivos') || merc.includes('viva')) {
      // Embarque de Carga Viva: entra em lastro mais leve e desatraca carregado
      if (entradaNaoInformada) caladoEntrada = Math.max(6.0, Math.round((caladoPrincipal - 0.9) * 10) / 10);
      if (saidaNaoInformada) caladoSaida = caladoPrincipal;
    } else if (merc.includes('barrilha') || merc.includes('trigo') || merc.includes('malte') || merc.includes('cevada')) {
      // Descarga de Graneis (Importação): chega com calado total e sai em lastro (~6.2m)
      if (entradaNaoInformada) caladoEntrada = caladoPrincipal;
      if (saidaNaoInformada) {
        const caladoLastroEstimado = Math.max(5.8, Math.min(6.8, Math.round((caladoPrincipal - 3.4) * 10) / 10));
        caladoSaida = caladoLastroEstimado;
      }
    }
  }

  const caladoMaximo = Math.max(caladoEntrada, caladoSaida);
  return {
    caladoEntrada: Math.round(caladoEntrada * 10) / 10,
    caladoSaida: Math.round(caladoSaida * 10) / 10,
    caladoMaximo: Math.round(caladoMaximo * 10) / 10
  };
}

/**
 * Analisa as restrições completas de maré e calado para um navio no line-up
 * avaliando separadamente a Atracação (Calado de Entrada) e a Desatracação (Calado de Saída)
 */
export function analisarRestricaoMareNavio(
  navio: NavioLineup,
  inicioIso?: string | null,
  fimIso?: string | null,
  profundidadeZhParam?: number
): RestricaoMareNavio {
  const { caladoEntrada, caladoSaida, caladoMaximo } = obterCaladosOperacionaisNavio(navio);

  // Se o navio estiver designado para o Berço 202, profundidade física ZH é 7.0m, senão 10.0m (Berço 101)
  const profundidadeBercoZh = profundidadeZhParam !== undefined
    ? profundidadeZhParam
    : (navio.berco === '202' ? 7.0 : PROFUNDIDADE_BERCO_ZH);

  const mareMinimaEntrada = Math.max(0, Math.round((caladoEntrada + UKC_MINIMO_REGULAMENTAR - profundidadeBercoZh) * 100) / 100);
  const mareMinimaSaida = Math.max(0, Math.round((caladoSaida + UKC_MINIMO_REGULAMENTAR - profundidadeBercoZh) * 100) / 100);
  const mareMinimaGeral = Math.max(mareMinimaEntrada, mareMinimaSaida);

  let atracacaoAnalise: AnaliseManobraMare | undefined;
  let desatracacaoAnalise: AnaliseManobraMare | undefined;

  if (inicioIso) {
    const normInicio = (inicioIso.endsWith('Z') || inicioIso.includes('+') || (inicioIso.lastIndexOf('-') > 7))
      ? inicioIso
      : `${inicioIso.includes('T') ? inicioIso : inicioIso.replace(' ', 'T')}-03:00`;
    const dInicio = new Date(normInicio);
    if (!isNaN(dInicio.getTime())) {
      atracacaoAnalise = analisarManobraIndividual(caladoEntrada, dInicio, 'ATRACACAO', profundidadeBercoZh);
    }
  }

  if (fimIso) {
    const normFim = (fimIso.endsWith('Z') || fimIso.includes('+') || (fimIso.lastIndexOf('-') > 7))
      ? fimIso
      : `${fimIso.includes('T') ? fimIso : fimIso.replace(' ', 'T')}-03:00`;
    const dFim = new Date(normFim);
    if (!isNaN(dFim.getTime())) {
      desatracacaoAnalise = analisarManobraIndividual(caladoSaida, dFim, 'DESATRACACAO', profundidadeBercoZh);
    }
  }

  const temInseguranca = (atracacaoAnalise && !atracacaoAnalise.seguro) || (desatracacaoAnalise && !desatracacaoAnalise.seguro);

  let resumoAlerta = '';
  if (atracacaoAnalise && !atracacaoAnalise.seguro && desatracacaoAnalise && !desatracacaoAnalise.seguro) {
    resumoAlerta = `Atracação (${caladoEntrada}m) e Desatracação (${caladoSaida}m) em Baixa-mar`;
  } else if (atracacaoAnalise && !atracacaoAnalise.seguro) {
    resumoAlerta = `Atracação em Baixa-mar (${caladoEntrada}m, UKC ${atracacaoAnalise.ukcCalculado.toFixed(2)}m) • Desatracação Segura (${caladoSaida}m)`;
  } else if (desatracacaoAnalise && !desatracacaoAnalise.seguro) {
    resumoAlerta = `Desatracação em Baixa-mar (${caladoSaida}m, UKC ${desatracacaoAnalise.ukcCalculado.toFixed(2)}m) • Atracação Segura (${caladoEntrada}m)`;
  }

  return {
    temRestricao: Boolean(temInseguranca),
    calado: caladoMaximo,
    caladoEntrada,
    caladoSaida,
    profundidadeBercoZh,
    ukcMinimoExigido: UKC_MINIMO_REGULAMENTAR,
    mareMinimaRequerida: mareMinimaGeral,
    mareMinimaRequeridaEntrada: mareMinimaEntrada,
    mareMinimaRequeridaSaida: mareMinimaSaida,
    atracacao: atracacaoAnalise,
    desatracacao: desatracacaoAnalise,
    resumoAlerta: resumoAlerta || undefined
  };
}

/**
 * Sincroniza e garante a persistência dos extremos da tábua de marés da DHN no PostgreSQL
 */
export async function sincronizarTabuaMaresNoBanco(inicio: Date, fim: Date): Promise<void> {
  try {
    const sql = getDatabase();
    const extremos = obterExtremosMare(inicio, fim);

    if (extremos.length === 0) return;

    for (const e of extremos) {
      await sql`
        INSERT INTO tabua_mares (estacao, data_hora, tipo, altura_m)
        VALUES ('SAO_SEBASTIAO', ${e.dataHoraIso}, ${e.tipo}, ${e.altura_m})
        ON CONFLICT (estacao, data_hora) DO UPDATE SET
          tipo = EXCLUDED.tipo,
          altura_m = EXCLUDED.altura_m
      `;
    }
  } catch (err) {
    console.warn('[TideService] Aviso ao persistir tábua de marés no PostgreSQL:', (err as Error).message);
  }
}

function parseSafeIso(str?: string | null): Date | null {
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

export interface JanelaPreamarResultado {
  dataPreamar: Date;
  alturaMare: number;
  ukcCalculado: number;
  ajustadoPorMare: boolean;
  excedeCapacidadeFisica: boolean;
  mensagem: string;
}

/**
 * Localiza a próxima janela de maré compatível (Preamar) a partir de uma data mínima de referência,
 * garantindo profundidade total sobre o ZH + Altura da Maré >= calado + UKC mínimo (0.5m).
 * 
 * Se na data mínima o calado já for seguro, retorna sem adiantar o agendamento.
 * Se for inseguro, avança para a próxima Preamar astronômica compatível da DHN.
 */
export function encontrarProximaJanelaPreamarCompativel(
  calado: number,
  dataMinima: Date,
  profundidadeZh: number = PROFUNDIDADE_BERCO_ZH,
  janelaDias = 7
): JanelaPreamarResultado {
  const ukcMinimo = UKC_MINIMO_REGULAMENTAR; // 0.5m
  const mareNecessaria = Math.max(0, Math.round((calado + ukcMinimo - profundidadeZh) * 100) / 100);

  // Maré astronômica máxima histórica em São Sebastião (DHN) é de ~1.60m
  const MARE_ASTRONOMICA_MAXIMA = 1.60;
  if (calado + ukcMinimo > profundidadeZh + MARE_ASTRONOMICA_MAXIMA) {
    return {
      dataPreamar: dataMinima,
      alturaMare: 0,
      ukcCalculado: Math.round((profundidadeZh - calado) * 100) / 100,
      ajustadoPorMare: false,
      excedeCapacidadeFisica: true,
      mensagem: `CRÍTICO: Calado de ${calado.toFixed(1)}m excede a capacidade física máxima do berço (${profundidadeZh}m ZH + 1.6m maré máx).`
    };
  }

  // Verifica segurança na data mínima proposta
  const mareInstantanea = calcularAlturaMare(dataMinima);
  const ukcInstantaneo = Math.round((profundidadeZh + mareInstantanea - calado) * 100) / 100;

  if (ukcInstantaneo >= ukcMinimo) {
    // Seguro no horário original
    return {
      dataPreamar: dataMinima,
      alturaMare: mareInstantanea,
      ukcCalculado: ukcInstantaneo,
      ajustadoPorMare: false,
      excedeCapacidadeFisica: false,
      mensagem: `Manobra segura no horário proposto (Maré ${mareInstantanea.toFixed(2)}m, UKC ${ukcInstantaneo.toFixed(2)}m >= ${ukcMinimo}m).`
    };
  }

  // Se não for seguro, busca os extremos astronômicos de maré no período
  const fimBusca = new Date(dataMinima.getTime() + janelaDias * 24 * 3600 * 1000);
  const extremos = obterExtremosMare(dataMinima, fimBusca);

  // Filtra preamares posteriores a dataMinima que atingem a maré necessária
  const preamaresAptas = extremos.filter((e) => {
    if (e.tipo !== 'PREAMAR') return false;
    const d = parseSafeIso(e.dataHoraIso);
    if (!d || d.getTime() <= dataMinima.getTime()) return false;
    return e.altura_m >= mareNecessaria;
  });

  if (preamaresAptas.length > 0) {
    const primeira = preamaresAptas[0];
    const dataPreamar = parseSafeIso(primeira.dataHoraIso)!;
    const ukc = Math.round((profundidadeZh + primeira.altura_m - calado) * 100) / 100;
    return {
      dataPreamar,
      alturaMare: primeira.altura_m,
      ukcCalculado: ukc,
      ajustadoPorMare: true,
      excedeCapacidadeFisica: false,
      mensagem: `Janela de atracação ajustada para a Preamar de ${primeira.altura_m.toFixed(2)}m às ${dataPreamar.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} (UKC ${ukc.toFixed(2)}m).`
    };
  }

  // Fallback: busca a maior preamar disponível após dataMinima
  const todasPreamares = extremos
    .filter((e) => e.tipo === 'PREAMAR')
    .map((e) => ({ ...e, date: parseSafeIso(e.dataHoraIso)! }))
    .filter((e) => e.date && e.date.getTime() > dataMinima.getTime())
    .sort((a, b) => b.altura_m - a.altura_m);

  if (todasPreamares.length > 0) {
    const melhor = todasPreamares[0];
    const ukc = Math.round((profundidadeZh + melhor.altura_m - calado) * 100) / 100;
    return {
      dataPreamar: melhor.date,
      alturaMare: melhor.altura_m,
      ukcCalculado: ukc,
      ajustadoPorMare: true,
      excedeCapacidadeFisica: false,
      mensagem: `Melhor janela de preamar disponível (${melhor.altura_m.toFixed(2)}m, UKC ${ukc.toFixed(2)}m).`
    };
  }

  return {
    dataPreamar: dataMinima,
    alturaMare: mareInstantanea,
    ukcCalculado: ukcInstantaneo,
    ajustadoPorMare: false,
    excedeCapacidadeFisica: false,
    mensagem: `Sem janela de preamar no horizonte.`
  };
}
