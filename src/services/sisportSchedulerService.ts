import { getDatabase } from '../database/connection.js';
import { sincronizarComSisportOficial } from './sisportSync.js';
import { sincronizarTudoCdss } from './syncAllService.js';

export interface SisportConfigState {
  ativo: boolean;
  intervaloMinutos: number;
  modoSync: 'SISPORT_ONLY' | 'FULL_SYNC';
  emExecucao: boolean;
  ultimaExecucao: string | null;
  proximaExecucao: string | null;
  tempoRestanteSegundos: number;
  ultimoStatus: 'SUCESSO' | 'ERRO' | 'EM_ANDAMENTO' | 'PAUSADO' | 'PENDENTE';
  ultimoErro: string | null;
  totalEscalasUltimoSync: number;
  atualizadoEm?: string | null;
}

export class SisportSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isSyncing = false;
  private ativo = true;
  private intervaloMinutos = 15;
  private modoSync: 'SISPORT_ONLY' | 'FULL_SYNC' = 'SISPORT_ONLY';
  private proximaExecucaoTimestamp: number | null = null;
  private ultimaExecucao: string | null = null;
  private ultimoStatus: 'SUCESSO' | 'ERRO' | 'EM_ANDAMENTO' | 'PAUSADO' | 'PENDENTE' = 'PENDENTE';
  private ultimoErro: string | null = null;
  private totalEscalasUltimoSync = 0;

  constructor() {
    // Carrega padrões de ambiente caso existam
    if (process.env.SISPORT_AUTO_SYNC_ENABLED !== undefined) {
      this.ativo = process.env.SISPORT_AUTO_SYNC_ENABLED.toLowerCase() === 'true';
    }
    if (process.env.SISPORT_SYNC_INTERVAL_MINUTES) {
      const parsedInterval = parseInt(process.env.SISPORT_SYNC_INTERVAL_MINUTES, 10);
      if (!isNaN(parsedInterval) && parsedInterval >= 2) {
        this.intervaloMinutos = parsedInterval;
      }
    }
    if (process.env.SISPORT_SYNC_MODE === 'FULL_SYNC' || process.env.SISPORT_SYNC_MODE === 'SISPORT_ONLY') {
      this.modoSync = process.env.SISPORT_SYNC_MODE;
    }
  }

  /**
   * Inicializa o agendador carregando as configurações do banco de dados e disparando o timer
   */
  public async iniciar(): Promise<void> {
    console.log('[SisportScheduler] Inicializando worker de sincronização periódica do SISPORT...');
    try {
      await this.carregarConfiguracaoBanco();

      if (!this.ativo) {
        console.log('[SisportScheduler] Sincronização periódica desativada por configuração.');
        await this.atualizarEstadoBanco();
        return;
      }

      // Dispara a primeira execução após 15 segundos do boot para permitir que o servidor suba normalmente
      const delayInicialMs = 15 * 1000;
      this.programarProximaExecucao(delayInicialMs);
      console.log(`[SisportScheduler] ✓ Worker ativo. Intervalo: a cada ${this.intervaloMinutos} minutos. Primeira coleta em 15s.`);
    } catch (err) {
      console.error('[SisportScheduler] Erro ao inicializar agendador:', err);
    }
  }

  /**
   * Para o agendador de forma limpa (graceful shutdown)
   */
  public parar(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.proximaExecucaoTimestamp = null;
    console.log('[SisportScheduler] Agendador parado com sucesso.');
  }

  /**
   * Carrega a configuração persistida na tabela singleton `sisport_sync_config`
   */
  private async carregarConfiguracaoBanco(): Promise<void> {
    try {
      const sql = getDatabase();
      const rows = await sql`
        SELECT ativo, intervalo_minutos, modo_sync, ultima_execucao, proxima_execucao,
               ultimo_status, ultimo_erro, total_escalas_ultimo_sync
        FROM sisport_sync_config
        WHERE id = 1
      ` as any[];

      if (rows && rows.length > 0) {
        const config = rows[0];
        this.ativo = Boolean(config.ativo);
        this.intervaloMinutos = Number(config.intervalo_minutos) || this.intervaloMinutos;
        this.modoSync = (config.modo_sync === 'FULL_SYNC' ? 'FULL_SYNC' : 'SISPORT_ONLY');
        this.ultimaExecucao = config.ultima_execucao ? new Date(config.ultima_execucao).toISOString() : null;
        this.ultimoStatus = config.ultimo_status || 'PENDENTE';
        this.ultimoErro = config.ultimo_erro || null;
        this.totalEscalasUltimoSync = Number(config.total_escalas_ultimo_sync) || 0;
      } else {
        // Se ainda não existir a linha, insere com as configurações correntes
        await sql`
          INSERT INTO sisport_sync_config (
            id, ativo, intervalo_minutos, modo_sync, ultimo_status
          ) VALUES (
            1, ${this.ativo}, ${this.intervaloMinutos}, ${this.modoSync}, ${this.ultimoStatus}
          )
          ON CONFLICT (id) DO NOTHING
        `;
      }
    } catch (err) {
      console.warn('[SisportScheduler] Aviso ao carregar config do banco (usando padrões):', (err as Error).message);
    }
  }

  /**
   * Atualiza a telemetria e o estado atual no PostgreSQL
   */
  private async atualizarEstadoBanco(): Promise<void> {
    try {
      const sql = getDatabase();
      const proximaIso = this.proximaExecucaoTimestamp ? new Date(this.proximaExecucaoTimestamp).toISOString() : null;

      await sql`
        UPDATE sisport_sync_config SET
          ativo = ${this.ativo},
          intervalo_minutos = ${this.intervaloMinutos},
          modo_sync = ${this.modoSync},
          ultima_execucao = ${this.ultimaExecucao},
          proxima_execucao = ${proximaIso},
          em_execucao = ${this.isSyncing},
          ultimo_status = ${this.ultimoStatus},
          ultimo_erro = ${this.ultimoErro},
          total_escalas_ultimo_sync = ${this.totalEscalasUltimoSync},
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = 1
      `;
    } catch (err) {
      console.warn('[SisportScheduler] Falha ao atualizar estado no banco:', (err as Error).message);
    }
  }

  /**
   * Programa a próxima execução usando setTimeout dinâmico
   */
  private programarProximaExecucao(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.ativo) {
      this.proximaExecucaoTimestamp = null;
      this.ultimoStatus = 'PAUSADO';
      this.atualizarEstadoBanco().catch(() => {});
      return;
    }

    this.proximaExecucaoTimestamp = Date.now() + delayMs;
    this.atualizarEstadoBanco().catch(() => {});

    this.timer = setTimeout(async () => {
      await this.tick();
    }, delayMs);
  }

  /**
   * Ciclo de execução disparado pelo temporizador
   */
  private async tick(): Promise<void> {
    if (!this.ativo) return;

    try {
      console.log(`[SisportScheduler] ⏰ Disparando sincronização programada de segundo plano (${this.modoSync})...`);
      await this.executarSincronizacao('CRON');
    } catch (err) {
      console.error('[SisportScheduler] Erro no ciclo de sincronização:', err);
    } finally {
      // Agenda a próxima rodada com base no intervalo parametrizado
      if (this.ativo) {
        const proximoIntervaloMs = this.intervaloMinutos * 60 * 1000;
        this.programarProximaExecucao(proximoIntervaloMs);
      }
    }
  }

  /**
   * Executa a sincronização do SISPORT com proteção de concorrência (Mutex lock)
   */
  public async executarSincronizacao(origem: 'CRON' | 'MANUAL' = 'CRON'): Promise<{
    sucesso: boolean;
    totalSincronizados?: number;
    motivo?: string;
    erro?: string;
  }> {
    if (this.isSyncing) {
      console.warn(`[SisportScheduler] Sincronização ignorada (${origem}): já existe outra execução em andamento.`);
      return { sucesso: false, motivo: 'JA_EM_EXECUCAO' };
    }

    this.isSyncing = true;
    this.ultimoStatus = 'EM_ANDAMENTO';
    await this.atualizarEstadoBanco();

    const inicio = Date.now();

    try {
      let total = 0;
      if (this.modoSync === 'FULL_SYNC') {
        const resFull = await sincronizarTudoCdss();
        total = resFull.stats.totalSisport;
      } else {
        const resSisport = await sincronizarComSisportOficial();
        total = resSisport.totalSincronizados;
      }

      this.ultimaExecucao = new Date().toISOString();
      this.ultimoStatus = 'SUCESSO';
      this.ultimoErro = null;
      this.totalEscalasUltimoSync = total;

      const duracaoSeg = ((Date.now() - inicio) / 1000).toFixed(1);
      console.log(`[SisportScheduler] ✓ Sincronização (${origem}) concluída com sucesso em ${duracaoSeg}s. Escalas: ${total}.`);

      return { sucesso: true, totalSincronizados: total };
    } catch (err) {
      const msgErro = (err as Error).message || 'Erro desconhecido na sincronização com SISPORT';
      this.ultimoStatus = 'ERRO';
      this.ultimoErro = msgErro;
      console.warn(`[SisportScheduler] ⚠️ Falha na sincronização (${origem}):`, msgErro);
      return { sucesso: false, erro: msgErro };
    } finally {
      this.isSyncing = false;
      await this.atualizarEstadoBanco();
    }
  }

  /**
   * Reconfigura os parâmetros de agendamento em tempo de execução
   */
  public async reconfigurar(params: {
    ativo?: boolean;
    intervaloMinutos?: number;
    modoSync?: 'SISPORT_ONLY' | 'FULL_SYNC';
  }): Promise<SisportConfigState> {
    if (params.ativo !== undefined) {
      this.ativo = Boolean(params.ativo);
    }

    if (params.intervaloMinutos !== undefined) {
      const novoIntervalo = Number(params.intervaloMinutos);
      if (isNaN(novoIntervalo) || novoIntervalo < 2 || novoIntervalo > 1440) {
        throw new Error('O intervalo de sincronização deve estar entre 2 e 1440 minutos (24 horas).');
      }
      this.intervaloMinutos = novoIntervalo;
    }

    if (params.modoSync && (params.modoSync === 'SISPORT_ONLY' || params.modoSync === 'FULL_SYNC')) {
      this.modoSync = params.modoSync;
    }

    console.log(`[SisportScheduler] ⚙️ Reconfigurado: Ativo=${this.ativo}, Intervalo=${this.intervaloMinutos}min, Modo=${this.modoSync}`);

    if (this.ativo) {
      // Reprograma imediatamente para o novo intervalo
      const novoDelayMs = this.intervaloMinutos * 60 * 1000;
      this.programarProximaExecucao(novoDelayMs);
    } else {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.proximaExecucaoTimestamp = null;
      this.ultimoStatus = 'PAUSADO';
      await this.atualizarEstadoBanco();
    }

    return this.obterStatus();
  }

  /**
   * Retorna o snapshot completo de status do worker para o CCO e a API
   */
  public obterStatus(): SisportConfigState {
    const agora = Date.now();
    let tempoRestanteSegundos = 0;

    if (this.ativo && this.proximaExecucaoTimestamp && this.proximaExecucaoTimestamp > agora) {
      tempoRestanteSegundos = Math.max(0, Math.round((this.proximaExecucaoTimestamp - agora) / 1000));
    }

    return {
      ativo: this.ativo,
      intervaloMinutos: this.intervaloMinutos,
      modoSync: this.modoSync,
      emExecucao: this.isSyncing,
      ultimaExecucao: this.ultimaExecucao,
      proximaExecucao: this.proximaExecucaoTimestamp ? new Date(this.proximaExecucaoTimestamp).toISOString() : null,
      tempoRestanteSegundos,
      ultimoStatus: this.ultimoStatus,
      ultimoErro: this.ultimoErro,
      totalEscalasUltimoSync: this.totalEscalasUltimoSync
    };
  }
}

// Exporta instância singleton
export const sisportSchedulerService = new SisportSchedulerService();
