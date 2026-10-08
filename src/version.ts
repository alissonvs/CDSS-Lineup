import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Obtém a versão oficial da aplicação a partir do package.json (Single Source of Truth).
 * Possui fallback gracioso para '2.0.0'.
 */
function resolveAppVersion(): string {
  try {
    // 1. Tenta ler via process.cwd() (padrão em dev e no container Docker)
    const cwdPkg = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(cwdPkg)) {
      const parsed = JSON.parse(fs.readFileSync(cwdPkg, 'utf-8'));
      if (parsed.version) return parsed.version;
    }

    // 2. Tenta ler a partir do diretório relativo ao arquivo compilado
    const relativePkg = fileURLToPath(new URL('../package.json', import.meta.url));
    if (fs.existsSync(relativePkg)) {
      const parsed = JSON.parse(fs.readFileSync(relativePkg, 'utf-8'));
      if (parsed.version) return parsed.version;
    }
  } catch {
    // Falha silenciosa com fallback seguro
  }

  return '2.0.0';
}

export const APP_VERSION = resolveAppVersion();
