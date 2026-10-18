import { describe, it, expect, vi } from 'vitest';
import {
  parseDateIso,
  toIsoUtc,
  calcularDuracaoNavio,
  calcularDesatracacaoDinamicaNavioVerde,
  invalidarCacheLineup,
  recalcularLineupComMotor,
  isBercoPortoPublico,
  obterPesoCategoriaManobra,
  isCompativelBerco202,
  obterPranchaParaMercadoria
} from '../src/services/engine.js';
import { identificarBercoPorCoordenadas } from '../src/services/bercoGeoService.js';
import { parseJsStringArray } from '../src/services/praticagemService.js';
import { parseBrNumber, parseBrDate } from '../src/services/sisportSync.js';
import { encontrarProximaJanelaPreamarCompativel } from '../src/services/tideService.js';
import { NavioLineup, PranchaProdutividade } from '../src/types/index.js';

// Mock do serviço meteorológico para testes determinísticos sem dependência de rede externa
vi.mock('../src/services/weather.js', () => ({
  obterHorasChuva: vi.fn().mockImplementation(async () => 1.5),
  obterClimaAtual: vi.fn().mockResolvedValue({}),
  obterPrevisaoTempo: vi.fn().mockResolvedValue([])
}));

describe('1. Parsing de Datas e Fusos Horários (parseDateIso & toIsoUtc)', () => {
  it('deve interpretar corretamente string ISO com sufixo Z', () => {
    const d = parseDateIso('2026-10-18T15:00:00Z');
    expect(d).not.toBeNull();
    expect(d?.toISOString()).toBe('2026-10-18T15:00:00.000Z');
  });

  it('deve interpretar corretamente string ISO com offset de fuso (-03:00)', () => {
    const d = parseDateIso('2026-10-18T12:00:00-03:00');
    expect(d).not.toBeNull();
    expect(d?.toISOString()).toBe('2026-10-18T15:00:00.000Z');
  });

  it('deve aplicar fuso de Brasília (BRT, UTC-3) para datas sem fuso horário', () => {
    const d = parseDateIso('2026-10-18 12:00:00');
    expect(d).not.toBeNull();
    expect(d?.toISOString()).toBe('2026-10-18T15:00:00.000Z');
  });

  it('deve retornar null para valores nulos, vazios ou inválidos', () => {
    expect(parseDateIso(null)).toBeNull();
    expect(parseDateIso(undefined)).toBeNull();
    expect(parseDateIso('')).toBeNull();
    expect(parseDateIso('   ')).toBeNull();
    expect(parseDateIso('data-invalida')).toBeNull();
  });

  it('toIsoUtc deve formatar Date em ISO UTC invariante com terminação Z', () => {
    const d = new Date('2026-10-18T15:30:45.123Z');
    expect(toIsoUtc(d)).toBe('2026-10-18T15:30:45Z');
  });
});

describe('2. Parsers de Dados SISPORT e Praticagem', () => {
  it('parseBrNumber deve converter números com pontuação brasileira', () => {
    expect(parseBrNumber('27.500,500')).toBe(27500.5);
    expect(parseBrNumber('1.250')).toBe(1250);
    expect(parseBrNumber('0,00')).toBe(0);
    expect(parseBrNumber('')).toBe(0);
    expect(parseBrNumber('invalido')).toBe(0);
  });

  it('parseBrDate deve converter formato DD/MM/AAAA para ISO BRT', () => {
    const iso = parseBrDate('18/10/2026', '08:00:00');
    expect(iso).toBe('2026-10-18T08:00:00-03:00');
  });

  it('parseJsStringArray deve extrair strings sem usar eval()', () => {
    const raw = "['PRATICAGEM', 'LIZZY CONFIDENCE', 'ATLANTIS', 'D\\'AGUA']";
    const parsed = parseJsStringArray(raw);
    expect(parsed).toEqual(['PRATICAGEM', 'LIZZY CONFIDENCE', 'ATLANTIS', "D'AGUA"]);
  });
});

