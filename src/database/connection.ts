import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Resolve a URL de conexão com o PostgreSQL a partir das variáveis de ambiente.
 * Suporta prioritariamente DATABASE_URL (padrão Dokploy/produção) ou montagem via variáveis avulsas.
 */
function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
    return process.env.DATABASE_URL.trim();
  }

  const user = process.env.POSTGRES_USER || process.env.DB_USER;
  const password = process.env.POSTGRES_PASSWORD || process.env.DB_PASSWORD;
  const host = process.env.POSTGRES_HOST || process.env.DB_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || process.env.DB_PORT || '5432';
  const database = process.env.POSTGRES_DB || process.env.DB_NAME;

  if (user && password && database) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  throw new Error(
    'Configuração do PostgreSQL não encontrada. Defina DATABASE_URL no Dokploy/ambiente ou as variáveis POSTGRES_USER, POSTGRES_PASSWORD e POSTGRES_DB.'
  );
}

const connectionString = resolveDatabaseUrl();

// Pool de conexões otimizado com postgres.js
export const sql = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Suprime logs verbosos de NOTICE do Postgres (ex: relation already exists, skipping)
  transform: {
    undefined: null
  }
});

export function getDatabase(): postgres.Sql {
  return sql;
}

export async function closeDatabase(): Promise<void> {
  await sql.end();
}

export default sql;
