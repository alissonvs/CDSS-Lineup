export interface BercoData {
  id: string;
  numero: string;
  nome: string;
  tipo: 'comercial' | 'interno';
  extensao_m: number;
  profundidade_zh_m: number;
  calado_max_m: number;
  descricao: string;
  operacoes: string;
  coords: [number, number][];
  labelCoord: [number, number];
  cor: string;
  bordo?: string;
}

export const BERCOS_SAO_SEBASTIAO: BercoData[] = [
  {
    id: '101',
    numero: '101',
    nome: 'Cais Comercial (Berço 101)',
    tipo: 'comercial',
    extensao_m: 210,
    profundidade_zh_m: 10.0,
    calado_max_m: 8.5,
    descricao: 'Berço comercial principal da CDSS, face de acostagem externa contínua voltada para o Canal de São Sebastião.',
    operacoes: 'Graneis sólidos (açúcar, fertilizantes, barrilha, malte), carga geral, celulose, contêineres e cargas de projeto.',
    bordo: 'Bombordo / Boreste',
    cor: '#10b981', // Emerald
    coords: [
      [-23.81165, -45.39767],
      [-23.81071, -45.39661]
    ],
    // Posicionado no lado de terra (interior do píer), alinhado junto à linha do Cais 101 na metade inferior para não conflitar com navio atracado na cabeceira
    labelCoord: [-23.81132, -45.39736]
  },
  {
    id: '201',
    numero: '201',
    nome: 'Berço 201 (Cabeceira Interna)',
    tipo: 'interno',
    extensao_m: 51,
    profundidade_zh_m: 7.0,
    calado_max_m: 6.0,
    descricao: 'Cabeceira externa/norte da bacia interna do píer em formato "L".',
    operacoes: 'Apoio marítimo e portuário, pequenos graneleiros, barcaças e atracação de apoio.',
    bordo: 'Bombordo',
    cor: '#06b6d4', // Cyan
    coords: [
      [-23.81071, -45.39661],
      [-23.81038, -45.39695]
    ],
    // Posicionado no espelho d'água adjacente à cabeceira (topo direito do cais)
    labelCoord: [-23.81045, -45.39668]
  },
  {
    id: '202',
    numero: '202',
    nome: 'Berço 202 (Face Angular Interna)',
    tipo: 'interno',
    extensao_m: 75,
    profundidade_zh_m: 7.0,
    calado_max_m: 6.0,
    descricao: 'Trecho angular do cais interno voltado para a bacia de abrigo.',
    operacoes: 'Apoio offshore, rebocadores, suprimento marítimo e embarcações de cabotagem.',
    bordo: 'Boreste',
    cor: '#38bdf8', // Sky
    coords: [
      [-23.81038, -45.39695],
      [-23.81085, -45.39749]
    ],
    // Posicionado no espelho d'água adjacente à face angular
    labelCoord: [-23.81050, -45.39732]
  },
  {
    id: '203',
    numero: '203',
    nome: 'Berço 203 (Face Oeste Intermediária)',
    tipo: 'interno',
    extensao_m: 86,
    profundidade_zh_m: 7.0,
    calado_max_m: 5.8,
    descricao: 'Face intermediária interna equipada com defensas cilíndricas radiais.',
    operacoes: 'Embarcações de fiscalização (Marinha, PF, Receita), lanchas de Praticagem e apoio portuário.',
    bordo: 'Boreste',
    cor: '#38bdf8', // Sky
    coords: [
      [-23.81085, -45.39749],
      [-23.81089, -45.39834]
    ],
    // Posicionado no espelho d'água logo acima da face horizontal
    labelCoord: [-23.81075, -45.39792]
  },
  {
    id: '204',
    numero: '204',
    nome: 'Berço 204 (Face Raiz / Abrigo)',
    tipo: 'interno',
    extensao_m: 95,
    profundidade_zh_m: 4.5,
    calado_max_m: 3.8,
    descricao: 'Trecho interno próximo à raiz do cais, águas calmas para serviços e manutenção de apoio.',
    operacoes: 'Lanchas rápidas de praticagem, catamarãs de apoio, abastecimento e prontidão de serviços.',
    bordo: 'Boreste',
    cor: '#0ea5e9', // Sky blue
    coords: [
      [-23.81089, -45.39834],
      [-23.81076, -45.39851],
      [-23.81052, -45.39874],
      [-23.81036, -45.39905]
    ],
    // Posicionado no espelho d'água centralizado ao longo da face inclinada de atracação
    labelCoord: [-23.81052, -45.39868]
  }
];