describe('3. Geofencing e Identificação de Berços (bercoGeoService)', () => {
  it('deve identificar o Berço 101 para coordenadas da face comercial com alta confiança', () => {
    // Coordenadas reais de acostagem do Berço 101
    const res = identificarBercoPorCoordenadas(-23.8114, -45.3974);
    expect(res).not.toBeNull();
    expect(res?.berco).toBe('101');
    expect(res?.dentroTolerancia).toBe(true);
    expect(res?.confianca).toBe('ALTA');
  });

  it('deve identificar o Berço 202 para coordenadas da bacia interna', () => {
    // Coordenadas do Berço 202
    const res = identificarBercoPorCoordenadas(-23.8105, -45.3971);
    expect(res).not.toBeNull();
    expect(res?.berco).toBe('202');
    expect(res?.dentroTolerancia).toBe(true);
  });

  it('deve retornar null para navio fora do cais (ex: no fundeio ou alto-mar)', () => {
    // Coordenadas da barra / fundeio (longe do cais)
    const res = identificarBercoPorCoordenadas(-23.8300, -45.4100);
    expect(res).toBeNull();
  });
});

describe('4. Cálculo de Duração de Berço (calcularDuracaoNavio)', () => {
  const pranchasMock: Record<string, PranchaProdutividade> = {
    'Trigo': {
      mercadoria: 'Trigo',
      prancha_minima_dia: 2500,
      pmd_historica: 3000,
      sensivel_chuva: 1
    },
    'Animais Vivos': {
      mercadoria: 'Animais Vivos',
      prancha_minima_dia: 2200,
      pmd_historica: 2500,
      sensivel_chuva: 0
    }
  };

  it('deve calcular duração base e somar folga de manobra regulamentar de 2.0h', async () => {
    const navio: NavioLineup = {
      imo: '9123456',
      nome_navio: 'VESSEL TEST',
      mercadoria: 'Trigo',
      volume_t: 3000, // Com PMD de 3000 t/dia = 125 t/h => 24.0 horas
      loa: 180,
      dwt: 35000,
      ordem_fila: 1,
      status_cor: 'LARANJA',
      livre_pratica_ok: 1,
      armazem_publico: 0,
      latitude: -23.81,
      longitude: -45.39
    };

    const inicio = new Date('2026-10-18T10:00:00Z');
    const calc = await calcularDuracaoNavio(navio, pranchasMock, inicio);

    expect(calc.duracaoBaseHoras).toBe(24);
    // Tempo total deve ser duracaoBase (24) + horasChuva (>=0) + DELTA_T_MANOBRA (2.0)
    expect(calc.tempoTotalHoras).toBeGreaterThanOrEqual(26.0);
  });

  it('carga de Animais Vivos não deve suspender por chuva (sensivel_chuva = 0)', async () => {
    const navio: NavioLineup = {
      imo: '9654321',
      nome_navio: 'LIVESTOCK EXPRESS',
      mercadoria: 'Animais Vivos',
      volume_t: 2500, // 2500 t / (2500/24) = 24.0 h
      loa: 135,
      dwt: 7000,
      ordem_fila: 1,
      status_cor: 'AZUL',
      livre_pratica_ok: 1,
      armazem_publico: 0,
      latitude: -23.81,
      longitude: -45.39
    };

    const inicio = new Date('2026-10-18T10:00:00Z');
    const calc = await calcularDuracaoNavio(navio, pranchasMock, inicio);

    expect(calc.duracaoBaseHoras).toBe(24);
    expect(calc.horasChuva).toBe(0);
    expect(calc.tempoTotalHoras).toBe(26); // 24 + 0 + 2
  });
});

