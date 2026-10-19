import https from 'https';
import { getDatabase } from '../database/connection.js';
import { recalcularLineupComMotor, finalizarSnapshotPrevisao } from './engine.js';
import { NavioLineup, StatusCor } from '../types/index.js';
import { 
  atualizarImosLineupComCatalogo, 
  normalizarNomeNavio, 
  jaroWinklerSimilarity 
} from './navioMatcherService.js';
import { identificarBercoPorCoordenadas } from './bercoGeoService.js';

const SISPORT_URL = 'https://sisport.portoss.sp.gov.br/LineUp/ConsultaPublicaProgramacao.aspx';

/**
 * Gera um identificador IMO determinístico de 7 dígitos baseado no nome do navio
 */
function gerarImoDeterministico(nomeNavio: string): string {
  let hash = 0;
  for (let i = 0; i < nomeNavio.length; i++) {
    hash = (hash * 31 + nomeNavio.charCodeAt(i)) >>> 0;
  }
  return `9${String(100000 + (hash % 900000))}`;
}

// Cadastro de metadados navais e especificações dos navios conhecidos do Porto de São Sebastião
const REGISTRO_NAVAL_CDSS: Record<string, { imo: string; tipo_navio: string; loa: number; dwt: number; calado: number }> = {
  'DIAMOND STAR II': { imo: '9456783', tipo_navio: 'Graneleiro Handysize', loa: 169.3, dwt: 28400, calado: 8.6 },
  'CYMONA LIFE': { imo: '9632832', tipo_navio: 'Graneleiro Handymax', loa: 179.9, dwt: 37300, calado: 9.8 },
  'EVOLUTION': { imo: '9120619', tipo_navio: 'Transporte de Carga Viva', loa: 139.0, dwt: 6800, calado: 7.4 },
  'OCEAN ENDEAVOR': { imo: '9308857', tipo_navio: 'Graneleiro Supramax', loa: 189.9, dwt: 53400, calado: 10.2 },
  'BALHA ONE': { imo: '8908868', tipo_navio: 'Transporte de Carga Viva', loa: 100.0, dwt: 3400, calado: 6.8 },
  'S.ARAS': { imo: '9232852', tipo_navio: 'Transporte de Carga Viva', loa: 177.0, dwt: 13462, calado: 8.5 },
  'SAGA PIONNER': { imo: '9190183', tipo_navio: 'Graneleiro Open Hatch', loa: 199.9, dwt: 47000, calado: 10.5 },
  'ADASTAR': { imo: '9701231', tipo_navio: 'Graneleiro Handymax', loa: 180.0, dwt: 34334, calado: 9.8 },
  'DAREEN': { imo: '9075058', tipo_navio: 'Transporte de Carga Viva', loa: 119.5, dwt: 5600, calado: 7.1 },
  'ATLANTIC ROSE': { imo: '9225782', tipo_navio: 'Transporte de Carga Viva', loa: 102.0, dwt: 4200, calado: 6.9 },
  'ADRIATIC ROSE': { imo: '9115949', tipo_navio: 'Transporte de Carga Viva', loa: 102.0, dwt: 4200, calado: 6.9 },
  'ALFA LIVESTOCK': { imo: '6422303', tipo_navio: 'Transporte de Carga Viva', loa: 73.0, dwt: 2140, calado: 6.2 },
  'YOSOR': { imo: '9152349', tipo_navio: 'Transporte de Carga Viva', loa: 103.0, dwt: 3900, calado: 7.0 },
  'LIZZY CONFIDENCE': { imo: '9481233', tipo_navio: 'Graneleiro Handysize', loa: 169.3, dwt: 28200, calado: 8.8 },
  'INDIAN OCEAN': { imo: '9598282', tipo_navio: 'Graneleiro Supramax', loa: 189.9, dwt: 55000, calado: 10.6 },
  'SOPHIE': { imo: '1060502', tipo_navio: 'Carga Geral / Projeto', loa: 147.0, dwt: 12000, calado: 7.5 },
  'AFRICAN GROUSE': { imo: '9687980', tipo_navio: 'Graneleiro Ultramax', loa: 199.9, dwt: 60500, calado: 11.2 },
  'OCEAN SWAGMAN': { imo: '9444450', tipo_navio: 'Transporte de Carga Viva', loa: 135.0, dwt: 7300, calado: 7.6 },
  'WHITE PEARL': { imo: '9120621', tipo_navio: 'Transporte de Carga Viva', loa: 135.0, dwt: 6800, calado: 7.3 },
  'TAIBA': { imo: '9186390', tipo_navio: 'Transporte de Carga Viva', loa: 138.0, dwt: 7500, calado: 7.7 },
  'ADVENTURER': { imo: '9400265', tipo_navio: 'Graneleiro Handymax', loa: 170.0, dwt: 28000, calado: 8.9 },
  'QUEENSLAND': { imo: '9186405', tipo_navio: 'Transporte de Carga Viva', loa: 135.0, dwt: 6900, calado: 7.4 },
  'UNITY SPIRIT': { imo: '9343821', tipo_navio: 'Graneleiro Handysize', loa: 170.0, dwt: 29000, calado: 8.9 },
  'JAWAN': { imo: '9260847', tipo_navio: 'Transporte de Carga Viva', loa: 139.0, dwt: 7000, calado: 7.5 }
};

