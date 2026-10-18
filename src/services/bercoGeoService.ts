/**
 * Serviço de Identificação e Geofencing de Berços do Porto de São Sebastião (CDSS)
 * Calcula a distância ortodrômica/euclidiana projetada entre as coordenadas AIS do navio
 * e a linha de acostagem física de cada berço para determinar a atracação real.
 */

export interface BercoGeometria {
  id: string;
  numero: string;
  nome: string;
  tipo: 'comercial' | 'interno';
  extensao_m: number;
  profundidade_zh_m: number;
  calado_max_m: number;
  descricao: string;
  coords: [number, number][]; // Polilinha da face de acostagem: [[lat, lon], ...]
}

export interface ResultadoIdentificacaoBerco {
  berco: string;
  nomeBerco: string;
  tipo: 'comercial' | 'interno';
  distanciaMetros: number;
  confianca: 'ALTA' | 'MEDIA' | 'BAIXA';
  dentroTolerancia: boolean;
}

/**
 * Geometria exata das faces de acostagem dos berços do Porto de São Sebastião (WGS84)
 * Mapeada com base na planta oficial da CDSS e no KMZ oficial da Portaria 501/2019
 */
export const BERCOS_SAO_SEBASTIAO_GEOMETRIA: BercoGeometria[] = [
  {
    id: '101',
    numero: '101',
    nome: 'Cais Comercial (Berço 101)',
    tipo: 'comercial',
    extensao_m: 210,
    profundidade_zh_m: 10.0,
    calado_max_m: 8.5,
    descricao: 'Face externa contínua voltada para o Canal de São Sebastião.',
    coords: [
      [-23.81165, -45.39767],
      [-23.81071, -45.39661]
    ]
  },
  {
    id: '201',
    numero: '201',
    nome: 'Berço 201 (Cabeceira Interna)',
    tipo: 'interno',
    extensao_m: 51,
    profundidade_zh_m: 7.0,
    calado_max_m: 6.0,
    descricao: 'Cabeceira norte da bacia interna do píer em formato L.',
    coords: [
      [-23.81071, -45.39661],
      [-23.81038, -45.39695]
    ]
  },
  {
    id: '202',
    numero: '202',
    nome: 'Berço 202 (Face Angular Interna)',
    tipo: 'interno',
    extensao_m: 75,
    profundidade_zh_m: 7.0,
    calado_max_m: 6.0,
    descricao: 'Face intermediária angular interna da bacia de abrigo.',
    coords: [
      [-23.81038, -45.39695],
      [-23.81085, -45.39749]
    ]
  },
  {
    id: '203',
    numero: '203',
    nome: 'Berço 203 (Face Oeste Intermediária)',
    tipo: 'interno',
    extensao_m: 86,
    profundidade_zh_m: 7.0,
    calado_max_m: 5.8,
    descricao: 'Face horizontal interna equipada com defensas radiais.',
    coords: [
      [-23.81085, -45.39749],
      [-23.81089, -45.39834]
    ]
  },
  {
    id: '204',
    numero: '204',
    nome: 'Berço 204 (Face Raiz / Abrigo)',
    tipo: 'interno',
    extensao_m: 95,
    profundidade_zh_m: 4.5,
    calado_max_m: 3.8,
    descricao: 'Trecho interno da raiz do cais, águas calmas para apoio marítimo.',
    coords: [
      [-23.81089, -45.39834],
      [-23.81076, -45.39851],
      [-23.81052, -45.39874],
      [-23.81036, -45.39905]
    ]
  }
];

/**
 * Calcula a distância perpendicular em metros de um ponto (lat, lon) a um segmento [p1, p2].
 * Utiliza projeção plana conforme local centrada em São Sebastião (-23.810° S, -45.397° W).
 */
