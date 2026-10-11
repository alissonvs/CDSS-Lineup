import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { getDatabase } from '../database/connection.js';

dotenv.config();

export interface PraticagemManobra {
  id?: number;
  spManobraId?: number | null;
  categoria: 'ENCERRADAS' | 'EM_ANDAMENTO' | 'CONFIRMADAS' | 'CONFIRMADAS_AGENTE' | 'SOLICITADAS';
  categoriaLabel: string;
  corFundo?: string;
  nomeNavio: string;
  imo?: string | null;
  tipoManobra: 'E' | 'S' | 'M' | string;
  localOrigem: string;
  localDestino: string;
  horarioStr: string;
  horarioIso: string;
  indicadores: string[];
  agente?: string;
  calado?: number | null;
  bordo?: string;
  rebocador?: string;
  observacoes?: string;
  detalhesNavio?: Record<string, string> | null;
  vinculoLineupImo?: string | null;
  atualizadoEm?: string;
}

export interface PraticagemResumoPortoItem {
  id?: number;
  tipo: 'AGUARDADOS' | 'FUNDEADOS' | 'ATRACADOS';
  navio: string;
  berco?: string | null;
  dataHoraStr?: string | null;
  dataHoraIso?: string | null;
  ordem?: number;
  vinculoLineupImo?: string | null;
}

export interface PraticagemPautaResponse {
  manobras: {
    encerradas: PraticagemManobra[];
    emAndamento: PraticagemManobra[];
    confirmadas: PraticagemManobra[];
    confirmadasAgente: PraticagemManobra[];
    solicitadas: PraticagemManobra[];
  };
  resumoPorto: {
    aguardados: PraticagemResumoPortoItem[];
    fundeados: PraticagemResumoPortoItem[];
    atracados: PraticagemResumoPortoItem[];
  };
  syncStatus: {
    ultimaSincronizacao: string | null;
    status: string;
    totalManobras: number;
    totalAguardados: number;
    totalFundeados: number;
    totalAtracados: number;
    mensagemErro?: string | null;
  };
}

export class PraticagemService {
  private user = process.env.SP_PILOTS_USER || 'docasssb';
  private pass = process.env.SP_PILOTS_PASS || 'Docas#2019';
  private baseUrl = process.env.SP_PILOTS_URL || 'https://ssb.sppilots.com.br';

