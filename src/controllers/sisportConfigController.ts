import { Request, Response } from 'express';
import { sisportSchedulerService } from '../services/sisportSchedulerService.js';
import { recalcularLineupComMotor } from '../services/engine.js';

/**
 * Retorna as configurações ativas e telemetria do agendador automático do SISPORT
 */
export async function getSisportConfigHandler(_req: Request, res: Response): Promise<void> {
  try {
    const status = sisportSchedulerService.obterStatus();
    res.json({
      success: true,
      config: status
    });
  } catch (err) {
    console.error('[SisportConfigController] Erro ao obter configurações do SISPORT:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}

/**
 * Atualiza os parâmetros de agendamento em tempo de execução
 */
export async function updateSisportConfigHandler(req: Request, res: Response): Promise<void> {
  try {
    const { ativo, intervaloMinutos, modoSync } = req.body;

    const novaConfig = await sisportSchedulerService.reconfigurar({
      ativo: ativo !== undefined ? Boolean(ativo) : undefined,
      intervaloMinutos: intervaloMinutos !== undefined ? Number(intervaloMinutos) : undefined,
      modoSync: modoSync !== undefined ? modoSync : undefined
    });

    res.json({
      success: true,
      message: 'Parâmetros de sincronização do SISPORT atualizados com sucesso.',
      config: novaConfig
    });
  } catch (err) {
    console.error('[SisportConfigController] Erro ao atualizar configurações do SISPORT:', err);
    res.status(400).json({ success: false, error: (err as Error).message });
  }
}

/**
 * Dispara uma sincronização manual sob demanda garantindo proteção de concorrência com o scheduler
 */
export async function triggerSisportSyncHandler(_req: Request, res: Response): Promise<void> {
  try {
    const resultado = await sisportSchedulerService.executarSincronizacao('MANUAL');

    if (!resultado.sucesso) {
      if (resultado.motivo === 'JA_EM_EXECUCAO') {
        res.status(409).json({
          success: false,
          error: 'Já existe uma sincronização com o SISPORT em andamento. Aguarde alguns instantes.'
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: resultado.erro || 'Falha ao sincronizar com SISPORT'
      });
      return;
    }

    const recalculado = await recalcularLineupComMotor(true);

    res.json({
      success: true,
      message: `Sincronização manual concluída! ${resultado.totalSincronizados} escalas importadas da CDSS.`,
      total: resultado.totalSincronizados,
      data: recalculado.navios,
      operacional: recalculado.operacional
    });
  } catch (err) {
    console.error('[SisportConfigController] Erro ao disparar sincronização manual:', err);
    res.status(500).json({ success: false, error: (err as Error).message });
  }
}
