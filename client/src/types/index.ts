export type StatusCor = 'LARANJA' | 'VERMELHO' | 'CINZA' | 'VERDE' | 'AZUL';

export interface TimelineBlock {
  tipo: 'VERDE' | 'AZUL' | 'VERMELHO' | 'LARANJA';
  label: string;
  inicioIso: string;
  fimIso: string;
  duracaoHoras: number;
  caladoCritico?: boolean;
}

export interface NavioLineup {
  id: number;
  imo: string;
  nome_navio: string;
  tipo_navio?: string;
  mercadoria: string;
  volume_t: number;
  loa: number;
  dwt: number;
  calado?: number;
  agencia?: string;
  ordem_fila: number;
  status_cor: StatusCor;
  livre_pratica_ok: number; // 0 ou 1
  armazem_publico: number; // 0 ou 1
  eta_previsto?: string; // Previsão Oficial de Chegada (SISPORT)
  eta_ais?: string | null; // Previsão transmitida pelo transponder AIS (DataDocked)
  chegada_fundeio?: string;
  inicio_atracacao?: string;
  fim_atracacao?: string;
  latitude: number;
  longitude: number;
  sinal_antena?: string | null;
  ais_sincronizado_em?: string | null;
  progresso_operacao?: number | null; // % de progresso da operação no berço (SISPORT)
  ultima_atualizacao?: string;

  duracao_estimada_horas?: number;
  duracao_base_horas?: number;
  horas_chuva?: number;
  delta_t_manobra?: number;
  blocos?: TimelineBlock[];
  restricao_mare?: RestricaoMareNavio;
}

export type TipoExtremoMare = 'PREAMAR' | 'BAIXA_MAR';
export type TendenciaMare = 'SUBINDO' | 'DESCENDO' | 'ESTAVEL';

export interface MarePonto {
  dataHoraIso: string;
  altura_m: number;
  tipo?: TipoExtremoMare | 'INTERMEDIARIA';
  tendencia: TendenciaMare;
}

export interface MareExtremo {
  dataHoraIso: string;
  altura_m: number;
  tipo: TipoExtremoMare;
  label: string; // Ex: 'Preamar 1.35m' ou 'Baixa-mar 0.28m'
}

export interface MareStatusAtual {
  dataHoraIso: string;
  altura_m: number;
  tendencia: TendenciaMare;
  estacao: string; // 'Porto de São Sebastião (DHN)'
  proximoExtremo: MareExtremo;
  marareCorrenteDescricao: string; // Ex: 'Maré Enchendo (1.18m)'
}

export interface AnaliseManobraMare {
  dataHoraIso: string;
  tipoManobra: 'ATRACACAO' | 'DESATRACACAO';
  alturaMare: number;
  profundidadeTotalZh: number; // Profundidade do berço + maré
  ukcCalculado: number; // ProfundidadeTotalZh - calado
  ukcMinimoExigido: number; // 0.5m
  seguro: boolean;
  nivelRisco: 'SEGURO' | 'ATENCAO' | 'CRITICO';
  alertaMensagem?: string;
  proximaPreamar?: MareExtremo;
}

export interface RestricaoMareNavio {
  temRestricao: boolean;
  calado: number;
  profundidadeBercoZh: number;
  ukcMinimoExigido: number;
  mareMinimaRequerida: number; // Calado + UKC - ProfundidadeBerco
  atracacao?: AnaliseManobraMare;
  desatracacao?: AnaliseManobraMare;
  resumoAlerta?: string;
}

export interface TelemetriaMareCurrent {
  alturaMetros: number;
  tendencia: 'Enchendo' | 'Vazando' | 'Estável';
  proximaPreamar?: string;
  alturaPreamar?: number;
  proximaBaixamar?: string;
  alturaBaixamar?: number;
  atualizadoEm: string;
  timestamp: number;
  fonte: 'SP_PILOTS' | 'DHN_FALLBACK';
  mensagemStatus: string;
}

export interface RainForecastResponse {
  atual: {
    temperaturaAprox: number;
    precipitacaoMm: number;
    ventoKnots: number;
  };
  proximas24h: {
    horasComChuva: number;
    acumuladoMm: number;
    alertaParalisacao: boolean;
  };
  proximas72h: {
    horasComChuva: number;
    acumuladoMm: number;
  };
  serieHoraria: Array<{
    horaIso: string;
    precipitacaoMm: number;
    chovendo: boolean;
  }>;
  consultadoEm: string;
}

export interface MaresResponse {
  statusAtual: MareStatusAtual;
  curva: MarePonto[];
  extremos: MareExtremo[];
  telemetriaSpPilots?: TelemetriaMareCurrent;
  parametrosPorto: {
    profundidadeBercoZh: number;
    ukcMinimo: number;
    estacaoNome: string;
  };
}

export interface ResumoOperacional {
  taxa_ocupacao_berco: number;
  total_navios: number;
  navios_em_operacao: number;
  navios_fundeados: number;
  horas_ocupadas: number;
  volume_total_t: number;
}

export interface ClimaResumo {
  temperaturaAprox: number;
  precipitacaoAtual: number;
  horasChuvaProximas24h: number;
  ventoKnots: number;
}

export interface DataDockedVesselResult {
  imo: string;
  nome_navio: string;
  tipo_navio: string;
  mercadoria: string;
  volume_t: number;
  loa: number;
  dwt: number;
  calado: number;
  agencia: string;
  eta_previsto: string;
  eta_ais?: string;
  latitude: number;
  longitude: number;
  status_sugerido?: StatusCor;
  mmsi?: string;
  speed?: number;
  course?: number;
  destination?: string;
  navigationalStatus?: string;
  positionReceived?: string;
  updateTime?: string;
  sincronizado_em?: string;
}
