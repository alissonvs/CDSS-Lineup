import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { sql, getDatabase, closeDatabase } from '../database/connection.js';

dotenv.config();

// Mapeamento para correção de artefatos de encoding / mojibake identificados no CSV
const REPLACEMENTS: [RegExp, string][] = [
  [/ALIANÃ¿A/g, 'ALIANÇA'],
  [/AMÃ¿RICAS/g, 'AMÉRICAS'],
  [/IGUAÃ¿U/g, 'IGUAÇU'],
  [/FERN\?O DE MAGALH\?ES/g, 'FERNÃO DE MAGALHÃES'],
  [/FORTE DE S\?O LUIZ/g, 'FORTE DE SÃO LUIZ'],
  [/JO CURAÃ¿AO/g, 'JO CURAÇAO'],
  [/KASKÃ¿O/g, 'KASKÃO'],
  [/REB OURIÃ¿ADO/g, 'REB OURIÇADO'],
  [/SANTA INÃ¿S/g, 'SANTA INÊS'],
  [/SEBASTI\?O CABOTO/g, 'SEBASTIÃO CABOTO']
];

export function sanitizeShipName(name: string): string {
  let cleaned = name.trim();
  for (const [pattern, replacement] of REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned;
}

export interface ImportResult {
  totalLinhasLidas: number;
  totalValidos: number;
  totalInseridos: number;
  totalUnicosBanco: number;
  erros: number;
  tempoGastoMs: number;
}

export async function importarNavios(csvCustomPath?: string): Promise<ImportResult> {
  const inicio = Date.now();
  const db = getDatabase();

  // 1. Localização e leitura do arquivo CSV
  const defaultPath = path.resolve(process.cwd(), 'docs/Navios.csv');
  const targetPath = csvCustomPath ? path.resolve(csvCustomPath) : defaultPath;

  if (!fs.existsSync(targetPath)) {
    throw new Error(`Arquivo CSV de navios não encontrado no caminho: ${targetPath}`);
  }

  console.log(`📂 Lendo arquivo de navios: ${targetPath}`);
  let rawContent = fs.readFileSync(targetPath, 'utf-8');

  // Remove BOM do UTF-8 se presente (\uFEFF)
  if (rawContent.charCodeAt(0) === 0xFEFF) {
    rawContent = rawContent.slice(1);
  }

  const lines = rawContent.split(/\r?\n/).filter(line => line.trim() !== '');
  if (lines.length <= 1) {
    throw new Error('O arquivo CSV está vazio ou contém apenas o cabeçalho.');
  }

  // 2. Garantir que a tabela navios e seus índices existam no banco
  await db`
    CREATE TABLE IF NOT EXISTS navios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      imo TEXT NOT NULL,
      criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_navios_nome_imo UNIQUE (nome, imo)
    );
  `;

  await db`CREATE INDEX IF NOT EXISTS idx_navios_nome ON navios (UPPER(nome))`;
  await db`CREATE INDEX IF NOT EXISTS idx_navios_imo ON navios (imo)`;

  // 3. Processamento das linhas do CSV
  const dataLines = lines.slice(1);
  const rowsToInsert: { nome: string; imo: string }[] = [];
  const seenPair = new Set<string>();
  let erros = 0;

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i];
    const parts = line.split(',');
    if (parts.length < 2) {
      erros++;
      continue;
    }

    const rawNome = parts[0]?.replace(/^["']|["']$/g, '').trim();
    const rawImo = parts[1]?.replace(/^["']|["']$/g, '').trim();

    if (!rawNome || !rawImo) {
      erros++;
      continue;
    }

    const nomeTratado = sanitizeShipName(rawNome);
    const key = `${nomeTratado.toUpperCase()}__${rawImo}`;

    // Evita duplicatas dentro do mesmo lote antes da inserção
    if (seenPair.has(key)) {
      continue;
    }
    seenPair.add(key);

    rowsToInsert.push({
      nome: nomeTratado,
      imo: rawImo
    });
  }

  console.log(`🔍 Total de linhas de dados: ${dataLines.length}`);
  console.log(`✅ Registros válidos e deduplicados a inserir: ${rowsToInsert.length}`);

  // 4. Inserção em lotes (batch insert) otimizada
  const BATCH_SIZE = 1000;
  let inseridos = 0;

  for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
    const chunk = rowsToInsert.slice(i, i + BATCH_SIZE);
    await db`
      INSERT INTO navios ${db(chunk, 'nome', 'imo')}
      ON CONFLICT (nome, imo) DO NOTHING
    `;
    inseridos += chunk.length;
    process.stdout.write(`⏳ Progresso: ${Math.min(inseridos, rowsToInsert.length)}/${rowsToInsert.length}...\r`);
  }
  console.log(`\n💾 Inserção concluída!`);

  // 5. Totalizador no banco
  const [{ count }] = await db`SELECT COUNT(*)::int as count FROM navios`;
  const tempoGastoMs = Date.now() - inicio;

  const resultado: ImportResult = {
    totalLinhasLidas: lines.length - 1,
    totalValidos: rowsToInsert.length,
    totalInseridos: inseridos,
    totalUnicosBanco: count,
    erros,
    tempoGastoMs
  };

  return resultado;
}

// Execução direta via CLI
async function main() {
  try {
    const res = await importarNavios();
    console.log('====================================================');
    console.log('✨ Importação de Navios concluída com sucesso!');
    console.log(`📄 Linhas lidas no CSV: ${res.totalLinhasLidas}`);
    console.log(`✔️  Registros únicos processados: ${res.totalValidos}`);
    console.log(`📊 Total atual na tabela 'navios': ${res.totalUnicosBanco}`);
    console.log(`⚠️  Linhas inválidas ignoradas: ${res.erros}`);
    console.log(`⏱️  Tempo total de execução: ${(res.tempoGastoMs / 1000).toFixed(2)}s`);
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro durante a importação de navios:', err);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

// Verifica se está sendo executado diretamente via terminal
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('importNavios.ts') || 
  process.argv[1].endsWith('importNavios.js')
);

if (isDirectRun) {
  main();
}
