import { getDatabase } from '../database/connection.js';

export interface MatchResult {
  imo: string;
  nomeCatalogo: string;
  score: number;
  metodo: 'EXATO' | 'NORMALIZADO' | 'APROXIMADO';
}

export interface AtualizacaoLineupStats {
  totalVerificados: number;
  totalAtualizados: number;
  detalhes: Array<{
    id: number;
    nomeNavio: string;
    imoAnterior: string;
    imoNovo: string;
    nomeCatalogo: string;
    metodo: 'EXATO' | 'NORMALIZADO' | 'APROXIMADO';
    score: number;
  }>;
}

/**
 * Remove acentuação, pontuações, caracteres especiais e normaliza espaços
 */
export function normalizarNomeNavio(str: string): string {
  if (!str) return '';
  return str
    .toUpperCase()
    // Remove acentos
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove prefixos náuticos descartáveis
    .replace(/^(M\/V|MV|N\/T|NT|NAVIO)\s+/i, '')
    // Substitui pontuações por espaço (ex: S.ARAS -> S ARAS)
    .replace(/[\.\-\/\\\'\",;:]/g, ' ')
    // Remove múltiplos espaços
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Versão condensada sem nenhum espaço ou caractere especial (ex: "S.ARAS" -> "SARAS")
 */
export function condensarNomeNavio(str: string): string {
  return normalizarNomeNavio(str).replace(/\s+/g, '');
}

/**
 * Calcula a similaridade de Jaro-Winkler entre duas strings (retorna valor entre 0 e 1)
 */
export function jaroWinklerSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);

  let matches = 0;
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);

    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;

  // Ajuste de Winkler para prefixos comuns (até 4 caracteres)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  const p = 0.1; // Fator de escala padrão
  return jaro + prefix * p * (1 - jaro);
}

/**
 * Cache do catálogo em memória para otimização extrema de performance durante sincronizações
 */
interface NavioCatalogoItem {
  id: number;
  nome: string;
  nomeUpper: string;
  nomeNorm: string;
  nomeCondensado: string;
  imo: string;
}

let catalogoCache: NavioCatalogoItem[] | null = null;
let cacheCarregadoEm = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

export async function carregarCatalogoNavios(forceReload = false): Promise<NavioCatalogoItem[]> {
  const agora = Date.now();
  if (catalogoCache && !forceReload && agora - cacheCarregadoEm < CACHE_TTL_MS) {
    return catalogoCache;
  }

  const sql = getDatabase();
  const rows = await sql`
    SELECT id, nome, imo 
    FROM navios 
    ORDER BY id ASC
  `;

  catalogoCache = rows.map((r: any) => {
    const nome = String(r.nome || '').trim();
    return {
      id: Number(r.id),
      nome,
      nomeUpper: nome.toUpperCase(),
      nomeNorm: normalizarNomeNavio(nome),
      nomeCondensado: condensarNomeNavio(nome),
      imo: String(r.imo || '').trim()
    };
  });

  cacheCarregadoEm = agora;
  return catalogoCache;
}

/**
 * Busca o IMO de um navio no catálogo da tabela `navios` utilizando a cascata de 3 níveis:
 * 1. Exato
 * 2. Normalizado (sem pontuação, acentuação ou espaços adicionais)
 * 3. Aproximado / Fuzzy (Jaro-Winkler com threshold >= 85%)
 */
export async function buscarImoNoCatalogo(nomeNavio: string): Promise<MatchResult | null> {
  if (!nomeNavio || typeof nomeNavio !== 'string') return null;

  const rawQuery = nomeNavio.trim();
  if (rawQuery.length < 2) return null;

  const catalogo = await carregarCatalogoNavios();
  const queryUpper = rawQuery.toUpperCase();
  const queryNorm = normalizarNomeNavio(rawQuery);
  const queryCond = condensarNomeNavio(rawQuery);

  // --- NÍVEL 1: BUSCA EXATA (Case-Insensitive) ---
  const matchExato = catalogo.find(item => item.nomeUpper === queryUpper);
  if (matchExato) {
    return {
      imo: matchExato.imo,
      nomeCatalogo: matchExato.nome,
      score: 1.0,
      metodo: 'EXATO'
    };
  }

  // --- NÍVEL 2: BUSCA NORMALIZADA / CANÔNICA ---
  // Ex: "S.ARAS" <-> "S ARAS" <-> "SARAS"
  const matchNorm = catalogo.find(
    item => item.nomeNorm === queryNorm || item.nomeCondensado === queryCond
  );
  if (matchNorm) {
    return {
      imo: matchNorm.imo,
      nomeCatalogo: matchNorm.nome,
      score: 0.98,
      metodo: 'NORMALIZADO'
    };
  }

  // --- NÍVEL 3: BUSCA APROXIMADA / FUZZY MATCHING ---
  let melhorMatch: NavioCatalogoItem | null = null;
  let maiorScore = 0;
  const LIMIAR_SEGURANCA = 0.85; // 85% de similaridade mínima

  // Filtro de pré-candidatos para velocidade (mesma letra inicial ou comprimento semelhante)
  const queryFirstChar = queryNorm.charAt(0);

  for (const item of catalogo) {
    // Navios com inicial muito distinta ou diferença enorme de tamanho são pulados
    if (Math.abs(item.nomeNorm.length - queryNorm.length) > 5) continue;
    if (queryFirstChar && item.nomeNorm.charAt(0) !== queryFirstChar) continue;

    const scoreNorm = jaroWinklerSimilarity(queryNorm, item.nomeNorm);
    const scoreCond = jaroWinklerSimilarity(queryCond, item.nomeCondensado);
    const scoreFinal = Math.max(scoreNorm, scoreCond);

    if (scoreFinal > maiorScore) {
      maiorScore = scoreFinal;
      melhorMatch = item;
    }
  }

  if (melhorMatch && maiorScore >= LIMIAR_SEGURANCA) {
    return {
      imo: melhorMatch.imo,
      nomeCatalogo: melhorMatch.nome,
      score: Number(maiorScore.toFixed(3)),
      metodo: 'APROXIMADO'
    };
  }

  return null;
}

