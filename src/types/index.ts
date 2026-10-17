export type StatusCor = 'LARANJA' | 'VERMELHO' | 'CINZA' | 'VERDE' | 'AZUL';

export type TipoTimelineBlock =
  | 'PREVISTO_FUNDEIO'
  | 'FUNDEADO_OPERACAO'
  | 'OPERACAO_DESATRACACAO'
  | 'VERDE'
  | 'AZUL'
  | 'VERMELHO'
  | 'LARANJA';

export interface MilestoneMarker {
  id: 'previsaoSisport' | 'fundeio' | 'inicioOperacao' | 'desatracacao';
  label: string;
  dataIso: string;
}

export interface TimelineBlock {
  tipo: TipoTimelineBlock;
  label: string;
  inicioIso: string;
  fimIso: string;
  duracaoHoras: number;
  caladoCritico?: boolean;
}

export interface NavioLineup {
  id?: number;
  imo: string;
  nome_navio: string;
  tipo_navio?: string;
  mercadoria: string;
  volume_t: number;
  loa: number;
  dwt: number;
  calado?: number;
  calado_entrada?: number; // Calado na atracação (m)
  calado_saida?: number; // Calado na desatracação (m)
  agencia?: string;
  ordem_fila: number;
  status_cor: StatusCor;
  livre_pratica_ok: number; // 0 ou 1
  armazem_publico: number; // 0 ou 1
  eta_previsto?: string; // Previsão Oficial de Chegada (SISPORT)
  eta_ais?: string | null; // Previsão transmitida pelo transponder AIS (DataDocked)
  inicio_operacao?: string | null; // Início da Operação (Previsão / Real)
  chegada_fundeio?: string;
  inicio_atracacao?: string;
  fim_atracacao?: string;
  latitude: number;
  longitude: number;
  sinal_antena?: string | null;
  ais_sincronizado_em?: string | null;
  progresso_operacao?: number | null; // % de progresso da operação no berço (SISPORT)
  ultima_atualizacao?: string;

  // Campos calculados em tempo de execução pelo motor
  berco?: string; // Berço designado ('101', '201', '202', etc.)
  duracao_estimada_horas?: number;
  duracao_base_horas?: number;
  horas_chuva?: number;
  delta_t_manobra?: number;
  blocos?: TimelineBlock[];
  marcos?: MilestoneMarker[];
  restricao_mare?: RestricaoMareNavio;
  origem_previsao_fim?: 'CALCULADO' | 'PRATICAGEM' | 'MANUAL';
  manobra_praticagem_id?: number | null;
  manobra_praticagem_str?: string | null;
  ajuste_praticagem_ativo?: number;
  volume_restante_t?: number;
  taxa_efetiva_t_hora?: number;
  tempo_restante_horas?: number;
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
  caladoManobra: number; // Calado específico utilizado nesta manobra
  ukcCalculado: number; // ProfundidadeTotalZh - caladoManobra
  ukcMinimoExigido: number; // 0.5m
  seguro: boolean;
  nivelRisco: 'SEGURO' | 'ATENCAO' | 'CRITICO';
  alertaMensagem?: string;
  proximaPreamar?: MareExtremo;
}

export interface RestricaoMareNavio {
  temRestricao: boolean;
  calado: number; // calado geral
  caladoEntrada: number; // calado na atracação
  caladoSaida: number; // calado na desatracação
  profundidadeBercoZh: number;
  ukcMinimoExigido: number;
  mareMinimaRequerida: number; // Maior maré requerida
  mareMinimaRequeridaEntrada: number;
  mareMinimaRequeridaSaida: number;
  atracacao?: AnaliseManobraMare;
  desatracacao?: AnaliseManobraMare;
  resumoAlerta?: string;
}

export interface MaresResponse {
  statusAtual: MareStatusAtual;
  curva: MarePonto[];
  extremos: MareExtremo[];
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

export interface PranchaProdutividade {
  mercadoria: string;
  prancha_minima_dia: number;
  pmd_historica: number;
  sensivel_chuva: number; // 1 ou 0
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
