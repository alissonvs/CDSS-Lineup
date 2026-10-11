import { Request, Response } from 'express';
import { praticagemService } from '../services/praticagemService.js';

export async function getPautaPraticagemHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await praticagemService.getPautaPraticagem();
    res.json(data);
  } catch (error) {
    console.error('[Praticagem Controller] Erro ao buscar pauta:', error);
    res.status(500).json({
      error: 'Erro ao buscar pauta de praticagem',
      details: (error as Error).message
    });
  }
}

export async function syncPraticagemHandler(_req: Request, res: Response): Promise<void> {
  try {
    const result = await praticagemService.sincronizarPraticagem();
    const data = await praticagemService.getPautaPraticagem();
    res.json({
      success: result.sucesso,
      totalManobras: result.totalManobras,
      data
    });
  } catch (error) {
    console.error('[Praticagem Controller] Erro ao sincronizar praticagem:', error);
    res.status(500).json({
      error: 'Falha ao sincronizar com Praticagem de SP',
      details: (error as Error).message
    });
  }
}