export function calcularDistanciaPontoSegmentoMetros(
  lat: number,
  lon: number,
  p1: [number, number],
  p2: [number, number]
): number {
  const METROS_POR_GRAU_LAT = 111320;
  // Na latitude de São Sebastião (-23.81°), 1 grau de longitude corresponde a ~101.844 metros
  const METROS_POR_GRAU_LON = 111320 * Math.cos((-23.810 * Math.PI) / 180);

  const px = lon * METROS_POR_GRAU_LON;
  const py = lat * METROS_POR_GRAU_LAT;

  const ax = p1[1] * METROS_POR_GRAU_LON;
  const ay = p1[0] * METROS_POR_GRAU_LAT;

  const bx = p2[1] * METROS_POR_GRAU_LON;
  const by = p2[0] * METROS_POR_GRAU_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  }

  // Fator paramétrico clampado no intervalo [0, 1]
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const projX = ax + t * dx;
  const projY = ay + t * dy;

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}

/**
 * Identifica automaticamente qual berço o navio está atracado a partir de suas coordenadas AIS/GPS.
 * 
 * @param lat Latitude WGS84
 * @param lon Longitude WGS84
 * @param sogKnots Velocidade sobre o fundo (SOG). Se >= 0.5 nós, considera que o navio está em navegação/manobra.
 * @param toleranciaMaximaMetros Limiar máximo de tolerância para atracação (padrão: 85m, cobrindo boca e antena na popa).
 * @param timestampIso Timestamp da última leitura AIS (descarta posições com defasagem > 6 horas).
 * @param agoraRef Timestamp de referência para cálculo da defasagem (padrão: Date.now()).
 * @returns Resultado detalhado da identificação ou null se o navio não estiver atracado em nenhum berço.
 */
export function identificarBercoPorCoordenadas(
  lat: number,
  lon: number,
  sogKnots?: number | null,
  toleranciaMaximaMetros = 85,
  timestampIso?: string | number | Date | null,
  agoraRef?: Date
): ResultadoIdentificacaoBerco | null {
  // 1. Salvaguarda de velocidade: se o navio estiver com SOG >= 0.5 nós, não está em atracação estável
  if (sogKnots !== undefined && sogKnots !== null && Number(sogKnots) >= 0.5) {
    return null;
  }

  // 2. Salvaguarda de frescor da posição AIS: descarta se a leitura tiver mais de 6 horas de defasagem
  if (timestampIso !== undefined && timestampIso !== null) {
    const ts = typeof timestampIso === 'number' ? timestampIso : new Date(timestampIso).getTime();
    if (!isNaN(ts)) {
      const now = agoraRef ? agoraRef.getTime() : Date.now();
      const MAX_AGE_MS = 6 * 3600 * 1000; // 6 horas
      const ageMs = now - ts;
      if (ageMs > MAX_AGE_MS) {
        return null;
      }
    }
  }

  // 3. Limite geográfico da bacia e cais do Porto de São Sebastião
  // Coordenadas válidas no entorno do terminal CDSS: Lat entre -23.820 e -23.800, Lon entre -45.410 e -45.385
  if (lat < -23.825 || lat > -23.795 || lon < -45.415 || lon > -45.380) {
    return null;
  }

  let melhorBerco: BercoGeometria | null = null;
  let menorDistancia = Infinity;

  for (const berco of BERCOS_SAO_SEBASTIAO_GEOMETRIA) {
    for (let i = 0; i < berco.coords.length - 1; i++) {
      const p1 = berco.coords[i];
      const p2 = berco.coords[i + 1];
      const dist = calcularDistanciaPontoSegmentoMetros(lat, lon, p1, p2);
      if (dist < menorDistancia) {
        menorDistancia = dist;
        melhorBerco = berco;
      }
    }
  }

  // 3. Se a menor distância exceder a tolerância de atracação, está no espelho d'água livre / fundeio
  if (!melhorBerco || menorDistancia > toleranciaMaximaMetros) {
    return null;
  }

  const confianca: 'ALTA' | 'MEDIA' | 'BAIXA' =
    menorDistancia <= 35 ? 'ALTA' : menorDistancia <= 65 ? 'MEDIA' : 'BAIXA';

  return {
    berco: melhorBerco.numero,
    nomeBerco: melhorBerco.nome,
    tipo: melhorBerco.tipo,
    distanciaMetros: Math.round(menorDistancia * 10) / 10,
    confianca,
    dentroTolerancia: true
  };
}