  /**
   * Executa a autenticação e scraping de https://ssb.sppilots.com.br/sources/manobra/pautaservico.asp
   */
  public async sincronizarPraticagem(): Promise<{ totalManobras: number; sucesso: boolean }> {
    const sql = getDatabase();
    console.log('[Praticagem] Iniciando sincronização da Pauta de Praticagem (SP Pilots)...');

    try {
      // 1. Obter cookie de sessão inicial ASP
      const initRes = await fetch(`${this.baseUrl}/sources/manobra/pautaservico.asp`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      const rawCookies = (initRes.headers as any).getSetCookie ? (initRes.headers as any).getSetCookie() : [initRes.headers.get('set-cookie') || ''];
      const cookies: Record<string, string> = {};
      for (const c of rawCookies) {
        if (!c) continue;
        const parts = c.split(';')[0].split('=');
        cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
      }

      const cookieStr1 = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

      // 2. Realizar POST de login em /default.asp
      const bodyParams = new URLSearchParams({
        cmd: 'LOG',
        act: '',
        userid: this.user,
        password: this.pass,
        btLogin: 'Ok'
      });

      const loginRes = await fetch(`${this.baseUrl}/default.asp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': cookieStr1,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        },
        body: bodyParams.toString(),
        redirect: 'manual'
      });

      const loginCookies = (loginRes.headers as any).getSetCookie ? (loginRes.headers as any).getSetCookie() : [loginRes.headers.get('set-cookie') || ''];
      for (const c of loginCookies) {
        if (!c) continue;
        const parts = c.split(';')[0].split('=');
        cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
      }

      const cookieStr2 = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');

      // 3. Obter pautaservico.asp autenticado
      const pautaRes = await fetch(`${this.baseUrl}/sources/manobra/pautaservico.asp`, {
        headers: {
          'Cookie': cookieStr2,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      if (!pautaRes.ok) {
        throw new Error(`Erro HTTP ao buscar pautaservico.asp: ${pautaRes.status} ${pautaRes.statusText}`);
      }

      const buffer = await pautaRes.arrayBuffer();
      const decoder = new TextDecoder('iso-8859-1');
      const html = decoder.decode(buffer);
      const $ = cheerio.load(html);

      // 4. Extrair metadados e características dos navios a partir de HINTS_ITEMS
      const hintsMatch = html.match(/var\s+HINTS_ITEMS\s*=\s*\[([\s\S]*?)\];\s*var\s+myHint/);
      const vesselHints: Record<number, Record<string, string>> = {};
      if (hintsMatch) {
        try {
          const rawHintsArrayStr = `[${hintsMatch[1]}]`;
          const rawHints: string[] = eval(rawHintsArrayStr);
          rawHints.forEach((hHtml, idx) => {
            const $h = cheerio.load(hHtml);
            const name = $h('td[style*="font-size: 16px"]').contents().first().text().trim();
            const details: Record<string, string> = { name };
            $h('table').each((_, tbl) => {
              const headerRow = $h(tbl).find('tr').first();
              const dataRow = $h(tbl).find('tr').last();
              const headers = headerRow.find('td').map((_, td) => $h(td).text().trim()).get();
              const values = dataRow.find('td').map((_, td) => $h(td).text().trim()).get();
              headers.forEach((hdr, i) => {
                if (hdr && values[i]) {
                  details[hdr] = values[i];
                }
              });
            });
            vesselHints[idx] = details;
          });
        } catch (hintErr) {
          console.warn('[Praticagem] Erro ao processar HINTS_ITEMS:', hintErr);
        }
      }

      // 5. Mapear Navios do CDSS Lineup em memória para cruzamento rápido
      const lineupVessels = await sql`
        SELECT imo, UPPER(TRIM(nome_navio)) as nome_norm, status_cor
        FROM lineup_navios
      `;
      const lineupMapByImo = new Map<string, any>();
      const lineupMapByName = new Map<string, any>();
      for (const lv of lineupVessels) {
        if (lv.imo) lineupMapByImo.set(lv.imo, lv);
        if (lv.nome_norm) lineupMapByName.set(lv.nome_norm, lv);
      }

      const resolveLineupImo = (nomeNavio: string, imo?: string | null): string | null => {
        if (imo && lineupMapByImo.has(imo)) {
          return imo;
        }
        const norm = (nomeNavio || '').toUpperCase().trim();
        if (lineupMapByName.has(norm)) {
          return lineupMapByName.get(norm).imo;
        }
        // Verificação por substring ou início do nome
        for (const [key, val] of lineupMapByName.entries()) {
          if (norm.length >= 4 && (key.includes(norm) || norm.includes(key))) {
            return val.imo;
          }
        }
        return null;
      };

      // 6. Extrair Manobras das 5 Tabelas
      const tableConfigs: Array<{
        id: string;
        cat: PraticagemManobra['categoria'];
        label: string;
        cor: string;
      }> = [
        { id: 'PTA6', cat: 'ENCERRADAS', label: 'Manobras Encerradas', cor: '#ff4a4a' },
        { id: 'PTA5', cat: 'EM_ANDAMENTO', label: 'Manobras em Andamento', cor: '#D1A2F9' },
        { id: 'PTA4', cat: 'CONFIRMADAS', label: 'Manobras Confirmadas', cor: '#b7b7ff' },
        { id: 'PTA3', cat: 'CONFIRMADAS_AGENTE', label: 'Manobras Confirmadas pelo Agente', cor: '#ffffcc' },
        { id: 'PTA1', cat: 'SOLICITADAS', label: 'Manobras Solicitadas', cor: '#ffffff' }
      ];

      const manobrasExtraidas: PraticagemManobra[] = [];

      for (const cfg of tableConfigs) {
        const $tbl = $(`table#${cfg.id}`);
        if ($tbl.length === 0) continue;

        $tbl.find('tr').each((_, tr) => {
          const tds = $(tr).find('td');
          if (tds.length < 10) return;

          const actionImg = $(tds[0]).find('img[onClick*="showPopup"], img[onclick*="showPopup"]');
          const onClickStr = actionImg.attr('onClick') || actionImg.attr('onclick') || '';
          const popupIdMatch = onClickStr.match(/showPopup\((\d+)\)/i);
          const spManobraId = popupIdMatch ? parseInt(popupIdMatch[1], 10) : null;

          const vesselSpan = $(tds[1]).find('span');
          const navioNome = vesselSpan.text().trim() || $(tds[1]).text().trim();
          if (!navioNome || navioNome === 'NOME DO NAVIO') return;

          const onmouseoverStr = vesselSpan.attr('onmouseover') || '';
          const hintIdxMatch = onmouseoverStr.match(/myHint\.show\((\d+)\)/);
          const hintIdx = hintIdxMatch ? parseInt(hintIdxMatch[1], 10) : null;
          const detalhes = hintIdx !== null ? vesselHints[hintIdx] : null;

          const tipoManobra = $(tds[2]).text().trim();
          const local1 = $(tds[3]).text().trim().replace(/&nbsp;/g, '');
          const local2 = $(tds[4]).text().trim().replace(/&nbsp;/g, '');
          const horarioStr = $(tds[5]).text().trim();

          const indicadores: string[] = [];
          [tds[6], tds[7], tds[8]].forEach(tdCol => {
            const img = $(tdCol).find('img');
            if (img.length > 0) {
              const alt = img.attr('alt');
              if (alt) indicadores.push(alt);
            }
          });

          const agente = $(tds[9]).text().trim();
          const caladoStr = $(tds[10]).text().trim().replace(',', '.');
          const calado = caladoStr ? parseFloat(caladoStr) : null;
          const bordo = $(tds[11]).text().trim().replace(/&nbsp;/g, '');
          const rebocador = $(tds[12]).text().trim().replace(/&nbsp;/g, '');
          const obs = $(tds[13]).text().trim().replace(/&nbsp;/g, '');

          let horarioIso = '';
          const hMatch = horarioStr.match(/^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
          if (hMatch) {
            const [, d, m, h, min] = hMatch;
            horarioIso = `2026-${m}-${d}T${h}:${min}:00-03:00`;
          }

          const imo = detalhes?.['IMO NUMBER'] || null;
          const vinculoLineupImo = resolveLineupImo(navioNome, imo);

          manobrasExtraidas.push({
            spManobraId,
            categoria: cfg.cat,
            categoriaLabel: cfg.label,
            corFundo: cfg.cor,
            nomeNavio: navioNome,
            imo,
            tipoManobra,
            localOrigem: local1,
            localDestino: local2,
            horarioStr,
            horarioIso,
            indicadores,
            agente,
            calado,
            bordo,
            rebocador,
            observacoes: obs,
            detalhesNavio: detalhes,
            vinculoLineupImo
          });
        });
      }

      // 7. Extrair Resumo do Porto (Sidebar)
      const aguardadosList: PraticagemResumoPortoItem[] = [];
      $('table#AGUARDADOS tr').each((idx, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 2) {
          const n = $(tds[0]).text().trim();
          const d = $(tds[1]).text().trim();
          if (n && n !== 'AGUARDADOS') {
            let iso = '';
            const m = d.match(/^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})$/);
            if (m) iso = `2026-${m[2]}-${m[1]}T${m[3]}:${m[4]}:00-03:00`;
            aguardadosList.push({
              tipo: 'AGUARDADOS',
              navio: n,
              dataHoraStr: d,
              dataHoraIso: iso,
              ordem: idx,
              vinculoLineupImo: resolveLineupImo(n)
            });
          }
        }
      });

      const fundeadosList: PraticagemResumoPortoItem[] = [];
      $('table#FUNDEADOS tr').each((idx, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 1) {
          const n = $(tds[0]).text().trim();
          if (n && n !== 'FUNDEADOS') {
            fundeadosList.push({
              tipo: 'FUNDEADOS',
              navio: n,
              ordem: idx,
              vinculoLineupImo: resolveLineupImo(n)
            });
          }
        }
      });

