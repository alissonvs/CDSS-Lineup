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
import {
  getSisportConfigHandler,
  updateSisportConfigHandler,
  triggerSisportSyncHandler
} from '../controllers/sisportConfigController.js';
import {
  getPautaPraticagemHandler,
  syncPraticagemHandler
} from '../controllers/praticagemController.js';
import { identificarBercoPorCoordenadas } from '../services/bercoGeoService.js';
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
router.get('/navios/search', searchNavioCatalogoHandler);

// SISPORT: Sincronização Periódica e Parametrizada (Melhoria 8)
router.get('/sisport/config', getSisportConfigHandler);
router.put('/sisport/config', updateSisportConfigHandler);
router.post('/sisport/sync', triggerSisportSyncHandler);
router.post('/sisport/sync-all', syncAllHandler);

// Praticagem de São Sebastião (SP Pilots)
router.get('/praticagem/pauta', getPautaPraticagemHandler);
router.post('/praticagem/sync', syncPraticagemHandler);

// Operação, Clima e Tábua de Marés
router.get('/operacional/resumo', getResumoOperacionalHandler);
router.get('/financeiro/resumo', getResumoOperacionalHandler); // Rota legada de resumo
router.get('/clima', getClimaHandler);
router.get('/mares', getMaresHandler);
router.get('/weather/tide/current', getCurrentTideHandler);
router.get('/weather/rain/forecast', getRainForecastHandler);

// Geofencing e Identificação Automática de Berços por Coordenadas AIS
router.get('/bercos/identificar', (req, res) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);
  const sog = req.query.sog ? parseFloat(req.query.sog as string) : undefined;
  if (isNaN(lat) || isNaN(lon)) {
    res.status(400).json({ success: false, error: 'Parâmetros lat e lon são obrigatórios.' });
    return;
  }
  const resultado = identificarBercoPorCoordenadas(lat, lon, sog);
  res.json({ success: true, data: resultado });
});

export default router;