describe('5. Dinâmica de Navio Operando no Berço (calcularDesatracacaoDinamicaNavioVerde)', () => {
  const pranchasMock: Record<string, PranchaProdutividade> = {
    'Trigo': {
      mercadoria: 'Trigo',
      prancha_minima_dia: 2400,
      pmd_historica: 2400, // 100 t/h
      sensivel_chuva: 0
    }
  };

  it('deve usar método TEORICO quando progresso_operacao for 0% ou null sem falhar', async () => {
    const agora = new Date('2026-10-18T14:00:00Z');
    const berthedAtMs = new Date('2026-10-18T06:00:00Z').getTime();

    const navioComNull: NavioLineup = {
      imo: '9111111',
      nome_navio: 'OPERATING VESSEL NULL PROGRESS',
      mercadoria: 'Trigo',
      volume_t: 2400,
      loa: 175,
      dwt: 28000,
      ordem_fila: 1,
      status_cor: 'VERDE',
      progresso_operacao: null,
      livre_pratica_ok: 1,
      armazem_publico: 0,
      latitude: -23.8114,
      longitude: -45.3974
    };

    const res = await calcularDesatracacaoDinamicaNavioVerde(navioComNull, pranchasMock, berthedAtMs, agora);
    expect(res.metodo).toBe('TEORICO');
    expect(res.volumeRestanteT).toBe(2400);
    expect(res.tempoRestanteHoras).toBeGreaterThan(0);
    expect(res.etdProjetadoMs).toBeGreaterThan(agora.getTime());
  });

  it('deve calcular volume restante e projetar ETD com base no progresso real', async () => {
    const agora = new Date('2026-10-18T14:00:00Z');
    const berthedAtMs = new Date('2026-10-18T06:00:00Z').getTime(); // Operando há 8h

    const navioComProgresso: NavioLineup = {
      imo: '9222222',
      nome_navio: 'OPERATING VESSEL 50PCT',
      mercadoria: 'Trigo',
      volume_t: 2400,
      loa: 175,
      dwt: 28000,
      ordem_fila: 1,
      status_cor: 'VERDE',
      progresso_operacao: 50, // 50% concluído (1200t operadas, 1200t restantes)
      livre_pratica_ok: 1,
      armazem_publico: 0,
      latitude: -23.8114,
      longitude: -45.3974
    };

    const res = await calcularDesatracacaoDinamicaNavioVerde(navioComProgresso, pranchasMock, berthedAtMs, agora);
    expect(res.metodo).toBe('PROGRESSO_REAL');
    expect(res.volumeRestanteT).toBe(1200);
    expect(res.tempoRestanteHoras).toBeGreaterThan(0);
    expect(res.etdProjetadoMs).toBeGreaterThan(agora.getTime());
  });
});

describe('6. Cache em Memória e Mutex de Concorrência (invalidarCacheLineup)', () => {
  it('invalidarCacheLineup deve ser uma função executável sem efeitos colaterais', () => {
    expect(typeof invalidarCacheLineup).toBe('function');
    expect(() => invalidarCacheLineup()).not.toThrow();
  });
});

describe('7. Validação Estrita de Berços Públicos do Porto (isBercoPortoPublico)', () => {
  it('deve aceitar berços oficiais do Porto Público de São Sebastião (CDSS)', () => {
    expect(isBercoPortoPublico('CAIS')).toBe(true);
    expect(isBercoPortoPublico('CINT')).toBe(true);
    expect(isBercoPortoPublico('101')).toBe(true);
    expect(isBercoPortoPublico('201')).toBe(true);
    expect(isBercoPortoPublico('202')).toBe(true);
    expect(isBercoPortoPublico('203')).toBe(true);
    expect(isBercoPortoPublico('204')).toBe(true);
    expect(isBercoPortoPublico('CS1')).toBe(true);
    expect(isBercoPortoPublico('CS2')).toBe(true);
    expect(isBercoPortoPublico('CN1')).toBe(true);
    expect(isBercoPortoPublico('CN2')).toBe(true);
    expect(isBercoPortoPublico('BERCO 101')).toBe(true);
    expect(isBercoPortoPublico('BERÇO 202')).toBe(true);
  });

  it('deve rejeitar estritamente píeres do Tebar (P1 a P4)', () => {
    expect(isBercoPortoPublico('P1')).toBe(false);
    expect(isBercoPortoPublico('P2')).toBe(false);
    expect(isBercoPortoPublico('P3')).toBe(false);
    expect(isBercoPortoPublico('P4')).toBe(false);
    expect(isBercoPortoPublico('TEBAR P1')).toBe(false);
    expect(isBercoPortoPublico('PIER 2')).toBe(false);
  });

  it('deve rejeitar estritamente áreas de fundeio da barra (F1 a F7)', () => {
    expect(isBercoPortoPublico('F1')).toBe(false);
    expect(isBercoPortoPublico('F2')).toBe(false);
    expect(isBercoPortoPublico('F3')).toBe(false);
    expect(isBercoPortoPublico('F4')).toBe(false);
    expect(isBercoPortoPublico('F5')).toBe(false);
    expect(isBercoPortoPublico('F6')).toBe(false);
    expect(isBercoPortoPublico('F7')).toBe(false);
    expect(isBercoPortoPublico('FUNDEIO F3')).toBe(false);
  });

  it('deve retornar false para valores nulos, vazios ou indefinidos', () => {
    expect(isBercoPortoPublico(null)).toBe(false);
    expect(isBercoPortoPublico(undefined)).toBe(false);
    expect(isBercoPortoPublico('')).toBe(false);
    expect(isBercoPortoPublico('   ')).toBe(false);
  });
});

