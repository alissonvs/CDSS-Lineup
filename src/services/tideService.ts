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
  tipoManobra: 'ATRACACAO' | 'DESATRACACAO'
): AnaliseManobraMare {
  const alturaMare = calcularAlturaMare(dataHora);
  const profundidadeTotalZh = Math.round((PROFUNDIDADE_BERCO_ZH + alturaMare) * 100) / 100;
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
    ukcCalculado,
    ukcMinimoExigido: UKC_MINIMO_REGULAMENTAR,
    seguro,
    nivelRisco,
    alertaMensagem: alertaMensagem || undefined,
    proximaPreamar
  };
}

/**
 * Analisa as restrições completas de maré e calado para um navio no line-up
 */
export function analisarRestricaoMareNavio(
  navio: NavioLineup,
  inicioIso?: string | null,
  fimIso?: string | null
): RestricaoMareNavio {
  const calado = navio.calado ? Number(navio.calado) : 8.5;
  const mareMinimaRequerida = Math.max(0, Math.round((calado + UKC_MINIMO_REGULAMENTAR - PROFUNDIDADE_BERCO_ZH) * 100) / 100);

  // Navios com calado abaixo do limiar crítico (ex: 8.5m ou menor) têm folga abundante mesmo na maré mais baixa
  if (calado < CALADO_CRITICO_LIMIAR) {
    return {
      temRestricao: false,
      calado,
      profundidadeBercoZh: PROFUNDIDADE_BERCO_ZH,
      ukcMinimoExigido: UKC_MINIMO_REGULAMENTAR,
      mareMinimaRequerida
    };
  }

  let atracacaoAnalise: AnaliseManobraMare | undefined;
  let desatracacaoAnalise: AnaliseManobraMare | undefined;

  if (inicioIso) {
    const dInicio = new Date(inicioIso.endsWith('Z') ? inicioIso : inicioIso + 'Z');
    if (!isNaN(dInicio.getTime())) {
      atracacaoAnalise = analisarManobraIndividual(calado, dInicio, 'ATRACACAO');
    }
  }

  if (fimIso) {
    const dFim = new Date(fimIso.endsWith('Z') ? fimIso : fimIso + 'Z');
    if (!isNaN(dFim.getTime())) {
      desatracacaoAnalise = analisarManobraIndividual(calado, dFim, 'DESATRACACAO');
    }
  }

  const temInseguranca = (atracacaoAnalise && !atracacaoAnalise.seguro) || (desatracacaoAnalise && !desatracacaoAnalise.seguro);

  let resumoAlerta = '';
  if (atracacaoAnalise && !atracacaoAnalise.seguro && desatracacaoAnalise && !desatracacaoAnalise.seguro) {
    resumoAlerta = `Atracação e Desatracação em Baixa-mar (UKC < ${UKC_MINIMO_REGULAMENTAR}m)`;
  } else if (atracacaoAnalise && !atracacaoAnalise.seguro) {
    resumoAlerta = `Atracação em Baixa-mar (UKC ${atracacaoAnalise.ukcCalculado.toFixed(2)}m)`;
  } else if (desatracacaoAnalise && !desatracacaoAnalise.seguro) {
    resumoAlerta = `Desatracação em Baixa-mar (UKC ${desatracacaoAnalise.ukcCalculado.toFixed(2)}m)`;
  }

  return {
    temRestricao: Boolean(temInseguranca),
    calado,
    profundidadeBercoZh: PROFUNDIDADE_BERCO_ZH,
    ukcMinimoExigido: UKC_MINIMO_REGULAMENTAR,
    mareMinimaRequerida,
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
