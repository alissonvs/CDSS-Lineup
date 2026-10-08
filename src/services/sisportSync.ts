import https from 'https';
import { getDatabase } from '../database/connection.js';
import { recalcularLineupComMotor } from './engine.js';
import { NavioLineup, StatusCor } from '../types/index.js';
import { atualizarImosLineupComCatalogo } from './navioMatcherService.js';

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
function parseBrNumber(valStr: string): number {
  if (!valStr) return 0;
  const cleaned = valStr.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Converte data DD/MM/AAAA para formato ISO (AAAA-MM-DDTHH:mm:ss)
 */
function parseBrDate(dateStr: string, horaPadrao = '12:00:00'): string {
  if (!dateStr || !dateStr.includes('/')) {
    return new Date().toISOString().slice(0, 19);
  }
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [dia, mes, ano] = parts;
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}T${horaPadrao}`;
  }
  return new Date().toISOString().slice(0, 19);
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

        // Ignora navios que já desatracaram completamente do porto
        if (situacao === 'DESATRACADO') continue;

        let progressoPct: number | null = null;
        const pctAttrMatch = rowContent.match(/data-porcentagem=['"]([0-9.]+)['"]/i);
        if (pctAttrMatch) {
          const parsed = parseFloat(pctAttrMatch[1]);
          if (!isNaN(parsed)) progressoPct = parsed;
        } else if (cells[14]) {
          const cleanPct = cells[14].replace('%', '').replace(',', '.').trim();
          const parsed = parseFloat(cleanPct);
          if (!isNaN(parsed)) progressoPct = parsed;
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
 * Sincroniza a programação oficial da CDSS diretamente com o banco de dados do Line-Up
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

  // Preserva os dados locais prévios (IMO, dimensões e telemetria AIS) de navios já cadastrados
  const existingRows = (await sql`SELECT * FROM lineup_navios`) as any[];
  const existingMap = new Map<string, any>();
  for (const row of existingRows) {
    if (row.nome_navio) {
      existingMap.set(row.nome_navio.trim().toUpperCase(), row);
    }
  }

  // Carrega catálogo de navios oficial para resolução precisa de IMO
  const catalogoNaviosRows = (await sql`SELECT UPPER(nome) as nome_up, imo FROM navios`) as { nome_up: string; imo: string }[];
  const catalogoImoMap = new Map<string, string>();
  for (const c of catalogoNaviosRows) {
    if (!catalogoImoMap.has(c.nome_up)) {
      catalogoImoMap.set(c.nome_up, c.imo);
    }
  }

  // Limpa a fila anterior para reconstruir o sequenciamento fiel à programação oficial do porto
  await sql`DELETE FROM lineup_navios`;

  const novosNavios: string[] = [];
  let ordemFila = 1;
  let jaExisteVerde = false;

  // Pontos geográficos reais de ancoragem e aproximação no Canal de São Sebastião
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

    const existing = existingMap.get(item.navio);
    const fallbackCatalog = REGISTRO_NAVAL_CDSS[item.navio];

    // IMO: Reutiliza cadastro prévio, consulta catálogo oficial 'navios', catálogo local CDSS ou gera determinístico
    let imo = existing?.imo || catalogoImoMap.get(item.navio.trim().toUpperCase()) || fallbackCatalog?.imo || gerarImoDeterministico(item.navio);

    // Garantir unicidade do IMO no banco de dados
    if (imosUsados.has(imo)) {
      imo = `${imo}_${i + 1}`;
    }
    imosUsados.add(imo);

    const isCargaViva =
      item.mercadoria.toLowerCase().includes('animais') ||
      item.mercadoria.toLowerCase().includes('bovino') ||
      item.tipo.toLowerCase().includes('viva');

    const tipoNavio =
      existing?.tipo_navio ||
      fallbackCatalog?.tipo_navio ||
      (isCargaViva ? 'Transporte de Carga Viva' : (item.peso_ton > 40000 ? 'Graneleiro Supramax' : 'Graneleiro Handymax'));

    const loa =
      existing?.loa ||
      fallbackCatalog?.loa ||
      (isCargaViva ? 135.0 : (item.peso_ton > 40000 ? 189.9 : 175.0));

    const dwt =
      existing?.dwt ||
      fallbackCatalog?.dwt ||
      (isCargaViva ? 7000 : (item.peso_ton > 0 ? Math.max(Math.round(item.peso_ton * 1.3), 10000) : 28000));

    const calado =
      existing?.calado ||
      fallbackCatalog?.calado ||
      (item.peso_ton > 20000 ? 9.8 : 7.8);

    // Determina o status operacional da escala
    let statusCor: StatusCor = 'LARANJA';
    let livrePratica = existing?.livre_pratica_ok ?? 0;
    let latitude = fundeiosCoords[i % fundeiosCoords.length].lat;
    let longitude = fundeiosCoords[i % fundeiosCoords.length].lon;

    const situacaoUpper = (item.situacao || '').toUpperCase();
    if (situacaoUpper === 'ATRACADO' || situacaoUpper === 'OPERANDO' || situacaoUpper.includes('OPERANDO') || situacaoUpper.includes('ATRACADO')) {
      statusCor = 'VERDE';
      livrePratica = 1;
      jaExisteVerde = true;
      latitude = -23.8045;
      longitude = -45.3970;
    } else if (situacaoUpper === 'FUNDEADO' || situacaoUpper.includes('FUNDEADO')) {
      // Se o navio já estava marcado como VERDE pelo operador ou telemetria AIS no berço, mantém VERDE
      if (existing?.status_cor === 'VERDE') {
        statusCor = 'VERDE';
        livrePratica = 1;
        jaExisteVerde = true;
        latitude = existing.latitude || -23.8045;
        longitude = existing.longitude || -45.3970;
      } else if (!jaExisteVerde && ordemFila === 1) {
        statusCor = 'VERDE';
        livrePratica = 1;
        jaExisteVerde = true;
        latitude = -23.8045;
        longitude = -45.3970;
      } else {
        statusCor = 'VERMELHO';
        if (existing?.latitude && existing?.longitude) {
          latitude = existing.latitude;
          longitude = existing.longitude;
        }
      }
    } else if (item.situacao === 'PROGRAMADO') {
      statusCor = ordemFila <= 3 ? 'LARANJA' : 'AZUL';
      if (existing?.latitude && existing?.longitude) {
        latitude = existing.latitude;
        longitude = existing.longitude;
      }
    } else {
      statusCor = 'AZUL';
      if (existing?.latitude && existing?.longitude) {
        latitude = existing.latitude;
        longitude = existing.longitude;
      }
    }

    const etaFormatado = parseBrDate(item.previsao);
    const armazemPublico = item.local.toUpperCase().includes('CDSS') ? 1 : 0;
    const ultimaAtualizacao = existing?.ultima_atualizacao || new Date().toISOString();

    let progressoOperacao: number | null = null;
    if (situacaoUpper === 'OPERANDO' || situacaoUpper.includes('OPERANDO') || statusCor === 'VERDE') {
      progressoOperacao = item.progresso_pct !== null && item.progresso_pct !== undefined
        ? item.progresso_pct
        : (existing?.progresso_operacao ?? null);
    } else if (item.progresso_pct !== null && item.progresso_pct !== undefined && item.progresso_pct > 0) {
      progressoOperacao = item.progresso_pct;
    }

    await sql`
      INSERT INTO lineup_navios (
        imo, nome_navio, tipo_navio, mercadoria, volume_t, loa, dwt, calado, agencia,
        ordem_fila, status_cor, livre_pratica_ok, armazem_publico, eta_previsto, eta_ais,
        chegada_fundeio, inicio_atracacao, fim_atracacao, latitude, longitude, sinal_antena, ais_sincronizado_em,
        progresso_operacao, ultima_atualizacao
      ) VALUES (
        ${imo}, ${item.navio}, ${tipoNavio}, ${item.mercadoria}, ${item.peso_ton}, ${loa},
        ${dwt}, ${calado}, ${item.agencia}, ${ordemFila++}, ${statusCor}, ${livrePratica},
        ${armazemPublico}, ${etaFormatado}, ${existing?.eta_ais || null},
        ${statusCor === 'VERMELHO' || statusCor === 'VERDE' ? (existing?.chegada_fundeio || etaFormatado) : null},
        ${statusCor === 'VERDE' ? (existing?.inicio_atracacao || etaFormatado) : null},
        ${statusCor === 'VERDE' ? (existing?.fim_atracacao || null) : null},
        ${latitude}, ${longitude}, ${existing?.sinal_antena || null},
        ${existing?.ais_sincronizado_em || null},
        ${progressoOperacao}, ${ultimaAtualizacao}
      )
    `;
  }

  // 4. Procura o nome de cada navio importado na tabela 'navios' (idêntica ou próxima) e atualiza o IMO no lineup_navios
  console.log('[SisportSync] Executando correspondência inteligente de IMOs na tabela "navios"...');
  const statsImos = await atualizarImosLineupComCatalogo();
  console.log(`[SisportSync] ✓ IMOs atualizados: ${statsImos.totalAtualizados} navios atualizados com base no catálogo oficial.`);

  // Recalcula todas as janelas de berço e encadeamento operacional
  const recalculado = await recalcularLineupComMotor();

  return {
    totalSincronizados: parsedRows.length,
    novosNavios,
    recalculado,
    statsImos
  };
}
