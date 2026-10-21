import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './database/init.js';
import apiRoutes from './routes/api.js';
import { spPilotsService } from './services/spPilotsService.js';
import { praticagemService } from './services/praticagemService.js';
import { sisportSchedulerService } from './services/sisportSchedulerService.js';
import { APP_VERSION } from './version.js';

dotenv.config();

// Inicializa banco de dados PostgreSQL com DDL e SEED caso não existam
await initializeDatabase();

// Inicializa o agendador de sincronização periódica do SISPORT (Melhoria 8)
await sisportSchedulerService.iniciar();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Middlewares
app.use(cors());
app.use(express.json());

// Logging simples de requisições (suprime polling de alta frequência para manter o console limpo)
app.use((req, _res, next) => {
  if (req.path.startsWith('/api')) {
    const isPolling = req.path === '/api/sisport/config' || req.path === '/api/health' || req.path === '/api/livez';
    if (!isPolling) {
      console.log(`[HTTP] ${req.method} ${req.path}`);
    }
  }
  next();
});

// Rotas da API
app.use('/api', apiRoutes);

// Servir frontend compilado em produção com injeção dinâmica de variáveis de ambiente
const clientDistPath = path.resolve(process.cwd(), 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  const indexHtmlPath = path.join(clientDistPath, 'index.html');

  const renderIndexWithEnv = (_req: express.Request, res: express.Response) => {
    try {
      let html = fs.readFileSync(indexHtmlPath, 'utf-8');
      const cartoKey = (process.env.VITE_CARTO_API_KEY || process.env.CARTO_API_KEY || '').trim();
      const injection = `<script>window.__APP_CONFIG__ = Object.assign(window.__APP_CONFIG__ || {}, ${JSON.stringify({ CARTO_API_KEY: cartoKey })});</script>`;
      html = html.replace('</head>', `${injection}</head>`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch {
      res.sendFile(indexHtmlPath);
    }
  };

  // Serve assets estáticos (sem index automático na raiz para permitir injeção dinâmica)
  app.use(express.static(clientDistPath, { index: false }));
  app.get('/', renderIndexWithEnv);
  app.get('*', renderIndexWithEnv);
} else {
  app.get('/', (_req, res) => {
    res.send(`
      <div style="font-family: system-ui; padding: 40px; background: #0f172a; color: #e2e8f0; min-height: 100vh;">
        <h1 style="color: #38bdf8;">PCS Lineup - Porto de São Sebastião</h1>
        <p>Backend operacional ativo na porta <strong>${PORT}</strong>.</p>
        <p>Acesse as rotas da API em <a href="/api/lineup" style="color: #34d399;">/api/lineup</a> ou inicie o cliente de desenvolvimento com <code>npm run dev</code>.</p>
      </div>
    `);
  });
}

const server = app.listen(PORT, HOST, () => {
  console.log(`====================================================`);
  console.log(`⚓ PCS LINEUP v${APP_VERSION} EM EXECUÇÃO`);
  console.log(`📡 Servidor rodando em: http://${HOST}:${PORT}`);
  console.log(`📊 API REST disponível em: http://${HOST}:${PORT}/api/lineup`);
  console.log(`🏥 Healthcheck probe: http://${HOST}:${PORT}/api/health`);
  console.log(`🌊 Telemetria SP Pilots: http://${HOST}:${PORT}/api/weather/tide/current`);
  console.log(`🌧️ Previsão de Chuva: http://${HOST}:${PORT}/api/weather/rain/forecast`);
  console.log(`🚢 Pauta de Praticagem: http://${HOST}:${PORT}/api/praticagem/pauta`);
  console.log(`====================================================`);

  // Dispara coleta inicial imediata da telemetria e da pauta de manobras da Praticagem de SP
  spPilotsService.atualizarTelemetria().then(t => {
    console.log(`[SP Pilots] Telemetria inicial capturada: ${t.alturaMetros.toFixed(2)}m (${t.tendencia}) - Fonte: ${t.fonte}`);
  }).catch(err => {
    console.warn(`[SP Pilots] Falha na coleta inicial da telemetria:`, (err as Error).message);
  });

  praticagemService.sincronizarPraticagem().then(res => {
    console.log(`[Praticagem] Sincronização inicial concluída: ${res.totalManobras} manobras.`);
  }).catch(err => {
    console.warn(`[Praticagem] Falha na sincronização inicial:`, (err as Error).message);
  });

  // Agendador de background a cada 5 minutos (300.000 ms)
  const INTERVALO_COLETA_MS = 5 * 60 * 1000;
  const intervalId = setInterval(() => {
    spPilotsService.atualizarTelemetria().catch(err => {
      console.warn(`[SP Pilots Worker] Falha na atualização periódica:`, (err as Error).message);
    });

    praticagemService.sincronizarPraticagem().catch(err => {
      console.warn(`[Praticagem Worker] Falha na atualização periódica:`, (err as Error).message);
    });
  }, INTERVALO_COLETA_MS);


  // Graceful Shutdown (Encerramento gracioso ao receber SIGTERM ou SIGINT no Docker/Dokploy)
  const shutdown = (signal: string) => {
    console.log(`\n[Server] Recebido sinal ${signal}. Encerrando graciosamente...`);
    clearInterval(intervalId);
    sisportSchedulerService.parar();
    server.close(async () => {
      console.log('[Server] Servidor HTTP fechado.');
      try {
        const { closeDatabase } = await import('./database/connection.js');
        await closeDatabase();
        console.log('[Server] Conexão com PostgreSQL encerrada.');
      } catch (err) {
        console.error('[Server] Erro ao fechar banco de dados:', err);
      }
      process.exit(0);
    });

    // Timeout de segurança para forçar encerramento após 10 segundos
    setTimeout(() => {
      console.error('[Server] Timeout no encerramento gracioso. Forçando saída.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
