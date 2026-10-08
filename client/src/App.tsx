import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { Header } from './components/Header';
import { GanttChart } from './components/GanttChart';
import { CanalMap } from './components/CanalMap';
import { AdminQueue } from './components/AdminQueue';
import { NavioModal } from './components/NavioModal';
import { GanttShipDetailsModal } from './components/GanttShipDetailsModal';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import {
  fetchLineup,
  createNavio,
  updateNavio,
  deleteNavio,
  reordenarFila,
  fetchClima,
  syncSisport,
  syncAllCdss,
  fetchMares,
  fetchCurrentTide
} from './services/api';
import type { NavioLineup, ResumoOperacional, ClimaResumo, StatusCor, MaresResponse, TelemetriaMareCurrent } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'gantt' | 'map' | 'admin'>('gantt');
  const [scaleDays, setScaleDays] = useState<7 | 14 | 28>(7);
  const [navios, setNavios] = useState<NavioLineup[]>([]);
  const [operacional, setOperacional] = useState<ResumoOperacional | null>(null);
  const [clima, setClima] = useState<ClimaResumo | null>(null);
  const [mares, setMares] = useState<MaresResponse | null>(null);
  const [telemetriaMare, setTelemetriaMare] = useState<TelemetriaMareCurrent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncingSisport, setIsSyncingSisport] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncProgressMessage, setSyncProgressMessage] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Modais
  const [isNavioModalOpen, setIsNavioModalOpen] = useState(false);
  const [navioParaEditar, setNavioParaEditar] = useState<NavioLineup | null>(null);
  const [navioDetalhesGantt, setNavioDetalhesGantt] = useState<NavioLineup | null>(null);
  const [navioParaExcluir, setNavioParaExcluir] = useState<NavioLineup | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Carrega dados iniciais do backend (Lineup, Clima, Marés DHN e Telemetria SP Pilots)
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      const [lineupData, climaData, maresData, tideData] = await Promise.all([
        fetchLineup(),
        fetchClima().catch(() => null),
        fetchMares(scaleDays).catch(() => null),
        fetchCurrentTide().catch(() => null)
      ]);
      setNavios(lineupData.navios);
      setOperacional(lineupData.operacional);
      if (climaData) setClima(climaData);
      if (maresData) setMares(maresData);
      if (tideData) setTelemetriaMare(tideData);
    } catch (err) {
      console.error('Erro ao carregar lineup:', err);
      setErrorBanner('Falha ao conectar com o backend SISPORT. Verifique se o servidor Express está ativo.');
    } finally {
      setIsLoading(false);
    }
  }, [scaleDays]);

  useEffect(() => {
    loadData();
    // Polling contínuo de maré a cada 60 segundos para manter a telemetria ao vivo
    const tideInterval = setInterval(() => {
      fetchCurrentTide()
        .then(t => { if (t) setTelemetriaMare(t); })
        .catch(() => {});
    }, 60000);
    return () => clearInterval(tideInterval);
  }, [loadData]);

  // Reordenação de fila com botões [▲ / ▼]
  const handleReorder = async (ids: number[]) => {
    setIsProcessing(true);
    try {
      const result = await reordenarFila(ids);
      setNavios(result.navios);
      setOperacional(result.operacional);
    } catch (err) {
      setErrorBanner(`Erro ao reordenar fila: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Switch de Livre Prática (alterna entre Vermelho e Cinza)
  const handleToggleLivrePratica = async (navio: NavioLineup) => {
    setIsProcessing(true);
    try {
      const novoStatusLivrePratica = navio.livre_pratica_ok === 1 ? 0 : 1;
      const novoStatusCor: StatusCor =
        novoStatusLivrePratica === 1
          ? (navio.status_cor === 'VERMELHO' ? 'CINZA' : navio.status_cor)
          : (navio.status_cor === 'CINZA' ? 'VERMELHO' : navio.status_cor);

      const result = await updateNavio(navio.id, {
        livre_pratica_ok: novoStatusLivrePratica,
        status_cor: novoStatusCor
      });
      setNavios(result.navios);
      setOperacional(result.operacional);
    } catch (err) {
      setErrorBanner(`Erro ao alterar livre prática: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Alteração de Status
  const handleChangeStatus = async (navio: NavioLineup, novoStatus: StatusCor) => {
    setIsProcessing(true);
    try {
      const result = await updateNavio(navio.id, {
        status_cor: novoStatus,
        livre_pratica_ok: novoStatus === 'CINZA' ? 1 : navio.livre_pratica_ok
      });
      setNavios(result.navios);
      setOperacional(result.operacional);
    } catch (err) {
      setErrorBanner(`Erro ao alterar status: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Salvar ou Criar Navio
  const handleSaveNavio = async (navioData: Partial<NavioLineup>) => {
    if (navioParaEditar) {
      const result = await updateNavio(navioParaEditar.id, navioData);
      setNavios(result.navios);
      setOperacional(result.operacional);
    } else {
      const result = await createNavio(navioData);
      setNavios(result.navios);
      setOperacional(result.operacional);
    }
  };

  // Solicitar exclusão (abre modal de confirmação no CCO)
  const handleRequestDelete = (navio: NavioLineup) => {
    setNavioParaExcluir(navio);
  };

  // Confirmar exclusão definitiva
  const handleConfirmDelete = async () => {
    if (!navioParaExcluir) return;
    setIsDeleting(true);
    setErrorBanner(null);
    try {
      const nome = navioParaExcluir.nome_navio;
      const result = await deleteNavio(navioParaExcluir.id);
      setNavios(result.navios);
      setOperacional(result.operacional);
      setNavioParaExcluir(null);
      setSuccessBanner(`Embarcação "${nome}" removida com sucesso do line-up.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setErrorBanner(`Erro ao excluir navio: ${(err as Error).message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditNavio = (navio: NavioLineup) => {
    setNavioParaEditar(navio);
    setIsNavioModalOpen(true);
  };

  const handleOpenNewModal = () => {
    setNavioParaEditar(null);
    setIsNavioModalOpen(true);
  };

  // Sincronização oficial apenas com o portal SISPORT
  const handleSyncSisport = async () => {
    setIsSyncingSisport(true);
    setIsProcessing(true);
    setErrorBanner(null);
    try {
      const result = await syncSisport();
      setNavios(result.navios);
      setOperacional(result.operacional);
      setSuccessBanner(`Sincronização com o SISPORT concluída! ${result.total} escalas atualizadas.`);
      setTimeout(() => setSuccessBanner(null), 4000);
    } catch (err) {
      setErrorBanner(`Falha ao sincronizar com SISPORT oficial: ${(err as Error).message}`);
    } finally {
      setIsSyncingSisport(false);
      setIsProcessing(false);
    }
  };

  // Sincronização completa da frota (SISPORT + Catálogo Oficial + DataDocked)
  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    setIsProcessing(true);
    setErrorBanner(null);
    setSyncProgressMessage('Processando: [1/2] SISPORT + Catálogo Navios ➔ [2/2] DataDocked AIS...');
    try {
      const result = await syncAllCdss();
      setNavios(result.navios);
      setOperacional(result.operacional);
      const { stats } = result;
      setSuccessBanner(
        `Sincronização completa realizada com sucesso! ${stats.totalSisport} escalas SISPORT, ${stats.catalogoIdentificados ?? 18} IMOs identificados no Catálogo Oficial e ${stats.dataDockedAtualizados} telemetrias AIS atualizadas no DataDocked em ${(stats.tempoDecorridoMs / 1000).toFixed(1)}s.`
      );
      setTimeout(() => setSuccessBanner(null), 6000);
    } catch (err) {
      setErrorBanner(`Falha na sincronização completa: ${(err as Error).message}`);
    } finally {
      setIsSyncingAll(false);
      setIsProcessing(false);
      setSyncProgressMessage(null);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-cco-darkest text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors">
      {/* Cabeçalho CCO */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        clima={clima}
        mares={mares}
        telemetriaMare={telemetriaMare}
        onOpenNewNavioModal={handleOpenNewModal}
        onSyncSisport={handleSyncSisport}
        onSyncAll={handleSyncAll}
        onRefresh={loadData}
        isLoading={isLoading || isProcessing}
        isSyncingSisport={isSyncingSisport}
        isSyncingAll={isSyncingAll}
        scaleDays={scaleDays}
        onScaleChange={setScaleDays}
      />

      {/* Banner de Progresso para Sincronização Completa */}
      {isSyncingAll && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 text-blue-900 border-b border-blue-200 dark:from-cyan-950 dark:via-slate-900 dark:to-emerald-950 dark:text-cyan-200 dark:border-cyan-500/40 px-4 py-2.5 text-xs flex items-center justify-between shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-3">
            <RefreshCw className="w-4 h-4 text-blue-600 dark:text-cyan-400 animate-spin" />
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>Sincronizando Frota Completa</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-blue-100 text-blue-800 border border-blue-200 dark:bg-cyan-500/20 dark:text-cyan-300 rounded dark:border-cyan-500/30">
                  Pipeline 3 em 1
                </span>
              </span>
              <span className="text-slate-600 dark:text-slate-300 text-[11px]">
                {syncProgressMessage || 'Consultando SISPORT, identificando IMOs no catálogo oficial e obtendo posições AIS no DataDocked...'}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-[11px] font-mono text-blue-700 dark:text-cyan-400 bg-white/80 dark:bg-black/40 px-2.5 py-1 rounded border border-blue-200 dark:border-cyan-500/20">
            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-cyan-400 animate-ping" />
            <span>Processando...</span>
          </div>
        </div>
      )}

      {/* Banner de Erro/Alerta caso ocorra */}
      {errorBanner && (
        <div className="bg-rose-100 text-rose-900 dark:bg-rose-900/90 dark:text-rose-200 px-4 py-2 text-xs flex items-center justify-between border-b border-rose-300 dark:border-rose-700">
          <span>{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="font-bold underline text-rose-950 hover:text-rose-800 dark:text-white dark:hover:text-rose-100 ml-4 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Banner de Sucesso */}
      {successBanner && (
        <div className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/90 dark:text-emerald-200 px-4 py-2 text-xs flex items-center justify-between border-b border-emerald-300 dark:border-emerald-700 animate-in fade-in">
          <span className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
            <span>{successBanner}</span>
          </span>
          <button
            onClick={() => setSuccessBanner(null)}
            className="font-bold underline text-emerald-950 hover:text-emerald-800 dark:text-white dark:hover:text-emerald-100 ml-4 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Área Central: Renderiza a Tela Ativa */}
      <main className="flex-1 flex flex-col overflow-hidden relative z-0">
        {activeTab === 'gantt' && (
          <GanttChart
            navios={navios}
            operacional={operacional}
            mares={mares}
            onSelectNavio={(navio) => {
              setNavioDetalhesGantt(navio);
            }}
            scaleDays={scaleDays}
            onScaleChange={setScaleDays}
          />
        )}

        {activeTab === 'map' && (
          <CanalMap
            navios={navios}
            onSelectNavio={(navio) => {
              handleEditNavio(navio);
            }}
          />
        )}

        {activeTab === 'admin' && (
          <AdminQueue
            navios={navios}
            onReorder={handleReorder}
            onToggleLivrePratica={handleToggleLivrePratica}
            onChangeStatus={handleChangeStatus}
            onEditNavio={handleEditNavio}
            onDeleteNavio={handleRequestDelete}
            onOpenNewNavioModal={handleOpenNewModal}
            isProcessing={isProcessing}
          />
        )}
      </main>

      {/* Modal Simplificado para o Gantt Line-Up */}
      {navioDetalhesGantt && (
        <GanttShipDetailsModal
          key={navioDetalhesGantt.id}
          navio={navioDetalhesGantt}
          mares={mares}
          onClose={() => setNavioDetalhesGantt(null)}
          onOpenFullEdit={(navio) => {
            handleEditNavio(navio);
          }}
          onVesselUpdated={(updated, allNavios, operacionalResumo) => {
            if (allNavios && allNavios.length > 0) {
              setNavios(allNavios);
              if (operacionalResumo) setOperacional(operacionalResumo);
            } else {
              setNavios((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
            }
            setNavioDetalhesGantt(updated);
          }}
        />
      )}

      {/* Modal Completo de Edição Administrativa (Gestão & Fila) */}
      <NavioModal
        isOpen={isNavioModalOpen}
        navioParaEditar={navioParaEditar}
        onClose={() => setIsNavioModalOpen(false)}
        onSave={handleSaveNavio}
      />

      <ConfirmDeleteModal
        isOpen={!!navioParaExcluir}
        navio={navioParaExcluir}
        isDeleting={isDeleting}
        onClose={() => setNavioParaExcluir(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
};

export default App;