interface SisportParsedRow {
  navio: string;
  agencia: string;
  previsao: string;
  tipo: string;
  mercadoria: string;
  peso_ton: number;
  volume_qtd: number;
  operador: string;
  local: string;
  situacao: string;
  progresso_pct?: number | null;
}

/**
 * Baixa o HTML da página do SISPORT de forma assíncrona
 */
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: 10000 }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchHtml(res.headers.location));
      }
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout ao conectar com SISPORT'));
    });
  });
}

/**
 * Extrai texto limpo de tags HTML
 */
function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#202;/g, 'Ê')
    .replace(/&#195;/g, 'Ã')
    .replace(/&#205;/g, 'Í')
    .replace(/&#199;/g, 'Ç')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Converte string no formato numérico brasileiro (ex: 27.000,000) para number
 */
export function parseBrNumber(valStr: string): number {
  if (!valStr) return 0;
  const cleaned = valStr.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Converte data DD/MM/AAAA para formato ISO com fuso oficial de Brasília (AAAA-MM-DDTHH:mm:ss-03:00)
 */
export function parseBrDate(dateStr: string, horaPadrao = '12:00:00'): string {
  if (!dateStr || !dateStr.includes('/')) {
    return new Date().toISOString();
  }
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [dia, mes, ano] = parts;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horaPadrao}-03:00`;
  }
  return new Date().toISOString();
}

/**
 * Faz o parsing das tabelas da programação oficial da CDSS
 */
export function parseSisportHtml(html: string): SisportParsedRow[] {
  const result: SisportParsedRow[] = [];

  // 1. Tabela de Navios Programados
  const progTableMatch = html.match(/id="grdScheduleData"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  if (progTableMatch) {
    const tbody = progTableMatch[1];
    const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let trMatch;

    while ((trMatch = trRegex.exec(tbody)) !== null) {
      const rowContent = trMatch[1];
      const cells: string[] = [];
      const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
      let tdMatch;

      while ((tdMatch = tdRegex.exec(rowContent)) !== null) {
        cells.push(cleanText(tdMatch[1]));
      }

      if (cells.length >= 14) {
        // Colunas: [0: Fila, 1: Navio, 2: Agência, 3: Previsão, 4: Tipo, 5: Mercadoria, 6: Peso, 7: Volume, ...]
        const nomeNavio = cells[1].toUpperCase();
        const situacao = cells[13].toUpperCase();

        let progressoPct: number | null = null;
        const pctAttrMatch = rowContent.match(/(?:data-porcentagem|data-progress|aria-valuenow)=['"]([0-9.,]+)['"]/i);
        if (pctAttrMatch) {
          const parsed = parseFloat(pctAttrMatch[1].replace(',', '.'));
          if (!isNaN(parsed)) progressoPct = parsed;
        }

        if (progressoPct === null) {
          // Busca em células da linha que contenham o símbolo %
          for (let c = 12; c < cells.length; c++) {
            if (cells[c] && cells[c].includes('%')) {
              const cleanPct = cells[c].replace('%', '').replace(',', '.').trim();
              const parsed = parseFloat(cleanPct);
              if (!isNaN(parsed)) {
                progressoPct = parsed;
                break;
              }
            }
          }
        }

        // Ignora navios que já desatracaram completamente do porto.
        // Navios com situação OPERANDO ou ATRACADO continuam ocupando o berço fisicamente
        // mesmo quando já atingiram 100% de movimentação de carga.
        if (
          situacao === 'DESATRACADO' ||
          (situacao !== 'OPERANDO' && situacao !== 'ATRACADO' && progressoPct !== null && progressoPct >= 100)
        ) {
          continue;
        }

        result.push({
          navio: nomeNavio,
          agencia: cells[2],
          previsao: cells[3],
          tipo: cells[4],
          mercadoria: cells[5],
          peso_ton: parseBrNumber(cells[6]),
          volume_qtd: parseBrNumber(cells[7]),
          operador: cells[10] || '',
          local: cells[11] || '',
          situacao: situacao,
          progresso_pct: progressoPct
        });
      }
    }
  }

  // Observação: Ignoramos intencionalmente a tabela secundária "grdPredictedData" (Navios Previstos)
  // para sincronizar apenas as embarcações que possuem programação oficial confirmada no porto.
  return result;
}

/**
 * Localiza de maneira inteligente se a escala do SISPORT já corresponde a um navio em lineup_navios
 * Utiliza matching multicritério em cascata: IMO -> Nome Exato -> Nome Normalizado -> Jaro-Winkler
 */
function encontrarNavioExistente(
  nomeNavioSisport: string,
  imoPreCalculado: string | null,
  naviosDb: any[],
  idsJaAtribuidos: Set<number>
): any | undefined {
  const disponiveis = naviosDb.filter(n => !idsJaAtribuidos.has(n.id));
  const nomeNorm = normalizarNomeNavio(nomeNavioSisport);
  const nomeUpper = nomeNavioSisport.trim().toUpperCase();

  // 1. Busca por IMO (se o IMO pré-calculado for numérico padrão de 6 a 8 dígitos)
  if (imoPreCalculado && /^\d{6,8}$/.test(imoPreCalculado)) {
    const porImo = disponiveis.find(n => n.imo && String(n.imo).trim() === imoPreCalculado);
    if (porImo) return porImo;
  }

  // 2. Busca por Nome Exato
  const porNomeExato = disponiveis.find(
    n => n.nome_navio && n.nome_navio.trim().toUpperCase() === nomeUpper
  );
  if (porNomeExato) return porNomeExato;

  // 3. Busca por Nome Normalizado (remove pontos, hífens, acentos e espaços duplicados)
  const porNomeNorm = disponiveis.find(
    n => n.nome_navio && normalizarNomeNavio(n.nome_navio) === nomeNorm
  );
  if (porNomeNorm) return porNomeNorm;

  // 4. Busca por Similaridade Fonética/Jaro-Winkler de altíssima confiança (score >= 0.94 e comprimentos compatíveis)
  let melhorScore = 0;
  let melhorMatch: any = undefined;
  for (const n of disponiveis) {
    if (!n.nome_navio) continue;
    const targetNorm = normalizarNomeNavio(n.nome_navio);
    const lenRatio = Math.min(nomeNorm.length, targetNorm.length) / Math.max(nomeNorm.length, targetNorm.length);
    if (lenRatio < 0.8) continue; // Evita falsos positivos como ATLANTIC ROSE vs ATLANTIS

    const score = jaroWinklerSimilarity(nomeNorm, targetNorm);
    if (score > melhorScore) {
      melhorScore = score;
      melhorMatch = n;
    }
  }

  if (melhorMatch && melhorScore >= 0.94) {
    return melhorMatch;
  }

  return undefined;
}

/**
 * Sincroniza a programação oficial da CDSS diretamente com o banco de dados do Line-Up.
 * 
 * POLÍTICA DE INVIOLABILIDADE CDSS:
 * 1. O SISPORT é a autoridade da escala e programação comercial (ordem de fila, mercadorias, previsão).
 * 2. A telemetria de posicionamento AIS (latitude, longitude, eta_ais, sinal_antena, ais_sincronizado_em)
 *    e especificações refinadas (loa, dwt, calado) são 100% PRESERVADAS para navios já cadastrados.
 * 3. Utiliza atualização incremental inteligente (UPSERT / MERGE) SEM apagar a tabela.
 */
export async function sincronizarComSisportOficial(): Promise<{
  totalSincronizados: number;
  novosNavios: string[];
  recalculado: Awaited<ReturnType<typeof recalcularLineupComMotor>>;
  statsImos?: any;
}> {
  console.log('[SisportSync] Iniciando captura de programação oficial de portoss.sp.gov.br (sem consultas a APIs externas)...');
  const html = await fetchHtml(SISPORT_URL);
  const parsedRows = parseSisportHtml(html);

  if (parsedRows.length === 0) {
    throw new Error('Nenhuma escala foi encontrada na página oficial do SISPORT');
  }

  console.log(`[SisportSync] ${parsedRows.length} embarcações ativas encontradas no SISPORT.`);

  const sql = getDatabase();

  // Carrega navios existentes no banco para mesclagem não-destrutiva
  const naviosDb = (await sql`SELECT * FROM lineup_navios ORDER BY ordem_fila ASC, id ASC`) as any[];

  // Salvaguarda contra sincronização parcial ou truncada do SISPORT:
  // Se o banco já possuía navios ativos (> 5) e a nova leitura trouxe uma queda drástica (< 50%),
  // aborta a sincronização para evitar expurgo de dados válidos decorrente de instabilidade na página.
  if (naviosDb.length > 5 && parsedRows.length < Math.floor(naviosDb.length * 0.5)) {
    throw new Error(
      `[SisportSync Salvaguarda] A leitura oficial retornou apenas ${parsedRows.length} embarcações, representando menos de 50% da base ativa (${naviosDb.length}). Sincronização abortada preventivamente para proteger a integridade dos dados.`
    );
  }

  // Carrega catálogo de navios oficial para resolução precisa de IMO
  const catalogoNaviosRows = (await sql`SELECT UPPER(nome) as nome_up, imo FROM navios`) as { nome_up: string; imo: string }[];
  const catalogoImoMap = new Map<string, string>();
  for (const c of catalogoNaviosRows) {
    if (!catalogoImoMap.has(c.nome_up)) {
      catalogoImoMap.set(c.nome_up, c.imo);
    }
  }

  // Carrega resumo de navios atracados na Praticagem para identificação oficial de berços (ex: CINT / Berço 202 vs CAIS / Berço 101)
  let praticagemAtracados: any[] = [];
  try {
    praticagemAtracados = (await sql`SELECT navio, berco FROM praticagem_resumo_porto WHERE tipo = 'ATRACADOS'`) as any[];
  } catch (errP) {
    console.warn('[SisportSync] Aviso ao consultar praticagem_resumo_porto:', errP);
  }

  const idsProcessados = new Set<number>();
  const novosNavios: string[] = [];
  let ordemFila = 1;
  let operandoCount = 0;

  // Pontos geográficos reais de ancoragem e aproximação no Canal de São Sebastião (para novos navios)
  const fundeiosCoords = [
    { lat: -23.8242, lon: -45.3931 },
    { lat: -23.8115, lon: -45.3872 },
    { lat: -23.7995, lon: -45.4020 },
    { lat: -23.7850, lon: -45.4150 },
    { lat: -23.7780, lon: -45.4350 },
    { lat: -23.7650, lon: -45.4450 },
    { lat: -23.7550, lon: -45.4600 }
  ];

  const imosUsados = new Set<string>();

  for (let i = 0; i < parsedRows.length; i++) {
    const item = parsedRows[i];
    novosNavios.push(item.navio);

    const fallbackCatalog = REGISTRO_NAVAL_CDSS[item.navio];
    const imoCatalogoOuFallback = catalogoImoMap.get(item.navio.trim().toUpperCase()) || fallbackCatalog?.imo || null;

    // Localiza registro já existente no banco de dados via matching multicritério
    const existing = encontrarNavioExistente(item.navio, imoCatalogoOuFallback, naviosDb, idsProcessados);

    // IMO: Reutiliza o IMO já validado no banco (se numérico padrão), catálogo oficial ou determinístico
    let imo = (existing?.imo && /^\d{6,8}$/.test(String(existing.imo).trim()))
      ? String(existing.imo).trim()
      : (imoCatalogoOuFallback || (existing?.imo ? String(existing.imo).trim() : gerarImoDeterministico(item.navio)));

    // Garantir unicidade de IMO no banco de dados
    if (imosUsados.has(imo)) {
      imo = `${imo}_${i + 1}`;
    }
    imosUsados.add(imo);

    const isCargaViva =
      item.mercadoria.toLowerCase().includes('animais') ||
      item.mercadoria.toLowerCase().includes('bovino') ||
      item.tipo.toLowerCase().includes('viva');

    // Dimensões e tipo: preserva integralmente os dados já validados se existirem
    const tipoNavio =
      existing?.tipo_navio ||
      fallbackCatalog?.tipo_navio ||
      (isCargaViva ? 'Transporte de Carga Viva' : (item.peso_ton > 40000 ? 'Graneleiro Supramax' : 'Graneleiro Handymax'));

    const loa =
      (existing?.loa && existing.loa > 0)
        ? existing.loa
        : (fallbackCatalog?.loa || (isCargaViva ? 135.0 : (item.peso_ton > 40000 ? 189.9 : 175.0)));

    const dwt =
      (existing?.dwt && existing.dwt > 0)
        ? existing.dwt
        : (fallbackCatalog?.dwt || (isCargaViva ? 7000 : (item.peso_ton > 0 ? Math.max(Math.round(item.peso_ton * 1.3), 10000) : 28000)));

    const calado =
      (existing?.calado && existing.calado > 0)
        ? existing.calado
        : (fallbackCatalog?.calado || (item.peso_ton > 20000 ? 9.8 : 7.8));

    // Determina o status operacional da escala com base na situação oficial do SISPORT
    const situacaoUpper = (item.situacao || '').toUpperCase();
    let statusCor: StatusCor = 'LARANJA';
    let livrePratica = existing?.livre_pratica_ok ?? 0;

    if (situacaoUpper === 'ATRACADO' || situacaoUpper === 'OPERANDO' || situacaoUpper.includes('OPERANDO') || situacaoUpper.includes('ATRACADO')) {
      statusCor = 'VERDE';
      livrePratica = 1;
    } else if (situacaoUpper === 'FUNDEADO' || situacaoUpper.includes('FUNDEADO')) {
      statusCor = (existing?.status_cor === 'CINZA') ? 'CINZA' : 'VERMELHO';
    } else if (item.situacao === 'PROGRAMADO') {
      if (existing?.status_cor === 'VERMELHO' || existing?.status_cor === 'CINZA') {
        // Se a escala já está confirmada na barra (VERMELHO) ou com livre prática (CINZA), preserva o estado real!
        statusCor = existing.status_cor;
      } else {
        statusCor = (ordemFila <= 3 ? 'LARANJA' : 'AZUL');
      }
    } else {
      if (existing?.status_cor === 'VERMELHO' || existing?.status_cor === 'CINZA') {
        statusCor = existing.status_cor;
      } else {
        statusCor = 'AZUL';
      }
    }

    // REGRA DE OURO DE POSICIONAMENTO AIS:
    // Se o navio já possui coordenadas válidas (especialmente com telemetria AIS), NUNCA sobrescreve!
    let latitude: number;
    let longitude: number;

    const temCoordenadasValidasNoBanco =
      existing &&
      existing.latitude !== null &&
      existing.latitude !== undefined &&
      existing.longitude !== null &&
      existing.longitude !== undefined &&
      !(existing.latitude === 0 && existing.longitude === 0);

    // Identificação de berço oficial da Praticagem (ex: CINT / Berço 202 vs CAIS / Berço 101)
    let bercoPraticagem: string | null = null;
    const nomeNormItem = normalizarNomeNavio(item.navio);
    const itemPrat = praticagemAtracados.find(p => p.navio && (
      normalizarNomeNavio(p.navio) === nomeNormItem ||
      normalizarNomeNavio(p.navio).includes(nomeNormItem) ||
      nomeNormItem.includes(normalizarNomeNavio(p.navio))
    ));
    if (itemPrat?.berco) {
      const bUpper = itemPrat.berco.toUpperCase();
      if (bUpper.includes('CINT') || bUpper.includes('202')) bercoPraticagem = '202';
      else if (bUpper.includes('201')) bercoPraticagem = '201';
      else if (bUpper.includes('203')) bercoPraticagem = '203';
      else if (bUpper.includes('204')) bercoPraticagem = '204';
      else if (bUpper.includes('CAIS') || bUpper.includes('101')) bercoPraticagem = '101';
    }

    if (temCoordenadasValidasNoBanco) {
      // Mantém a posição real exata transmitida pelo transponder AIS ou cadastrada previamente
      latitude = existing.latitude;
      longitude = existing.longitude;
    } else if (statusCor === 'VERDE') {
      if (bercoPraticagem === '202') {
        latitude = -23.8105;
        longitude = -45.3971;
      } else if (bercoPraticagem === '101') {
        latitude = -23.8114;
        longitude = -45.3974;
      } else {
        // Navios atracados sem coordenadas prévias: distribui ao longo dos berços de São Sebastião (CDSS)
        const bercoCoords = [
          { lat: -23.8114, lon: -45.3974 }, // Berço 101 Sul
          { lat: -23.8109, lon: -45.3968 }, // Berço 101 Norte / 201
          { lat: -23.8105, lon: -45.3971 }  // Berço 202
        ];
        const coordEscolhida = bercoCoords[operandoCount % bercoCoords.length];
        latitude = coordEscolhida.lat;
        longitude = coordEscolhida.lon;
        operandoCount++;
      }
    } else {
      // Navio novo sem coordenadas prévias: atribui ponto de fundeio inicial
      latitude = fundeiosCoords[i % fundeiosCoords.length].lat;
      longitude = fundeiosCoords[i % fundeiosCoords.length].lon;
    }

    const etaFormatado = parseBrDate(item.previsao);
    const armazemPublico = item.local.toUpperCase().includes('CDSS') ? 1 : 0;
    const novaOrdem = ordemFila++;

    let progressoOperacao: number | null = null;
    if (situacaoUpper === 'OPERANDO' || situacaoUpper.includes('OPERANDO') || statusCor === 'VERDE') {
      progressoOperacao = item.progresso_pct !== null && item.progresso_pct !== undefined
        ? item.progresso_pct
        : (existing?.progresso_operacao ?? null);
    } else if (item.progresso_pct !== null && item.progresso_pct !== undefined && item.progresso_pct > 0) {
      progressoOperacao = item.progresso_pct;
    } else {
      progressoOperacao = existing?.progresso_operacao ?? null;
    }

    // PRESERVAÇÃO RIGOROSA DA CHEGADA AO FUNDEIO:
    // Se o navio já possui chegada_fundeio salva no banco (informada manualmente ou calculada), NUNCA apaga!
    const chegadaFundeio = existing?.chegada_fundeio
      ? existing.chegada_fundeio
      : (statusCor === 'VERMELHO' || statusCor === 'VERDE' || statusCor === 'CINZA'
          ? (etaFormatado || null)
          : null);

    const inicioAtracacao = statusCor === 'VERDE'
      ? (existing?.inicio_atracacao || etaFormatado)
      : (existing?.inicio_atracacao || null);

    const fimAtracacao = statusCor === 'VERDE'
      ? (existing?.fim_atracacao || null)
      : (existing?.fim_atracacao || null);

    // Identificação inteligente do berço por Praticagem, telemetria e geofencing
    let bercoFinal: string | null = bercoPraticagem;
    if (!bercoFinal && statusCor === 'VERDE' && latitude && longitude) {
      const bercoGeo = identificarBercoPorCoordenadas(latitude, longitude);
      if (bercoGeo) {
        bercoFinal = bercoGeo.berco;
      }
    }
    if (!bercoFinal && existing?.berco) {
      bercoFinal = existing.berco;
    }

    if (existing) {
      // ==========================================
      // UPDATE INCREMENTAL (NAVIO EXISTENTE NA BASE)
      // ==========================================
      // Atualiza os dados comerciais do SISPORT preservando RIGOROSAMENTE:
      // - ID estável
      // - Coordenadas exatas (latitude, longitude)
      // - Telemetria AIS (ais_sincronizado_em, eta_ais, sinal_antena)
      // - Dimensões reais validadas (loa, dwt, calado)
      await sql`
        UPDATE lineup_navios SET
          imo = ${imo},
          nome_navio = ${item.navio},
          tipo_navio = ${tipoNavio},
          mercadoria = ${item.mercadoria},
          volume_t = ${item.peso_ton > 0 ? item.peso_ton : existing.volume_t},
          loa = ${loa},
          dwt = ${dwt},
          calado = ${calado},
          agencia = ${item.agencia || existing.agencia},
          ordem_fila = ${novaOrdem},
          ordem_sisport = ${novaOrdem},
          status_cor = ${statusCor},
          status_sisport = ${statusCor},
          berco = ${bercoFinal},
          livre_pratica_ok = ${livrePratica},
          armazem_publico = ${armazemPublico},
          eta_previsto = ${etaFormatado},
          chegada_fundeio = ${chegadaFundeio},
          inicio_atracacao = ${inicioAtracacao},
          fim_atracacao = ${fimAtracacao},
          latitude = ${latitude},
          longitude = ${longitude},
          progresso_operacao = ${progressoOperacao},
          ultima_atualizacao = CURRENT_TIMESTAMP
        WHERE id = ${existing.id}
      `;
      idsProcessados.add(existing.id);
    } else {
      // ==========================================
      // INSERT (NOVA ESCALA INÉDITA NA PROGRAMAÇÃO)
      // ==========================================
      const [inserted] = await sql`
        INSERT INTO lineup_navios (
          imo, nome_navio, tipo_navio, mercadoria, volume_t, loa, dwt, calado, agencia,
          ordem_fila, ordem_sisport, status_cor, status_sisport, berco, livre_pratica_ok, armazem_publico, eta_previsto, eta_ais,
          chegada_fundeio, inicio_atracacao, fim_atracacao, latitude, longitude, sinal_antena, ais_sincronizado_em,
          progresso_operacao, ultima_atualizacao
        ) VALUES (
          ${imo}, ${item.navio}, ${tipoNavio}, ${item.mercadoria}, ${item.peso_ton}, ${loa},
          ${dwt}, ${calado}, ${item.agencia}, ${novaOrdem}, ${novaOrdem}, ${statusCor}, ${statusCor}, ${bercoFinal}, ${livrePratica},
          ${armazemPublico}, ${etaFormatado}, null,
          ${chegadaFundeio}, ${inicioAtracacao}, ${fimAtracacao},
          ${latitude}, ${longitude}, null, null,
          ${progressoOperacao}, CURRENT_TIMESTAMP
        )
        RETURNING id
      `;
      if (inserted?.id) {
        idsProcessados.add(inserted.id);
      }
    }
  }

  // Remove com segurança apenas escalas antigas que não constam mais na programação do SISPORT (ex: navios desatracados)
  // Preserva eventuais registros com previsão manual deliberada
  if (idsProcessados.size > 0) {
    const idsArray = Array.from(idsProcessados);

    // Finaliza snapshot de navios atracados que concluíram a operação e saíram da programação
    try {
      const saindo = await sql<{ imo: string }[]>`
        SELECT imo FROM lineup_navios 
        WHERE NOT (id = ANY(${idsArray}))
          AND status_cor = 'VERDE'
          AND (origem_previsao_fim IS NULL OR origem_previsao_fim != 'MANUAL')
      `;
      for (const s of saindo) {
        if (s.imo) {
          await finalizarSnapshotPrevisao(s.imo);
        }
      }
    } catch (err) {
      console.error('[SisportSync] Erro ao finalizar snapshots de navios desatracados:', err);
    }

    await sql`
      DELETE FROM lineup_navios 
      WHERE NOT (id = ANY(${idsArray}))
        AND (origem_previsao_fim IS NULL OR origem_previsao_fim != 'MANUAL')
    `;
  }

  // Enriquecimento inteligente de IMOs na tabela "navios"
  console.log('[SisportSync] Executando correspondência inteligente de IMOs na tabela "navios"...');
  const statsImos = await atualizarImosLineupComCatalogo();
  console.log(`[SisportSync] ✓ IMOs atualizados: ${statsImos.totalAtualizados} navios atualizados com base no catálogo oficial.`);

  // Recalcula todas as janelas de berço e encadeamento operacional (force refresh)
  const recalculado = await recalcularLineupComMotor(true);

  return {
    totalSincronizados: parsedRows.length,
    novosNavios,
    recalculado,
    statsImos
  };
}