      const atracadosList: PraticagemResumoPortoItem[] = [];
      $('table#ATRACADOS tr').each((idx, tr) => {
        const tds = $(tr).find('td');
        if (tds.length >= 2) {
          const b = $(tds[0]).text().trim();
          const n = $(tds[1]).text().trim();
          if (n && n !== 'ATRACADOS') {
            atracadosList.push({
              tipo: 'ATRACADOS',
              berco: b,
              navio: n,
              ordem: idx,
              vinculoLineupImo: resolveLineupImo(n)
            });
          }
        }
      });

      // 8. Salvar no Banco de Dados PostgreSQL
      await sql.begin(async sqlTx => {
        // Limpa tabelas para atualizar o estado completo da pauta
        await sqlTx`TRUNCATE TABLE praticagem_manobras RESTART IDENTITY`;
        await sqlTx`TRUNCATE TABLE praticagem_resumo_porto RESTART IDENTITY`;

        // Insere Manobras
        for (const m of manobrasExtraidas) {
          await sqlTx`
            INSERT INTO praticagem_manobras (
              sp_manobra_id, categoria, categoria_label, cor_fundo, nome_navio, imo,
              tipo_manobra, local_origem, local_destino, horario_str, horario_iso,
              indicadores, agente, calado, bordo, rebocador, observacoes,
              detalhes_navio, vinculo_lineup_imo
            ) VALUES (
              ${m.spManobraId ?? null}, ${m.categoria}, ${m.categoriaLabel}, ${m.corFundo ?? null},
              ${m.nomeNavio}, ${m.imo ?? null}, ${m.tipoManobra}, ${m.localOrigem ?? ''}, ${m.localDestino ?? ''},
              ${m.horarioStr}, ${m.horarioIso}, ${JSON.stringify(m.indicadores)}, ${m.agente ?? null},
              ${m.calado ?? null}, ${m.bordo ?? null}, ${m.rebocador ?? null}, ${m.observacoes ?? null},
              ${m.detalhesNavio ? JSON.stringify(m.detalhesNavio) : null},
              ${m.vinculoLineupImo ?? null}
            )
          `;
        }


        // Insere Resumo do Porto
        const todosResumo = [...aguardadosList, ...fundeadosList, ...atracadosList];
        for (const item of todosResumo) {
          await sqlTx`
            INSERT INTO praticagem_resumo_porto (
              tipo, navio, berco, data_hora_str, data_hora_iso, ordem, vinculo_lineup_imo
            ) VALUES (
              ${item.tipo}, ${item.navio}, ${item.berco || null}, ${item.dataHoraStr || null},
              ${item.dataHoraIso || null}, ${item.ordem || 0}, ${item.vinculoLineupImo || null}
            )
          `;
        }

        // Atualiza status de sincronização
        await sqlTx`
          INSERT INTO praticagem_sync_status (
            id, ultima_sincronizacao, status, total_manobras,
            total_aguardados, total_fundeados, total_atracados, mensagem_erro
          ) VALUES (
            1, CURRENT_TIMESTAMP, 'SUCESSO', ${manobrasExtraidas.length},
            ${aguardadosList.length}, ${fundeadosList.length}, ${atracadosList.length}, NULL
          )
          ON CONFLICT (id) DO UPDATE SET
            ultima_sincronizacao = CURRENT_TIMESTAMP,
            status = 'SUCESSO',
            total_manobras = ${manobrasExtraidas.length},
            total_aguardados = ${aguardadosList.length},
            total_fundeados = ${fundeadosList.length},
            total_atracados = ${atracadosList.length},
            mensagem_erro = NULL
        `;
      });