describe('8. Hierarquia e Ponderação de Manobras da Praticagem (obterPesoCategoriaManobra)', () => {
  it('deve atribuir pesos estritamente decrescentes conforme o nível de certeza operacional', () => {
    const pEncerradas = obterPesoCategoriaManobra('ENCERRADAS');
    const pAndamento = obterPesoCategoriaManobra('EM_ANDAMENTO');
    const pConfirmadas = obterPesoCategoriaManobra('CONFIRMADAS');
    const pAgente = obterPesoCategoriaManobra('CONFIRMADAS_AGENTE');
    const pSolicitadas = obterPesoCategoriaManobra('SOLICITADAS');

    expect(pEncerradas).toBe(5);
    expect(pAndamento).toBe(4);
    expect(pConfirmadas).toBe(3);
    expect(pAgente).toBe(2);
    expect(pSolicitadas).toBe(1);

    expect(pEncerradas).toBeGreaterThan(pAndamento);
    expect(pAndamento).toBeGreaterThan(pConfirmadas);
    expect(pConfirmadas).toBeGreaterThan(pAgente);
    expect(pAgente).toBeGreaterThan(pSolicitadas);
  });

  it('deve normalizar variações com espaços ou descrições textuais', () => {
    expect(obterPesoCategoriaManobra('EM ANDAMENTO')).toBe(4);
    expect(obterPesoCategoriaManobra('CONFIRMADAS PELO AGENTE')).toBe(2);
    expect(obterPesoCategoriaManobra('DESCONHECIDO')).toBe(0);
    expect(obterPesoCategoriaManobra('')).toBe(0);
    expect(obterPesoCategoriaManobra(null)).toBe(0);
  });
});

describe('9. Salvaguardas de Frescor e Velocidade na Identificação Georreferenciada (Item 2.8)', () => {
  const agoraRef = new Date('2026-10-18T12:00:00Z');

  it('deve rejeitar coordenadas quando navio estiver em velocidade (SOG >= 0.5 kn)', () => {
    // Coordenadas válidas do Berço 101, mas navegando a 0.8 kn
    const res = identificarBercoPorCoordenadas(-23.8114, -45.3974, 0.8, 85, agoraRef.toISOString(), agoraRef);
    expect(res).toBeNull();
  });

  it('deve aceitar coordenadas quando navio estiver em atracação estável (SOG < 0.5 kn)', () => {
    // Coordenadas válidas do Berço 101 com SOG de 0.1 kn
    const res = identificarBercoPorCoordenadas(-23.8114, -45.3974, 0.1, 85, agoraRef.toISOString(), agoraRef);
    expect(res).not.toBeNull();
    expect(res?.berco).toBe('101');
  });

  it('deve descartar telemetria AIS desatualizada com mais de 6 horas de defasagem', () => {
    // Leitura emitida 7 horas atrás
    const timestampAntigo = new Date(agoraRef.getTime() - 7 * 3600 * 1000).toISOString();
    const res = identificarBercoPorCoordenadas(-23.8114, -45.3974, 0.0, 85, timestampAntigo, agoraRef);
    expect(res).toBeNull();
  });

  it('deve aceitar telemetria AIS recente emitida há menos de 6 horas', () => {
    // Leitura emitida há 2 horas
    const timestampRecente = new Date(agoraRef.getTime() - 2 * 3600 * 1000).toISOString();
    const res = identificarBercoPorCoordenadas(-23.8114, -45.3974, 0.0, 85, timestampRecente, agoraRef);
    expect(res).not.toBeNull();
    expect(res?.berco).toBe('101');
  });
});