/**
 * Percorre todos os navios presentes na tabela `lineup_navios` e atualiza seus códigos IMO
 * com base na correspondência na tabela `navios`.
 */
export async function atualizarImosLineupComCatalogo(): Promise<AtualizacaoLineupStats> {
  const sql = getDatabase();

  const lineupNavios = (await sql`
    SELECT id, nome_navio, imo 
    FROM lineup_navios 
    ORDER BY ordem_fila ASC, id ASC
  `) as Array<{ id: number; nome_navio: string; imo: string }>;

  const stats: AtualizacaoLineupStats = {
    totalVerificados: lineupNavios.length,
    totalAtualizados: 0,
    detalhes: []
  };

  if (lineupNavios.length === 0) {
    return stats;
  }

  // Conjunto de IMOs já utilizados nesta fila para prevenir quebra de UNIQUE (imo)
  const imosUtilizadosNaFila = new Set<string>(
    lineupNavios.map(n => String(n.imo || '').trim()).filter(Boolean)
  );

  for (const navio of lineupNavios) {
    const match = await buscarImoNoCatalogo(navio.nome_navio);

    if (!match) {
      console.log(`[NavioMatcher] ⚠️  "${navio.nome_navio}": Não localizado no catálogo de navios.`);
      continue;
    }

    const imoEncontrado = match.imo;
    const imoAtual = String(navio.imo || '').trim();

    // Se o IMO já é idêntico ao do catálogo, não precisa de update no banco
    if (imoAtual === imoEncontrado) {
      stats.detalhes.push({
        id: navio.id,
        nomeNavio: navio.nome_navio,
        imoAnterior: imoAtual,
        imoNovo: imoEncontrado,
        nomeCatalogo: match.nomeCatalogo,
        metodo: match.metodo,
        score: match.score
      });
      continue;
    }

    // Verifica se o novo IMO colide com outro registro na tabela lineup_navios
    const conflito = await sql`
      SELECT id, nome_navio 
      FROM lineup_navios 
      WHERE imo = ${imoEncontrado} AND id != ${navio.id}
    `;

    if (conflito.length > 0) {
      console.warn(
        `[NavioMatcher] ⚠️  Conflito de chave: IMO ${imoEncontrado} ("${match.nomeCatalogo}") já está em uso pelo navio id ${conflito[0].id} ("${conflito[0].nome_navio}"). Atualização ignorada para evitar violação de unicidade.`
      );
      continue;
    }

    // Executa a atualização segura no banco de dados
    await sql`
      UPDATE lineup_navios 
      SET 
        imo = ${imoEncontrado},
        ultima_atualizacao = CURRENT_TIMESTAMP
      WHERE id = ${navio.id}
    `;

    // Atualiza rastreamento local
    imosUtilizadosNaFila.delete(imoAtual);
    imosUtilizadosNaFila.add(imoEncontrado);
    stats.totalAtualizados++;

    stats.detalhes.push({
      id: navio.id,
      nomeNavio: navio.nome_navio,
      imoAnterior: imoAtual,
      imoNovo: imoEncontrado,
      nomeCatalogo: match.nomeCatalogo,
      metodo: match.metodo,
      score: match.score
    });

    console.log(
      `[NavioMatcher] ✓ "${navio.nome_navio}" -> IMO ${imoEncontrado} [${match.metodo} (confiança: ${(match.score * 100).toFixed(1)}%) | Catálogo: "${match.nomeCatalogo}"]`
    );
  }

  console.log(
    `[NavioMatcher] Atualização de IMOs concluída: ${stats.totalAtualizados} navios atualizados com sucesso de ${stats.totalVerificados} verificados.`
  );

  return stats;
}
