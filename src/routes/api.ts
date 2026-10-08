import { Router } from 'express';
import {
  getHealthHandler,
  getLineupHandler,
  createNavioHandler,
  updateNavioHandler,
  deleteNavioHandler,
  reordenarFilaHandler,
  syncDataDockedHandler,
  getResumoOperacionalHandler,
  getClimaHandler,
  syncSisportHandler,
  syncAllHandler,
  searchNavioCatalogoHandler,
  getMaresHandler,
  getCurrentTideHandler,
  getRainForecastHandler
} from '../controllers/lineupController.js';
import { APP_VERSION } from '../version.js';

const router = Router();

// Healthcheck & Diagnóstico (Dokploy / Docker probes)
router.get('/health', getHealthHandler);
router.get('/livez', (_req, res) => { res.status(200).send('OK'); });
router.get('/version', (_req, res) => { res.json({ name: 'pcs-lineup', version: APP_VERSION }); });

// Lineup e Navios
router.get('/lineup', getLineupHandler);
router.post('/navios', createNavioHandler);
router.put('/navios/:id', updateNavioHandler);
router.delete('/navios/:id', deleteNavioHandler);
router.post('/navios/reordenar', reordenarFilaHandler);
router.post('/navios/sync/:imo', syncDataDockedHandler);
router.post('/sisport/sync', syncSisportHandler);
router.post('/sisport/sync-all', syncAllHandler);
router.get('/navios/search', searchNavioCatalogoHandler);

// Operação, Clima e Tábua de Marés
router.get('/operacional/resumo', getResumoOperacionalHandler);
router.get('/financeiro/resumo', getResumoOperacionalHandler); // Rota legada de resumo
router.get('/clima', getClimaHandler);
router.get('/mares', getMaresHandler);
router.get('/weather/tide/current', getCurrentTideHandler);
router.get('/weather/rain/forecast', getRainForecastHandler);

export default router;
