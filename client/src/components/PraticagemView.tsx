import React, { useState, useEffect, useMemo } from 'react';
import {
  Ship,
  RefreshCw,
  Search,
  ExternalLink,
  Anchor,
  Clock,
  Compass,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Radio
} from 'lucide-react';
import { fetchPraticagemPauta, syncPraticagem } from '../services/api';
import type {
  PraticagemPautaResponse,
  PraticagemManobra,
  CategoriaManobra
} from '../types';


interface PraticagemViewProps {
  onSelectNavioLineup?: (imo: string) => void;
}

export const PraticagemView: React.FC<PraticagemViewProps> = ({ onSelectNavioLineup }) => {
  const [data, setData] = useState<PraticagemPautaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroCategoria, setFiltroCategoria] = useState<string>('ALL');
  const [busca, setBusca] = useState('');
  const [navioDetalhesModal, setNavioDetalhesModal] = useState<PraticagemManobra | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const carregarDados = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setError(null);
    try {
      const pauta = await fetchPraticagemPauta();
      setData(pauta);
    } catch (err) {
      console.error('Erro ao carregar pauta de praticagem:', err);
      setError((err as Error).message || 'Falha ao obter dados da Praticagem.');
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
    // Atualização automática a cada 2 minutos enquanto a aba estiver aberta
    const interval = setInterval(() => carregarDados(false), 120000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const result = await syncPraticagem();
      if (result.data) {
        setData(result.data);
      } else {
        await carregarDados(false);
      }
    } catch (err) {
      console.error('Erro ao sincronizar com Praticagem:', err);
      setError((err as Error).message || 'Erro ao sincronizar com SP Pilots.');
    } finally {
      setIsSyncing(false);
    }
  };

  const toggleSection = (catKey: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [catKey]: !prev[catKey]
    }));
  };

  // Coleta todas as manobras planas para filtros e contagens
  const todasManobras = useMemo(() => {
    if (!data) return [];
    const { manobras } = data;
    return [
      ...manobras.emAndamento,
      ...manobras.confirmadas,
      ...manobras.confirmadasAgente,
      ...manobras.solicitadas,
      ...manobras.encerradas
    ];
  }, [data]);

  // Filtro de texto e categoria
  const matchFiltro = (m: PraticagemManobra) => {
    if (filtroCategoria !== 'ALL' && m.categoria !== filtroCategoria) {
      return false;
    }
    if (!busca.trim()) return true;
    const q = busca.toLowerCase().trim();
    return (
      m.nomeNavio.toLowerCase().includes(q) ||
      (m.agente && m.agente.toLowerCase().includes(q)) ||
      (m.localOrigem && m.localOrigem.toLowerCase().includes(q)) ||
      (m.localDestino && m.localDestino.toLowerCase().includes(q)) ||
      (m.imo && m.imo.includes(q)) ||
      (m.tipoManobra && m.tipoManobra.toLowerCase().includes(q))
    );
  };

  // Seções organizadas da pauta
  const secoesPauta: Array<{
    key: CategoriaManobra;
    titulo: string;
    subtitulo: string;
    badgeCor: string;
    corHeader: string;
    badgeTexto: string;
    itens: PraticagemManobra[];
  }> = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: 'EM_ANDAMENTO',
        titulo: 'MANOBRAS EM ANDAMENTO',
        subtitulo: 'Manobras em execução no canal',
        badgeCor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30',
        corHeader: 'from-purple-900/20 via-purple-800/10 to-transparent border-purple-500/30',
        badgeTexto: 'Aguardando Encerramento da Manobra',
        itens: data.manobras.emAndamento.filter(matchFiltro)
      },
      {
        key: 'CONFIRMADAS',
        titulo: 'MANOBRAS CONFIRMADAS',
        subtitulo: 'Aprovadas e programadas pela Praticagem',
        badgeCor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30',
        corHeader: 'from-indigo-900/20 via-indigo-800/10 to-transparent border-indigo-500/30',
        badgeTexto: 'Aguardando Início da Manobra',
        itens: data.manobras.confirmadas.filter(matchFiltro)
      },
      {
        key: 'CONFIRMADAS_AGENTE',
        titulo: 'MANOBRAS CONFIRMADAS PELO AGENTE',
        subtitulo: 'Confirmadas pela agência marítima',
        badgeCor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30',
        corHeader: 'from-amber-900/20 via-amber-800/10 to-transparent border-amber-500/30',
        badgeTexto: 'Aguardando Confirmação da Praticagem',
        itens: data.manobras.confirmadasAgente.filter(matchFiltro)
      },
      {
        key: 'SOLICITADAS',
        titulo: 'MANOBRAS SOLICITADAS',
        subtitulo: 'Solicitações de manobra em fila',
        badgeCor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30',
        corHeader: 'from-blue-900/20 via-blue-800/10 to-transparent border-blue-500/30',
        badgeTexto: 'Aguardando Programação',
        itens: data.manobras.solicitadas.filter(matchFiltro)
      },
      {
        key: 'ENCERRADAS',
        titulo: 'MANOBRAS ENCERRADAS',
        subtitulo: 'Manobras finalizadas hoje',
        badgeCor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-500/30',
        corHeader: 'from-rose-900/20 via-rose-800/10 to-transparent border-rose-500/30',
        badgeTexto: 'Concluídas com Sucesso',
        itens: data.manobras.encerradas.filter(matchFiltro)
      }
    ];
  }, [data, filtroCategoria, busca]);

  const renderBadgeManobra = (tipo: string) => {
    switch (tipo.toUpperCase()) {
      case 'E':
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/40"
            title="Entrada no Berço / Canal"
          >
            Entrada (E)
          </span>
        );
      case 'S':
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-500/40"
            title="Saída / Desatracação"
          >
            Saída (S)
          </span>
        );
      case 'M':
        return (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-500/40"
            title="Mudança de Berço"
          >
            Mudança (M)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300">
            {tipo}
          </span>
        );
    }
  };

  const formatarDataHoraRelativa = (_isoStr?: string, strOriginal?: string) => {
    if (!strOriginal) return '-';
    return strOriginal;
  };


  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-cco-darkest text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      {/* 1. Header da Aba Praticagem */}
      <div className="bg-white/80 dark:bg-cco-panel/80 backdrop-blur-md border-b border-slate-200 dark:border-cco-border px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm shrink-0">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-blue-400/30">
            <Ship className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                Praticagem de São Sebastião
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-50 dark:bg-cyan-950 text-blue-700 dark:text-cyan-400 border border-blue-200 dark:border-cyan-500/30 font-semibold">
                SP Pilots
              </span>
              <a
                href="https://ssb.sppilots.com.br/sources/manobra/pautaservico.asp"
                target="_blank"
                rel="noreferrer"
                title="Acessar portal oficial da Praticagem de São Sebastião"
                className="text-slate-400 hover:text-blue-600 dark:hover:text-cyan-400 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Pauta de serviços em tempo real, manobras no canal e telemetria dos berços de atracação.
            </p>
          </div>
        </div>

        {/* Controles: Busca, Filtro e Botão de Sincronismo */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Campo de Busca Rápida */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar navio, agente, berço..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-100 dark:bg-cco-darkest border border-slate-200 dark:border-cco-border text-slate-900 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-cyan-500 w-48 sm:w-60 transition-all"
            />
            {busca && (
              <button
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Status de Sincronização */}
          {data?.syncStatus && (
            <div
              className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-cco-darkest border border-slate-200 dark:border-cco-border text-[11px] font-mono text-slate-600 dark:text-slate-300"
              title={`Status: ${data.syncStatus.status}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  data.syncStatus.status === 'SUCESSO'
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500'
                }`}
              />
              <span>
                {data.syncStatus.ultimaSincronizacao
                  ? new Date(data.syncStatus.ultimaSincronizacao).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  : 'Pendente'}
              </span>
            </div>
          )}

          {/* Botão de Sincronismo Manual */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing || isLoading}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 dark:shadow-cyan-600/20 transition-all disabled:opacity-50 cursor-pointer"
            title="Forçar leitura e raspagem da Pauta na Praticagem"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* 2. Banner de Alerta / Erro */}
      {error && (
        <div className="bg-rose-50 text-rose-900 dark:bg-rose-950/80 dark:text-rose-200 px-6 py-2 text-xs flex items-center justify-between border-b border-rose-200 dark:border-rose-800">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs font-bold underline hover:opacity-80 cursor-pointer"
          >
            Fechar
          </button>
        </div>
      )}

      {/* 3. Indicadores Rápidos / Métricas Operacionais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-3 shrink-0">
        <div className="bg-white dark:bg-cco-panel p-3 rounded-xl border border-slate-200 dark:border-cco-border shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Em Andamento</span>
            <Radio className="w-3.5 h-3.5 text-purple-500 animate-pulse" />
          </div>
          <div className="text-xl font-bold text-purple-700 dark:text-purple-300 mt-1">
            {data?.manobras.emAndamento.length ?? 0}
          </div>
        </div>

        <div className="bg-white dark:bg-cco-panel p-3 rounded-xl border border-slate-200 dark:border-cco-border shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Confirmadas</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">
            {(data?.manobras.confirmadas.length ?? 0) + (data?.manobras.confirmadasAgente.length ?? 0)}
          </div>
        </div>

        <div className="bg-white dark:bg-cco-panel p-3 rounded-xl border border-slate-200 dark:border-cco-border shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Solicitadas</span>
            <Clock className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-blue-700 dark:text-blue-300 mt-1">
            {data?.manobras.solicitadas.length ?? 0}
          </div>
        </div>

        <div className="bg-white dark:bg-cco-panel p-3 rounded-xl border border-slate-200 dark:border-cco-border shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Atracados</span>
            <Anchor className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
            {data?.resumoPorto.atracados.length ?? 0}
          </div>
        </div>

        <div className="bg-white dark:bg-cco-panel p-3 rounded-xl border border-slate-200 dark:border-cco-border shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Fundeados</span>
            <Compass className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-700 dark:text-amber-300 mt-1">
            {data?.resumoPorto.fundeados.length ?? 0}
          </div>
        </div>

        <div className="bg-white dark:bg-cco-panel p-3 rounded-xl border border-slate-200 dark:border-cco-border shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>Aguardados</span>
            <TrendingUp className="w-3.5 h-3.5 text-cyan-500" />
          </div>
          <div className="text-xl font-bold text-cyan-700 dark:text-cyan-300 mt-1">
            {data?.resumoPorto.aguardados.length ?? 0}
          </div>
        </div>
      </div>

      {/* 4. Corpo Principal com Grid (75% Tabelas da Pauta / 25% Resumo do Porto) */}
      <div className="flex-1 flex flex-col lg:flex-row gap-5 px-6 pb-6 overflow-hidden">
        {/* Painel Esquerdo: Tabelas de Manobras */}
        <div className="flex-1 flex flex-col bg-white dark:bg-cco-panel rounded-2xl border border-slate-200 dark:border-cco-border shadow-sm overflow-hidden">
          {/* Seletor de Categorias / Filtro Tabs */}
          <div className="px-5 py-3 border-b border-slate-200 dark:border-cco-border bg-slate-50/50 dark:bg-cco-darkest/50 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
              {[
                { id: 'ALL', label: 'Todas as Manobras', count: todasManobras.length },
                { id: 'EM_ANDAMENTO', label: 'Em Andamento', count: data?.manobras.emAndamento.length ?? 0 },
                { id: 'CONFIRMADAS', label: 'Confirmadas', count: data?.manobras.confirmadas.length ?? 0 },
                { id: 'CONFIRMADAS_AGENTE', label: 'Pelo Agente', count: data?.manobras.confirmadasAgente.length ?? 0 },
                { id: 'SOLICITADAS', label: 'Solicitadas', count: data?.manobras.solicitadas.length ?? 0 },
                { id: 'ENCERRADAS', label: 'Encerradas', count: data?.manobras.encerradas.length ?? 0 }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFiltroCategoria(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center space-x-1.5 ${
                    filtroCategoria === tab.id
                      ? 'bg-blue-600 dark:bg-cyan-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-cco-panel'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      filtroCategoria === tab.id
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-cco-darkest text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Mostrando {secoesPauta.reduce((acc, s) => acc + s.itens.length, 0)} de {todasManobras.length} manobras
            </div>
          </div>

          {/* Área de rolagem das tabelas */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-cco-border">
            {isLoading && !data ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500 dark:text-cyan-400 mb-2" />
                <span className="text-xs font-medium">Carregando pauta de serviços da Praticagem...</span>
              </div>
            ) : secoesPauta.filter((s) => s.itens.length > 0).length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400">
                <Ship className="w-10 h-10 stroke-1 mb-2 opacity-50" />
                <span className="text-xs font-medium">Nenhuma manobra encontrada para os filtros atuais.</span>
              </div>
            ) : (
              secoesPauta
                .filter((secao) => (filtroCategoria === 'ALL' ? secao.itens.length > 0 : secao.key === filtroCategoria))
                .map((secao) => {
                  const isCollapsed = collapsedSections[secao.key];
                  return (
                    <div key={secao.key} className="p-4 flex flex-col gap-3">
                      {/* Cabeçalho da Seção */}
                      <div
                        onClick={() => toggleSection(secao.key)}
                        className={`flex items-center justify-between p-3 rounded-xl bg-gradient-to-r ${secao.corHeader} border cursor-pointer hover:opacity-95 transition-all select-none`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <button className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                          </button>
                          <div>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                              {secao.titulo}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-2 font-normal hidden sm:inline">
                              ({secao.itens.length} {secao.itens.length === 1 ? 'manobra' : 'manobras'})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${secao.badgeCor}`}>
                            {secao.badgeTexto}
                          </span>
                        </div>
                      </div>

                      {/* Tabela de Manobras */}
                      {!isCollapsed && (
                        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-cco-border">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-100/80 dark:bg-cco-darkest/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-cco-border">
                                <th className="py-2.5 px-3 w-10 text-center">Info</th>
                                <th className="py-2.5 px-3">Navio</th>
                                <th className="py-2.5 px-3 w-24">Manobra</th>
                                <th className="py-2.5 px-3 w-20">Origem</th>
                                <th className="py-2.5 px-3 w-20">Destino</th>
                                <th className="py-2.5 px-3 w-28">Horário</th>
                                <th className="py-2.5 px-3">Agente</th>
                                <th className="py-2.5 px-3 w-16 text-right">Calado</th>
                                <th className="py-2.5 px-3 w-14 text-center">Brd</th>
                                <th className="py-2.5 px-3 w-14 text-center">Reb</th>
                                <th className="py-2.5 px-3">Status / Indicador</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-cco-border/60">
                              {secao.itens.map((manobra, idx) => {
                                const isCdss = !!manobra.vinculoLineupImo;
                                return (
                                  <tr
                                    key={manobra.id || idx}
                                    className={`transition-colors hover:bg-slate-50 dark:hover:bg-cco-hover/40 ${
                                      isCdss
                                        ? 'bg-blue-50/40 dark:bg-cyan-950/20 font-medium'
                                        : idx % 2 === 0
                                        ? 'bg-white dark:bg-cco-panel'
                                        : 'bg-slate-50/30 dark:bg-cco-panel/40'
                                    }`}
                                  >
                                    {/* Botão de Detalhes / Ações */}
                                    <td className="py-2.5 px-3 text-center">
                                      <button
                                        onClick={() => setNavioDetalhesModal(manobra)}
                                        title="Ver características da embarcação"
                                        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                                      >
                                        <Info className="w-3.5 h-3.5" />
                                      </button>
                                    </td>

                                    {/* Nome do Navio */}
                                    <td className="py-2.5 px-3">
                                      <div className="flex items-center space-x-1.5">
                                        <span className="font-bold text-slate-900 dark:text-white">
                                          {manobra.nomeNavio}
                                        </span>
                                        {isCdss && (
                                          <span
                                            onClick={() => {
                                              if (onSelectNavioLineup && manobra.vinculoLineupImo) {
                                                onSelectNavioLineup(manobra.vinculoLineupImo);
                                              }
                                            }}
                                            title="Embarcação presente no Line-up Oficial CDSS"
                                            className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 cursor-pointer shadow-2xs hover:scale-105 transition-transform"
                                          >
                                            <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                                            <span>CDSS</span>
                                          </span>
                                        )}
                                      </div>
                                      {manobra.imo && (
                                        <div className="text-[10px] text-slate-400 font-mono">
                                          IMO: {manobra.imo}
                                        </div>
                                      )}
                                    </td>

                                    {/* Manobra (E / S / M) */}
                                    <td className="py-2.5 px-3">{renderBadgeManobra(manobra.tipoManobra)}</td>

                                    {/* Origem (LOC#1) */}
                                    <td className="py-2.5 px-3">
                                      <span
                                        className={`font-semibold px-1.5 py-0.5 rounded text-[11px] ${
                                          manobra.localOrigem === 'CAIS'
                                            ? 'bg-blue-100 text-blue-800 dark:bg-cyan-950 dark:text-cyan-300 border border-blue-200 dark:border-cyan-500/30'
                                            : 'text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        {manobra.localOrigem || '-'}
                                      </span>
                                    </td>

                                    {/* Destino (LOC#2) */}
                                    <td className="py-2.5 px-3">
                                      <span
                                        className={`font-semibold px-1.5 py-0.5 rounded text-[11px] ${
                                          manobra.localDestino === 'CAIS'
                                            ? 'bg-blue-100 text-blue-800 dark:bg-cyan-950 dark:text-cyan-300 border border-blue-200 dark:border-cyan-500/30'
                                            : 'text-slate-700 dark:text-slate-300'
                                        }`}
                                      >
                                        {manobra.localDestino || '-'}
                                      </span>
                                    </td>

                                    {/* Horário */}
                                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-800 dark:text-slate-200">
                                      {formatarDataHoraRelativa(manobra.horarioIso, manobra.horarioStr)}
                                    </td>

                                    {/* Agente */}
                                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                                      {manobra.agente || '-'}
                                    </td>

                                    {/* Calado */}
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                      {manobra.calado ? `${manobra.calado.toFixed(2)}m` : '-'}
                                    </td>

                                    {/* Bordo */}
                                    <td className="py-2.5 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                                      {manobra.bordo || '-'}
                                    </td>

                                    {/* Rebocador */}
                                    <td className="py-2.5 px-3 text-center text-slate-700 dark:text-slate-300">
                                      {manobra.rebocador || '-'}
                                    </td>

                                    {/* Indicadores / Status */}
                                    <td className="py-2.5 px-3">
                                      {manobra.indicadores && manobra.indicadores.length > 0 ? (
                                        <div className="flex flex-col gap-0.5">
                                          {manobra.indicadores.map((ind, iIdx) => (
                                            <span
                                              key={iIdx}
                                              className="inline-flex items-center space-x-1 text-[10px] text-slate-600 dark:text-slate-400"
                                            >
                                              <span
                                                className={`w-1.5 h-1.5 rounded-full ${
                                                  ind.includes('OK') || ind.includes('POSIÇÃO')
                                                    ? 'bg-blue-500'
                                                    : 'bg-amber-500'
                                                }`}
                                              />
                                              <span className="truncate max-w-[180px]" title={ind}>
                                                {ind}
                                              </span>
                                            </span>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 text-[11px]">-</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Painel Direito: Resumo do Porto (Atracados, Fundeados, Aguardados) */}
        <div className="w-full lg:w-80 flex flex-col gap-4 shrink-0 overflow-y-auto">
          {/* Card: Navios Atracados */}
          <div className="bg-white dark:bg-cco-panel rounded-2xl border border-slate-200 dark:border-cco-border p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-cco-border">
              <div className="flex items-center space-x-2">
                <Anchor className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                  Atracados no Porto
                </h2>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                {data?.resumoPorto.atracados.length ?? 0}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-cco-border/50 mt-2">
              {data?.resumoPorto.atracados.map((item, idx) => {
                const isCais = item.berco === 'CAIS';
                return (
                  <div
                    key={idx}
                    className={`py-2 px-2 rounded-lg flex items-center justify-between transition-colors ${
                      isCais
                        ? 'bg-blue-50/60 dark:bg-cyan-950/30 border border-blue-200 dark:border-cyan-500/30'
                        : 'hover:bg-slate-50 dark:hover:bg-cco-hover/40'
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          isCais
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {item.berco}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {item.navio}
                      </span>
                    </div>

                    {isCais && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                        CDSS
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card: Navios Fundeados */}
          <div className="bg-white dark:bg-cco-panel rounded-2xl border border-slate-200 dark:border-cco-border p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-cco-border">
              <div className="flex items-center space-x-2">
                <Compass className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                  Fundeados na Barra
                </h2>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                {data?.resumoPorto.fundeados.length ?? 0}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-cco-border/50 mt-2">
              {data?.resumoPorto.fundeados.map((item, idx) => (
                <div
                  key={idx}
                  className="py-1.5 px-2 rounded-lg flex items-center justify-between text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-cco-hover/40 transition-colors"
                >
                  <span className="font-medium truncate">{item.navio}</span>
                  {item.vinculoLineupImo && (
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      CDSS
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card: Navios Aguardados */}
          <div className="bg-white dark:bg-cco-panel rounded-2xl border border-slate-200 dark:border-cco-border p-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-cco-border">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
                  Aguardados
                </h2>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30">
                {data?.resumoPorto.aguardados.length ?? 0}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-cco-border/50 mt-2">
              {data?.resumoPorto.aguardados.map((item, idx) => (
                <div
                  key={idx}
                  className="py-2 px-2 rounded-lg flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-cco-hover/40 transition-colors"
                >
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{item.navio}</span>
                  </div>
                  <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                    {item.dataHoraStr}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Modal de Características da Embarcação (HINTS da Praticagem) */}
      {navioDetalhesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Topo do Modal */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-white/10 backdrop-blur-md">
                  <Ship className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight">{navioDetalhesModal.nomeNavio}</h3>
                  <p className="text-xs text-blue-100">Características Técnicas & Detalhes da Praticagem</p>
                </div>
              </div>
              <button
                onClick={() => setNavioDetalhesModal(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Conteúdo do Modal */}
            <div className="p-6 flex flex-col gap-4 text-xs">
              {/* Resumo da Manobra Atual */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Manobra na Pauta
                  </span>
                  <div className="flex items-center space-x-2 mt-0.5">
                    {renderBadgeManobra(navioDetalhesModal.tipoManobra)}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {navioDetalhesModal.localOrigem} {navioDetalhesModal.localDestino ? `➔ ${navioDetalhesModal.localDestino}` : ''}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Horário</span>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {navioDetalhesModal.horarioStr}
                  </div>
                </div>
              </div>

              {/* Tabela de Dimensões e Especificações */}
              {navioDetalhesModal.detalhesNavio ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">IMO</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['IMO NUMBER'] || navioDetalhesModal.imo || '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Call Sign</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['CALL SIGN'] || '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Ano</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['ANO'] || '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">LOA (Comprimento)</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['LOA'] ? `${navioDetalhesModal.detalhesNavio['LOA']}m` : '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Boca (Largura)</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['BOCA'] ? `${navioDetalhesModal.detalhesNavio['BOCA']}m` : '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Pontal</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['PONTAL'] ? `${navioDetalhesModal.detalhesNavio['PONTAL']}m` : '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Porte Bruto (DWT)</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['DEAD WEIGHT'] ? `${navioDetalhesModal.detalhesNavio['DEAD WEIGHT']} t` : '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Arqueação Bruta</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {navioDetalhesModal.detalhesNavio['GROSS TONNAGE'] || '-'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold">Bandeira</span>
                    <span className="font-bold text-slate-900 dark:text-white truncate block">
                      {navioDetalhesModal.detalhesNavio['BANDEIRA'] || '-'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-center text-slate-400">
                  Características detalhadas não registradas para este navio na pauta atual.
                </div>
              )}

              {/* Informações de Agenciamento e Calado */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-bold">Agente</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{navioDetalhesModal.agente || '-'}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-bold">Calado</span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {navioDetalhesModal.calado ? `${navioDetalhesModal.calado.toFixed(2)}m` : '-'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-bold">Bordo</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{navioDetalhesModal.bordo || '-'}</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-bold">Rebocador</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{navioDetalhesModal.rebocador || '-'}</span>
                </div>
              </div>

              {/* Vínculo CDSS Line-up */}
              {navioDetalhesModal.vinculoLineupImo && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <span className="font-bold text-emerald-900 dark:text-emerald-200 text-xs block">
                        Navio Reconhecido no Line-up CDSS
                      </span>
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        IMO {navioDetalhesModal.vinculoLineupImo} vinculado ao berço de atracação de São Sebastião.
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé do Modal */}
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setNavioDetalhesModal(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PraticagemView;
