import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega variáveis do arquivo .env na raiz do projeto
  const env = loadEnv(mode, path.resolve(process.cwd(), '..'), '');
  const serverPort = env.PORT || process.env.PORT || '3000';

  const cartoApiKey = env.CARTO_API_KEY || env.VITE_CARTO_API_KEY || process.env.CARTO_API_KEY || '';

  // Carrega a versão oficial a partir do package.json da raiz (Single Source of Truth)
  let appVersion = '2.0.0';
  try {
    const rootPkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    if (fs.existsSync(rootPkgPath)) {
      const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
      if (rootPkg.version) appVersion = rootPkg.version;
    }
  } catch {
    // fallback seguro
  }

  return {
    plugins: [react()],
    define: {
      'import.meta.env.CARTO_API_KEY': JSON.stringify(cartoApiKey),
      'import.meta.env.VITE_CARTO_API_KEY': JSON.stringify(cartoApiKey),
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
      '__APP_VERSION__': JSON.stringify(appVersion)
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