      console.log(`[Praticagem] Sincronização concluída com sucesso! ${manobrasExtraidas.length} manobras, ${aguardadosList.length} aguardados, ${fundeadosList.length} fundeados, ${atracadosList.length} atracados.`);
      return { totalManobras: manobrasExtraidas.length, sucesso: true };

    } catch (error) {
      const errMsg = (error as Error).message || String(error);
      console.error('[Praticagem] Erro na sincronização:', errMsg);

      try {
        await sql`
          INSERT INTO praticagem_sync_status (
            id, ultima_sincronizacao, status, total_manobras, mensagem_erro
          ) VALUES (
            1, CURRENT_TIMESTAMP, 'ERRO', 0, ${errMsg}
          )
          ON CONFLICT (id) DO UPDATE SET
            status = 'ERRO',
            mensagem_erro = ${errMsg}
        `;
      } catch (errDb) {
        console.error('[Praticagem] Erro ao gravar falha no banco:', errDb);
      }

      return { totalManobras: 0, sucesso: false };
    }
  }

  /**
   * Retorna os dados completos da Pauta de Praticagem salvos no PostgreSQL
   */
  public async getPautaPraticagem(): Promise<PraticagemPautaResponse> {
    const sql = getDatabase();

    const manobrasRows = await sql`
      SELECT 
        id, sp_manobra_id as "spManobraId", categoria, categoria_label as "categoriaLabel",
        cor_fundo as "corFundo", nome_navio as "nomeNavio", imo,
        tipo_manobra as "tipoManobra", local_origem as "localOrigem",
        local_destino as "localDestino", horario_str as "horarioStr",
        horario_iso as "horarioIso", indicadores, agente, calado, bordo,
        rebocador, observacoes, detalhes_navio as "detalhesNavio",
        vinculo_lineup_imo as "vinculoLineupImo", atualizado_em as "atualizadoEm"
      FROM praticagem_manobras
      ORDER BY id ASC
    `;

    const resumoRows = await sql`
      SELECT 
        id, tipo, navio, berco, data_hora_str as "dataHoraStr",
        data_hora_iso as "dataHoraIso", ordem, vinculo_lineup_imo as "vinculoLineupImo"
      FROM praticagem_resumo_porto
      ORDER BY tipo ASC, ordem ASC, id ASC
    `;

    const [statusRow] = await sql`
      SELECT 
        ultima_sincronizacao as "ultimaSincronizacao", status,
        total_manobras as "totalManobras", total_aguardados as "totalAguardados",
        total_fundeados as "totalFundeados", total_atracados as "totalAtracados",
        mensagem_erro as "mensagemErro"
      FROM praticagem_sync_status
      WHERE id = 1
    `;

    // Separa as manobras por categoria
    const manobras = {
      encerradas: [] as PraticagemManobra[],
      emAndamento: [] as PraticagemManobra[],
      confirmadas: [] as PraticagemManobra[],
      confirmadasAgente: [] as PraticagemManobra[],
      solicitadas: [] as PraticagemManobra[]
    };

    for (const m of manobrasRows) {
      const obj: PraticagemManobra = {
        id: m.id,
        spManobraId: m.spManobraId,
        categoria: m.categoria,
        categoriaLabel: m.categoriaLabel,
        corFundo: m.corFundo,
        nomeNavio: m.nomeNavio,
        imo: m.imo,
        tipoManobra: m.tipoManobra,
        localOrigem: m.localOrigem,
        localDestino: m.localDestino,
        horarioStr: m.horarioStr,
        horarioIso: m.horarioIso,
        indicadores: Array.isArray(m.indicadores) ? m.indicadores : (typeof m.indicadores === 'string' ? JSON.parse(m.indicadores) : []),
        agente: m.agente,
        calado: m.calado,
        bordo: m.bordo,
        rebocador: m.rebocador,
        observacoes: m.observacoes,
        detalhesNavio: typeof m.detalhesNavio === 'string' ? JSON.parse(m.detalhesNavio) : m.detalhesNavio,
        vinculoLineupImo: m.vinculoLineupImo,
        atualizadoEm: m.atualizadoEm ? new Date(m.atualizadoEm).toISOString() : undefined
      };

      if (m.categoria === 'ENCERRADAS') manobras.encerradas.push(obj);
      else if (m.categoria === 'EM_ANDAMENTO') manobras.emAndamento.push(obj);
      else if (m.categoria === 'CONFIRMADAS') manobras.confirmadas.push(obj);
      else if (m.categoria === 'CONFIRMADAS_AGENTE') manobras.confirmadasAgente.push(obj);
      else if (m.categoria === 'SOLICITADAS') manobras.solicitadas.push(obj);
    }

    const resumoPorto = {
      aguardados: [] as PraticagemResumoPortoItem[],
      fundeados: [] as PraticagemResumoPortoItem[],
      atracados: [] as PraticagemResumoPortoItem[]
    };

    for (const r of resumoRows) {
      const item: PraticagemResumoPortoItem = {
        id: r.id,
        tipo: r.tipo,
        navio: r.navio,
        berco: r.berco,
        dataHoraStr: r.dataHoraStr,
        dataHoraIso: r.dataHoraIso,
        ordem: r.ordem,
        vinculoLineupImo: r.vinculoLineupImo
      };
      if (r.tipo === 'AGUARDADOS') resumoPorto.aguardados.push(item);
      else if (r.tipo === 'FUNDEADOS') resumoPorto.fundeados.push(item);
      else if (r.tipo === 'ATRACADOS') resumoPorto.atracados.push(item);
    }

    return {
      manobras,
      resumoPorto,
      syncStatus: {
        ultimaSincronizacao: statusRow?.ultimaSincronizacao ? new Date(statusRow.ultimaSincronizacao).toISOString() : null,
        status: statusRow?.status || 'NAO_SINCRONIZADO',
        totalManobras: statusRow?.totalManobras || 0,
        totalAguardados: statusRow?.totalAguardados || 0,
        totalFundeados: statusRow?.totalFundeados || 0,
        totalAtracados: statusRow?.totalAtracados || 0,
        mensagemErro: statusRow?.mensagemErro || null
      }
    };
  }
}

export const praticagemService = new PraticagemService();
export default praticagemService;