describe('10. Compatibilidade Física e Operacional com o Berço 202 (Item 2.7)', () => {
  it('deve considerar compatível navio de apoio/cabotagem com LOA <= 75m e calado <= 6.0m', () => {
    const navioApoio: Partial<NavioLineup> = {
      loa: 65,
      calado: 5.2,
      mercadoria: 'Apoio Marítimo'
    };
    expect(isCompativelBerco202(navioApoio as NavioLineup)).toBe(true);
  });

  it('deve rejeitar navio com LOA > 75m para o Berço 202', () => {
    const navioLongo: Partial<NavioLineup> = {
      loa: 120,
      calado: 5.5,
      mercadoria: 'Carga Geral'
    };
    expect(isCompativelBerco202(navioLongo as NavioLineup)).toBe(false);
  });

  it('deve rejeitar navio com calado > 6.0m para o Berço 202', () => {
    const navioCalado: Partial<NavioLineup> = {
      loa: 70,
      calado: 6.8,
      mercadoria: 'Carga Geral'
    };
    expect(isCompativelBerco202(navioCalado as NavioLineup)).toBe(false);
  });

  it('deve rejeitar navios com granéis sólidos ou carga viva que exigem infraestrutura exclusiva do Berço 101', () => {
    const navioCevada: Partial<NavioLineup> = {
      loa: 70,
      calado: 5.5,
      mercadoria: 'Cevada a Granel'
    };
    const navioGado: Partial<NavioLineup> = {
      loa: 70,
      calado: 5.5,
      mercadoria: 'Carga Viva (Animais Vivos)'
    };
    expect(isCompativelBerco202(navioCevada as NavioLineup)).toBe(false);
    expect(isCompativelBerco202(navioGado as NavioLineup)).toBe(false);
  });
});

describe('11. Ajuste Dinâmico por Restrição de Maré (Item 2.6 - Dynamic Draft Windowing)', () => {
  it('deve manter o horário original quando o calado for seguro para a profundidade do berço', () => {
    const dataMinima = new Date('2026-10-18T10:00:00Z');
    // Calado 7.5m em berço de 10.0m ZH (UKC > 2.5m)
    const res = encontrarProximaJanelaPreamarCompativel(7.5, dataMinima, 10.0);
    expect(res.ajustadoPorMare).toBe(false);
    expect(res.excedeCapacidadeFisica).toBe(false);
    expect(res.dataPreamar.getTime()).toBe(dataMinima.getTime());
  });

  it('deve buscar e ajustar para a próxima preamar compatível quando houver restrição de calado', () => {
    const dataMinima = new Date('2026-10-18T06:00:00Z');
    // Calado 10.2m em berço de 10.0m ZH requer maré de pelo menos 0.70m para garantir UKC >= 0.5m
    const res = encontrarProximaJanelaPreamarCompativel(10.2, dataMinima, 10.0);
    expect(res.ajustadoPorMare).toBe(true);
    expect(res.excedeCapacidadeFisica).toBe(false);
    expect(res.dataPreamar.getTime()).toBeGreaterThan(dataMinima.getTime());
    expect(res.ukcCalculado).toBeGreaterThanOrEqual(0.5);
  });

  it('deve acusar excedente de capacidade física para calado excessivo impossível de viabilizar', () => {
    const dataMinima = new Date('2026-10-18T10:00:00Z');
    // Calado 13.5m em berço de 10.0m ZH (mesmo com maré máxima de 1.6m é fisicamente inviável)
    const res = encontrarProximaJanelaPreamarCompativel(13.5, dataMinima, 10.0);
    expect(res.excedeCapacidadeFisica).toBe(true);
    expect(res.ajustadoPorMare).toBe(false);
  });
});

