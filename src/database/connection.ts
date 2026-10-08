import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('A variável de ambiente DATABASE_URL não foi definida.');
}

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
