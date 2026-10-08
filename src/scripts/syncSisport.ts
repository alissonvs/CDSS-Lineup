import dotenv from 'dotenv';
import { initializeDatabase } from '../database/init.js';
import { sincronizarComSisportOficial } from '../services/sisportSync.js';

dotenv.config();

async function run() {
  try {
    await initializeDatabase();
    console.log('⚓ Conectando à programação oficial do Porto de São Sebastião...');
    const result = await sincronizarComSisportOficial();
    console.log(`✅ Sucesso! Foram sincronizados ${result.totalSincronizados} navios oficiais:`);
    result.novosNavios.forEach((nome, i) => console.log(`   ${i + 1}. ${nome}`));
    console.log(`📊 Taxa de Ocupação Atualizada: ${result.recalculado.operacional.taxa_ocupacao_berco}%`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Falha na sincronização:', err);
    process.exit(1);
  }
}

run();