describe('12. Calibração de Pranchas e Métricas de Acurácia (Fase 5 - Itens 4.2 e 4.3)', () => {
  it('deve categorizar granéis vegetais (Trigo/Malte/Cevada) com produtividade calibrada (4.500 t/dia)', () => {
    const pranchaTrigo = obterPranchaParaMercadoria('TRIGO A GRANEL');
    expect(pranchaTrigo.pmd_historica).toBe(4500);
    expect(pranchaTrigo.sensivel_chuva).toBe(1);

    const pranchaMalte = obterPranchaParaMercadoria('MALTE');
    expect(pranchaMalte.pmd_historica).toBe(4500);
    expect(pranchaMalte.sensivel_chuva).toBe(1);

    const pranchaCevada = obterPranchaParaMercadoria('CEVADA / MALTE');
    expect(pranchaCevada.pmd_historica).toBe(4500);
    expect(pranchaCevada.sensivel_chuva).toBe(1);
  });

  it('deve categorizar Carga Viva com PMD de 3.500 t/dia e insensibilidade à chuva (sensivel_chuva = 0)', () => {
    const prancha = obterPranchaParaMercadoria('ANIMAIS VIVOS');
    expect(prancha.pmd_historica).toBe(3500);
    expect(prancha.prancha_minima_dia).toBe(2500);
    expect(prancha.sensivel_chuva).toBe(0);
  });

  it('deve categorizar granéis minerais/químicos como Barrilha (3.200 t/dia) e Alumina (3.800 t/dia)', () => {
    const pranchaBarrilha = obterPranchaParaMercadoria('BARRILHA');
    expect(pranchaBarrilha.pmd_historica).toBe(3200);

    const pranchaAlumina = obterPranchaParaMercadoria('ALUMINA CALCINADA');
    expect(pranchaAlumina.pmd_historica).toBe(3800);
    expect(pranchaAlumina.sensivel_chuva).toBe(1);
  });

  it('deve categorizar Carga Projeto e Café como insensíveis à chuva com PMD de 2.000 t/dia', () => {
    const pranchaProjeto = obterPranchaParaMercadoria('CARGA PROJETO');
    expect(pranchaProjeto.pmd_historica).toBe(2000);
    expect(pranchaProjeto.sensivel_chuva).toBe(0);

    const pranchaCafe = obterPranchaParaMercadoria('CAFE');
    expect(pranchaCafe.pmd_historica).toBe(2000);
    expect(pranchaCafe.sensivel_chuva).toBe(0);
  });

  it('deve calcular duração calibrada realista para navio de Alumina (ex: 29.230 t em ~184h em vez de >300h)', async () => {
    const navioIndianOcean: NavioLineup = {
      imo: '9312345',
      nome_navio: 'INDIAN OCEAN',
      mercadoria: 'ALUMINA CALCINADA',
      volume_t: 29230,
      loa: 190,
      dwt: 55000,
      ordem_fila: 10,
      status_cor: 'AZUL',
      livre_pratica_ok: 1,
      armazem_publico: 0,
      latitude: -23.81,
      longitude: -45.39
    };

    const inicio = new Date('2026-10-18T10:00:00Z');
    const calc = await calcularDuracaoNavio(navioIndianOcean, {}, inicio);

    // 29230 / (3800 / 24) = 184.6h de base (em vez das antigas 318.8h!)
    expect(calc.duracaoBaseHoras).toBeCloseTo(184.6, 0.5);
    // Tempo total deve ser duracaoBase + chuva + folga 2.0h
    expect(calc.tempoTotalHoras).toBeGreaterThan(184.6);
    expect(calc.tempoTotalHoras).toBeLessThan(220.0);
  });

  it('deve calcular duração calibrada realista para navio de Malte (ex: 25.000 t em ~133h em vez de 230h)', async () => {
    const navioOccitan: NavioLineup = {
      imo: '9456123',
      nome_navio: 'OCCITAN PAUILLAC',
      mercadoria: 'MALTE',
      volume_t: 25000,
      loa: 180,
      dwt: 38000,
      ordem_fila: 9,
      status_cor: 'AZUL',
      livre_pratica_ok: 1,
      armazem_publico: 0,
      latitude: -23.81,
      longitude: -45.39
    };

    const inicio = new Date('2026-10-18T10:00:00Z');
    const calc = await calcularDuracaoNavio(navioOccitan, {}, inicio);

    // 25000 / (4500 / 24) = 133.3h de base (em vez das antigas 230h!)
    expect(calc.duracaoBaseHoras).toBeCloseTo(133.3, 0.5);
    expect(calc.tempoTotalHoras).toBeGreaterThan(133.3);
    expect(calc.tempoTotalHoras).toBeLessThan(160.0);
  });
});


