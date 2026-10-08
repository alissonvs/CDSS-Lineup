import { Request, Response } from 'express';
import { getDatabase } from '../database/connection.js';
import { recalcularLineupComMotor } from '../services/engine.js';
import { consultarDataDocked } from '../services/datadocked.js';
import { obterResumoClima, obterPrevisaoChuvaDetalhada } from '../services/weather.js';
import { NavioLineup } from '../types/index.js';
import { buscarImoNoCatalogo } from '../services/navioMatcherService.js';
import { spPilotsService } from '../services/spPilotsService.js';
import {
  obterStatusMareAtual,
  obterCurvaMare,
  obterExtremosMare,
  PROFUNDIDADE_BERCO_ZH,
  UKC_MINIMO_REGULAMENTAR,
  CALADO_CRITICO_LIMIAR
} from '../services/tideService.js';

export async function getHealthHandler(_req: Request, res: Response): Promise<void> {
  try {
    const sql = getDatabase();
    await sql`SELECT 1`;
    res.json({
      status: 'healthy',
      database: 'connected',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: err.message
    });
  }
}

export async function getLineupHandler(_req: Request, res: Response): Promise<void> {
  try {
    const result = await recalcularLineupComMotor();
    res.json({
      success: true,
      data: result.navios,
      operacional: result.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro ao obter lineup:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function createNavioHandler(req: Request, res: Response): Promise<void> {
  try {
    const sql = getDatabase();
    const body = req.body as Partial<NavioLineup>;

    const nomeNavio = body.nome_navio?.trim();
    if (!nomeNavio || !body.mercadoria || body.volume_t === undefined) {
      res.status(400).json({ success: false, error: 'Campos obrigatórios ausentes: Nome da Embarcação, Mercadoria e Volume.' });
      return;
    }

    let imo = body.imo?.trim();
    let tipoNavio = body.tipo_navio?.trim();
    let loa = body.loa ? Number(body.loa) : undefined;
    let dwt = body.dwt ? Number(body.dwt) : undefined;
    let calado = body.calado ? Number(body.calado) : undefined;

    // Se o IMO não foi informado manualmente, consulta automaticamente no catálogo oficial de navios
    if (!imo) {
      const matchCatalogo = await buscarImoNoCatalogo(nomeNavio);
      if (matchCatalogo?.imo) {
        imo = matchCatalogo.imo;
      } else {
        // Fallback: gera um IMO de 7 dígitos único
        imo = `9${Math.floor(100000 + Math.random() * 899999)}`;
      }
    }

    // Garante unicidade do IMO no banco de dados
    const existingImo = await sql`SELECT id FROM lineup_navios WHERE imo = ${imo}`;
    if (existingImo.length > 0) {
      imo = `${imo}_${Date.now().toString().slice(-4)}`;
    }

    // Calcula a próxima ordem na fila se não informada
    let ordem = body.ordem_fila;
    if (ordem === undefined || ordem === null) {
      const [maxRow] = await sql`SELECT COALESCE(MAX(ordem_fila), 0)::int as max_ordem FROM lineup_navios`;
      ordem = maxRow.max_ordem + 1;
    }

    // Derivação automática de status para a nova escala
    let statusCor = body.status_cor;
    if (!statusCor) {
      if (body.chegada_fundeio) {
        statusCor = 'VERMELHO';
      } else if (body.livre_pratica_ok) {
        statusCor = 'CINZA';
      } else {
        statusCor = 'LARANJA';
      }
    }

    const [inserted] = await sql`
      INSERT INTO lineup_navios (
        imo, nome_navio, tipo_navio, mercadoria, volume_t, loa, dwt, calado, agencia,
        ordem_fila, status_cor, livre_pratica_ok, armazem_publico, eta_previsto, eta_ais,
        chegada_fundeio, inicio_atracacao, fim_atracacao, latitude, longitude, progresso_operacao
      ) VALUES (
        ${imo}, ${nomeNavio}, ${tipoNavio || 'Graneleiro Handymax'}, ${body.mercadoria.trim()},
        ${Number(body.volume_t)}, ${loa || 170.0}, ${dwt || 25000}, ${calado || 8.5},
        ${body.agencia?.trim() || 'Agência Local'}, ${Number(ordem)}, ${statusCor},
        ${body.livre_pratica_ok ? 1 : 0}, ${body.armazem_publico ? 1 : 0},
        ${body.eta_previsto || null}, ${body.eta_ais || null}, ${body.chegada_fundeio || null},
        ${body.inicio_atracacao || null}, ${body.fim_atracacao || null},
        ${Number(body.latitude || -23.8045)}, ${Number(body.longitude || -45.3970)},
        ${body.progresso_operacao !== undefined && body.progresso_operacao !== null ? Number(body.progresso_operacao) : null}
      )
      RETURNING id
    `;

    const recalculado = await recalcularLineupComMotor();

    res.status(201).json({
      success: true,
      message: 'Escala inserida com sucesso',
      id: inserted.id,
      data: recalculado.navios,
      operacional: recalculado.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro ao criar navio:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function updateNavioHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const body = req.body as Partial<NavioLineup>;
    const sql = getDatabase();

    const [existing] = (await sql<NavioLineup[]>`SELECT * FROM lineup_navios WHERE id = ${id}`) as (NavioLineup | undefined)[];
    if (!existing) {
      res.status(404).json({ success: false, error: `Escala com ID ${id} não encontrada.` });
      return;
    }

    // Ajusta livre prática e derivação automática de status
    let livrePratica = body.livre_pratica_ok !== undefined ? (body.livre_pratica_ok ? 1 : 0) : existing.livre_pratica_ok;
    let statusCor = body.status_cor || existing.status_cor;

    // Trata atualização de IMO informada manualmente
    let imo = existing.imo;
    if (body.imo !== undefined && body.imo !== null) {
      const imoInformado = String(body.imo).trim();
      if (imoInformado) {
        imo = imoInformado;
      }
    }

    if (imo !== existing.imo) {
      // Verifica se outro registro já utiliza esse mesmo IMO para evitar violação de chave única
      const conflito = await sql`SELECT id, nome_navio FROM lineup_navios WHERE imo = ${imo} AND id != ${id}`;

      if (conflito.length > 0) {
        res.status(400).json({
          success: false,
          error: `O número IMO "${imo}" já está cadastrado para a embarcação "${conflito[0].nome_navio}".`
        });
        return;
      }
    }

    if (body.status_cor) {
      statusCor = body.status_cor;
      if (statusCor === 'VERDE') {
        // Restrição CDSS: Apenas 1 navio simultâneo no cais comercial único
        await sql`UPDATE lineup_navios SET status_cor = 'AZUL' WHERE status_cor = 'VERDE' AND id != ${id}`;
      }
    } else if (existing.status_cor === 'VERDE') {
      statusCor = 'VERDE';
    } else {
      const chegadaFundeio = body.chegada_fundeio !== undefined ? body.chegada_fundeio : existing.chegada_fundeio;
      if (livrePratica === 1) {
        statusCor = 'CINZA';
      } else if (chegadaFundeio) {
        statusCor = 'VERMELHO';
      } else {
        statusCor = 'LARANJA';
      }
    }

    await sql`
      UPDATE lineup_navios SET
        imo = ${imo},
        nome_navio = ${body.nome_navio ?? existing.nome_navio},
        tipo_navio = ${(body.tipo_navio ?? existing.tipo_navio) ?? null},
        mercadoria = ${body.mercadoria ?? existing.mercadoria},
        volume_t = ${body.volume_t !== undefined ? Number(body.volume_t) : existing.volume_t},
        loa = ${body.loa !== undefined ? Number(body.loa) : existing.loa},
        dwt = ${body.dwt !== undefined ? Number(body.dwt) : existing.dwt},
        calado = ${(body.calado !== undefined ? Number(body.calado) : existing.calado) ?? null},
        agencia = ${(body.agencia ?? existing.agencia) ?? null},
        status_cor = ${statusCor},
        livre_pratica_ok = ${livrePratica},
        armazem_publico = ${body.armazem_publico !== undefined ? (body.armazem_publico ? 1 : 0) : existing.armazem_publico},
        eta_previsto = ${(body.eta_previsto !== undefined ? body.eta_previsto : existing.eta_previsto) ?? null},
        eta_ais = ${(body.eta_ais !== undefined ? body.eta_ais : (existing.eta_ais || null)) ?? null},
        chegada_fundeio = ${(body.chegada_fundeio !== undefined ? body.chegada_fundeio : existing.chegada_fundeio) ?? null},
        inicio_atracacao = ${(body.inicio_atracacao !== undefined ? body.inicio_atracacao : existing.inicio_atracacao) ?? null},
        fim_atracacao = ${(body.fim_atracacao !== undefined ? body.fim_atracacao : existing.fim_atracacao) ?? null},
        latitude = ${body.latitude !== undefined ? Number(body.latitude) : existing.latitude},
        longitude = ${body.longitude !== undefined ? Number(body.longitude) : existing.longitude},
        sinal_antena = ${(body.sinal_antena !== undefined ? body.sinal_antena : (existing.sinal_antena || null)) ?? null},
        ais_sincronizado_em = ${(body.ais_sincronizado_em !== undefined ? body.ais_sincronizado_em : (existing.ais_sincronizado_em || null)) ?? null},
        progresso_operacao = ${(body.progresso_operacao !== undefined ? body.progresso_operacao : (existing.progresso_operacao ?? null)) ?? null},
        ultima_atualizacao = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `;

    const recalculado = await recalcularLineupComMotor();
    res.json({
      success: true,
      message: 'Escala atualizada com sucesso',
      data: recalculado.navios,
      operacional: recalculado.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro ao atualizar navio:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function deleteNavioHandler(req: Request, res: Response): Promise<void> {
  try {
    const id = Number(req.params.id);
    const sql = getDatabase();

    await sql.begin(async (tx) => {
      await tx`DELETE FROM lineup_navios WHERE id = ${id}`;

      // Reindexar ordem_fila para não deixar lacunas
      const remaining = await tx`SELECT id FROM lineup_navios ORDER BY ordem_fila ASC, id ASC`;
      for (let idx = 0; idx < remaining.length; idx++) {
        await tx`UPDATE lineup_navios SET ordem_fila = ${idx + 1} WHERE id = ${remaining[idx].id}`;
      }
    });

    const recalculado = await recalcularLineupComMotor();
    res.json({
      success: true,
      message: 'Escala excluída e fila reindexada',
      data: recalculado.navios,
      operacional: recalculado.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro ao excluir navio:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function reordenarFilaHandler(req: Request, res: Response): Promise<void> {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids)) {
      res.status(400).json({ success: false, error: 'Formato inválido. Envie { ids: number[] }' });
      return;
    }

    const sql = getDatabase();

    await sql.begin(async (tx) => {
      for (let index = 0; index < ids.length; index++) {
        await tx`UPDATE lineup_navios SET ordem_fila = ${index + 1} WHERE id = ${ids[index]}`;
      }
    });

    const recalculado = await recalcularLineupComMotor();
    res.json({
      success: true,
      message: 'Prioridades reordenadas com sucesso',
      data: recalculado.navios,
      operacional: recalculado.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro ao reordenar fila:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function syncDataDockedHandler(req: Request, res: Response): Promise<void> {
  try {
    const { imo } = req.params;
    if (!imo) {
      res.status(400).json({ success: false, error: 'IMO obrigatório' });
      return;
    }

    const vesselData = await consultarDataDocked(imo);
    const sql = getDatabase();

    // 1. Identifica se a embarcação já existe no banco (por navioId se fornecido, ou por IMO)
    const navioId = req.query.navioId ? Number(req.query.navioId) : undefined;
    let existing: {
      id: number;
      imo: string;
      nome_navio: string;
      loa: number;
      dwt: number;
      calado: number;
    } | undefined = undefined;

    if (navioId && !isNaN(navioId)) {
      const rows = await sql`SELECT id, imo, nome_navio, loa, dwt, calado FROM lineup_navios WHERE id = ${navioId}`;
      if (rows.length > 0) existing = rows[0] as any;
    }
    if (!existing) {
      const rows = await sql`SELECT id, imo, nome_navio, loa, dwt, calado FROM lineup_navios WHERE imo = ${vesselData.imo}`;
      if (rows.length > 0) existing = rows[0] as any;
    }

    const etaAis = vesselData.eta_previsto || null;

    if (existing) {
      // REGRA DE OURO CDSS: O SISPORT é a autoridade máxima da escala comercial.
      // A telemetria AIS DataDocked atualiza ESTRITAMENTE:
      // - Coordenadas em tempo real (latitude, longitude)
      // - Previsão transmitida pelo comandante no transponder (eta_ais)
      // - Registro do sinal da antena (sinal_antena)
      // - Timestamp da consulta DataDocked (ais_sincronizado_em)
      // Dimensões (loa, dwt, calado) são apenas complementadas caso estejam zeradas/nulas.
      // NUNCA altera: nome_navio, tipo_navio, mercadoria, volume, agencia, ordem_fila, status_cor, chegada_fundeio, inicio_atracacao
      await sql`
        UPDATE lineup_navios SET
          imo = CASE WHEN ${vesselData.imo || null} IS NOT NULL AND ${vesselData.imo || null} != '' THEN ${vesselData.imo} ELSE imo END,
          latitude = ${vesselData.latitude},
          longitude = ${vesselData.longitude},
          eta_ais = ${etaAis},
          sinal_antena = ${vesselData.positionReceived || null},
          loa = CASE WHEN loa IS NULL OR loa <= 0 THEN ${vesselData.loa || 170.0} ELSE loa END,
          dwt = CASE WHEN dwt IS NULL OR dwt <= 0 THEN ${vesselData.dwt || 25000} ELSE dwt END,
          calado = CASE WHEN calado IS NULL OR calado <= 0 THEN ${vesselData.calado || 8.5} ELSE calado END,
          ais_sincronizado_em = CURRENT_TIMESTAMP,
          ultima_atualizacao = CURRENT_TIMESTAMP
        WHERE id = ${existing.id}
      `;
    } else {
      const [maxRow] = await sql`SELECT COALESCE(MAX(ordem_fila), 0)::int as max_ordem FROM lineup_navios`;
      const maxOrdem = maxRow.max_ordem;

      await sql`
        INSERT INTO lineup_navios (
          imo, nome_navio, tipo_navio, mercadoria, volume_t, loa, dwt, calado, agencia,
          ordem_fila, status_cor, livre_pratica_ok, armazem_publico, eta_previsto, eta_ais,
          latitude, longitude, sinal_antena, ais_sincronizado_em, ultima_atualizacao
        ) VALUES (
          ${vesselData.imo}, ${vesselData.nome_navio}, ${vesselData.tipo_navio || 'Graneleiro'},
          ${vesselData.mercadoria || 'Carga Geral'}, ${vesselData.volume_t || 15000},
          ${vesselData.loa || 170.0}, ${vesselData.dwt || 25000}, ${vesselData.calado || 8.5},
          ${vesselData.agencia || 'Agência Cadastrada'}, ${maxOrdem + 1}, 'LARANJA', 0,
          'Armazém 01', ${vesselData.eta_previsto || new Date().toISOString()}, ${etaAis},
          ${vesselData.latitude}, ${vesselData.longitude}, ${vesselData.positionReceived || null},
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `;
    }

    // Recalcula o motor automaticamente para atualizar o line-up com o novo ETA ou calado
    const recalculado = await recalcularLineupComMotor();

    res.json({
      success: true,
      message: 'Dados do DataDocked sincronizados sob demanda (1 Crédito)',
      vessel: vesselData,
      lineup: recalculado,
      navios: recalculado.navios,
      operacional: recalculado.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro na sincronização DataDocked:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function getResumoOperacionalHandler(_req: Request, res: Response): Promise<void> {
  try {
    const result = await recalcularLineupComMotor();
    res.json({
      success: true,
      data: result.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro ao obter resumo operacional:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function getClimaHandler(_req: Request, res: Response): Promise<void> {
  try {
    const clima = await obterResumoClima();
    res.json({
      success: true,
      data: clima
    });
  } catch (err) {
    console.error('[LineupController] Erro ao obter clima:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function syncSisportHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { sincronizarComSisportOficial } = await import('../services/sisportSync.js');
    const syncResult = await sincronizarComSisportOficial();

    res.json({
      success: true,
      message: `Sincronização concluída! ${syncResult.totalSincronizados} escalas importadas da CDSS.`,
      total: syncResult.totalSincronizados,
      data: syncResult.recalculado.navios,
      operacional: syncResult.recalculado.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro na sincronização com SISPORT:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function syncAllHandler(_req: Request, res: Response): Promise<void> {
  try {
    const { sincronizarTudoCdss } = await import('../services/syncAllService.js');
    const syncResult = await sincronizarTudoCdss();

    res.json({
      success: true,
      message: syncResult.message,
      total: syncResult.stats.totalSisport,
      stats: syncResult.stats,
      data: syncResult.recalculado.navios,
      operacional: syncResult.recalculado.operacional
    });
  } catch (err) {
    console.error('[LineupController] Erro na sincronização completa:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function searchNavioCatalogoHandler(req: Request, res: Response): Promise<void> {
  try {
    const name = String(req.query.name || req.query.nome || '').trim();
    if (!name) {
      res.status(400).json({ success: false, error: 'O parâmetro de busca "nome" é obrigatório.' });
      return;
    }

    const match = await buscarImoNoCatalogo(name);
    if (!match) {
      res.status(404).json({ success: false, message: `Nenhum navio localizado no catálogo oficial para "${name}".` });
      return;
    }

    res.json({
      success: true,
      vessel: {
        imo: match.imo,
        nome: match.nomeCatalogo,
        name: match.nomeCatalogo,
        metodo: match.metodo,
        score: match.score
      }
    });
  } catch (err) {
    console.error('[LineupController] Erro ao consultar catálogo de navios:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function getMaresHandler(req: Request, res: Response): Promise<void> {
  try {
    const escalaDias = Math.max(3, Math.min(60, Number(req.query.escalaDias) || 14));
    const agora = new Date();
    const pastDays = 3;
    const inicio = new Date(agora.getTime() - pastDays * 24 * 3600 * 1000);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(inicio.getTime() + escalaDias * 24 * 3600 * 1000);

    const statusAtual = obterStatusMareAtual(agora);
    const curva = obterCurvaMare(inicio, fim, 30); // Amostragem a cada 30 min
    // Adiciona margem de 2 dias antes e 2 dias depois para interpolação contínua da maré no Gantt
    const inicioExtremos = new Date(inicio.getTime() - 2 * 24 * 3600 * 1000);
    const fimExtremos = new Date(fim.getTime() + 2 * 24 * 3600 * 1000);
    const extremos = obterExtremosMare(inicioExtremos, fimExtremos);
    const telemetriaSpPilots = await spPilotsService.obterUltimaLeituraOuFallback();

    res.json({
      success: true,
      statusAtual,
      curva,
      extremos,
      telemetriaSpPilots,
      parametrosPorto: {
        profundidadeBercoZh: PROFUNDIDADE_BERCO_ZH,
        ukcMinimo: UKC_MINIMO_REGULAMENTAR,
        caladoCriticoLimiar: CALADO_CRITICO_LIMIAR,
        estacaoNome: 'Porto de São Sebastião (DHN - Canal de São Sebastião)'
      }
    });
  } catch (err) {
    console.error('[LineupController] Erro ao obter dados de maré da DHN:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function getCurrentTideHandler(_req: Request, res: Response): Promise<void> {
  try {
    const telemetria = await spPilotsService.obterUltimaLeituraOuFallback();
    res.json({
      success: true,
      data: telemetria
    });
  } catch (err) {
    console.error('[LineupController] Erro ao obter maré em tempo real:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

export async function getRainForecastHandler(_req: Request, res: Response): Promise<void> {
  try {
    const forecast = await obterPrevisaoChuvaDetalhada();
    res.json({
      success: true,
      data: forecast
    });
  } catch (err) {
    console.error('[LineupController] Erro ao obter previsão de chuva:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}
