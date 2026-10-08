import { getDatabase } from '../database/connection.js';
import { sincronizarComSisportOficial } from './sisportSync.js';
import { buscarImoNoCatalogo } from './navioMatcherService.js';
import { consultarDataDocked } from './datadocked.js';
import { recalcularLineupComMotor } from './engine.js';

export interface SyncAllStats {
  totalSisport: number;
  catalogoIdentificados: number;
  dataDockedAtualizados: number;
  tempoDecorridoMs: number;
}

export interface SyncAllResult {
  stats: SyncAllStats;
  message: string;
  recalculado: Awaited<ReturnType<typeof recalcularLineupComMotor>>;
}

/**
 * Função auxiliar para executar tarefas assíncronas com concorrência limitada (ex: 2 por vez)
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await fn(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Executa a sincronização completa do CDSS:
 * 1. Sincroniza a programação oficial do SISPORT e resolve IMOs via catálogo 'navios'
 * 2. Consulta o DataDocked para obter posicionamento AIS em tempo real e eta_ais
 * 3. Recalcula o motor de atracação CDSS
 */
export async function sincronizarTudoCdss(): Promise<SyncAllResult> {
  const startTime = Date.now();
  console.log('[SyncAll] ========================================================');
  console.log('[SyncAll] Iniciando Sincronização Completa: SISPORT (Catálogo Oficial) -> DataDocked AIS');
  console.log('[SyncAll] ========================================================');

  // ETAPA 1: Sincronização com SISPORT Oficial + Catálogo Interno de Navios
  console.log('[SyncAll] [1/2] Sincronizando programação oficial do SISPORT com catálogo oficial...');
  const sisportResult = await sincronizarComSisportOficial();
  console.log(`[SyncAll] [1/2] ✓ SISPORT concluído. ${sisportResult.totalSincronizados} escalas importadas com IMOs oficiais.`);

  const sql = getDatabase();
  const naviosDb = (await sql`SELECT * FROM lineup_navios ORDER BY ordem_fila ASC, id ASC`) as any[];

  let catalogoIdentificados = naviosDb.filter(n => n.imo && /^\d{6,8}$/.test(n.imo)).length;
  let dataDockedAtualizados = 0;

  // ETAPA 2: Consulta DataDocked AIS para os navios com IMO válido
  console.log(`[SyncAll] [2/2] Processando telemetria AIS (DataDocked) para ${naviosDb.length} navios...`);

  // Executa com concorrência moderada (3 requisições paralelas)
  await runWithConcurrency(naviosDb, 3, async (navio, index) => {
    const nome = navio.nome_navio;
    const imoAtual = String(navio.imo || '').trim();

    const cleanImoParaAis = imoAtual.replace(/\D/g, '');
    const isImoValido = cleanImoParaAis.length >= 6 && cleanImoParaAis.length <= 8;

    if (isImoValido) {
      try {
        console.log(`[SyncAll] Consultando telemetria AIS DataDocked para "${nome}" (IMO ${cleanImoParaAis})...`);
        const telemetria = await consultarDataDocked(cleanImoParaAis);

        if (telemetria) {
          const etaAis = telemetria.eta_previsto || null;
          await sql`
            UPDATE lineup_navios SET
              latitude = ${telemetria.latitude},
              longitude = ${telemetria.longitude},
              eta_ais = ${etaAis},
              sinal_antena = ${telemetria.positionReceived || null},
              loa = CASE WHEN loa IS NULL OR loa <= 0 THEN ${telemetria.loa || navio.loa} ELSE loa END,
              dwt = CASE WHEN dwt IS NULL OR dwt <= 0 THEN ${telemetria.dwt || navio.dwt} ELSE dwt END,
              calado = CASE WHEN calado IS NULL OR calado <= 0 THEN ${telemetria.calado || navio.calado} ELSE calado END,
              ais_sincronizado_em = CURRENT_TIMESTAMP,
              ultima_atualizacao = CURRENT_TIMESTAMP
            WHERE id = ${navio.id}
          `;
          dataDockedAtualizados++;
          console.log(`[SyncAll] ✓ DataDocked: "${nome}" AIS atualizado (Lat: ${telemetria.latitude}, Lon: ${telemetria.longitude}, ETA AIS: ${etaAis || 'N/A'})`);
        }
      } catch (err) {
        console.warn(`[SyncAll] Falha não impeditiva no DataDocked para IMO ${cleanImoParaAis} ("${nome}"):`, (err as Error).message);
      }
    } else {
      console.log(`[SyncAll] Pulando DataDocked para "${nome}": IMO "${imoAtual}" não é um IMO numérico padrão.`);
    }

    // Pausa defensiva (50ms) entre processamentos
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  // ETAPA 3: Recálculo do Motor de Atracação CDSS
  console.log('[SyncAll] Recalculando motor de line-up e janelas de maré...');
  const recalculado = await recalcularLineupComMotor();
  const tempoDecorridoMs = Date.now() - startTime;

  console.log(`[SyncAll] ========================================================`);
  console.log(`[SyncAll] Sincronização Completa Concluída em ${(tempoDecorridoMs / 1000).toFixed(1)}s!`);
  console.log(`[SyncAll] Escalas SISPORT: ${sisportResult.totalSincronizados} | IMOs Catálogo: ${catalogoIdentificados} | DataDocked: ${dataDockedAtualizados}`);
  console.log(`[SyncAll] ========================================================`);

  return {
    stats: {
      totalSisport: sisportResult.totalSincronizados,
      catalogoIdentificados,
      dataDockedAtualizados,
      tempoDecorridoMs
    },
    message: `Sincronização completa realizada com sucesso! ${sisportResult.totalSincronizados} escalas importadas, ${catalogoIdentificados} IMOs identificados no catálogo oficial e ${dataDockedAtualizados} embarcações com AIS atualizado no DataDocked.`,
    recalculado
  };
}
