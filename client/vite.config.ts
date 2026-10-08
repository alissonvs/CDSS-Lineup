import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega variáveis do arquivo .env na raiz do projeto
  const env = loadEnv(mode, path.resolve(process.cwd(), '..'), '');
  const serverPort = env.PORT || process.env.PORT || '3000';

  const cartoApiKey = env.CARTO_API_KEY || env.VITE_CARTO_API_KEY || process.env.CARTO_API_KEY || '';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.CARTO_API_KEY': JSON.stringify(cartoApiKey),
      'import.meta.env.VITE_CARTO_API_KEY': JSON.stringify(cartoApiKey)
    },
    envPrefix: ['VITE_', 'CARTO_'],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${serverPort}`,
          changeOrigin: true
        }
      }
    }
  };
});

