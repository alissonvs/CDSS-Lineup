import React, { useState, useEffect } from 'react';
import {
  Anchor,
  Clock,
  CloudRain,
  Sliders,
  BarChart3,
  Compass,
  RefreshCw,
  Globe,
  TrendingUp,
  TrendingDown,
  Waves,
  ChevronDown,
  Sparkles,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import type { ClimaResumo, MaresResponse, TelemetriaMareCurrent } from '../types';

interface HeaderProps {
  activeTab: 'gantt' | 'map' | 'admin';
  setActiveTab: (tab: 'gantt' | 'map' | 'admin') => void;
  clima: ClimaResumo | null;
  mares?: MaresResponse | null;
  telemetriaMare?: TelemetriaMareCurrent | null;
  onOpenNewNavioModal?: () => void;
  onSyncSisport: () => void;
  onSyncAll: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  isSyncingSisport?: boolean;
  isSyncingAll?: boolean;
  scaleDays?: 7 | 14 | 28;
  onScaleChange?: (scale: 7 | 14 | 28) => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  clima,
  mares,
  telemetriaMare,
  onOpenNewNavioModal: _onOpenNewNavioModal,
  onSyncSisport,
  onSyncAll,
  onRefresh,
  isLoading,
  isSyncingSisport = false,
  isSyncingAll = false,
  scaleDays = 7,
  onScaleChange
}) => {
  const { theme, setTheme } = useTheme();
  const [timeBRT, setTimeBRT] = useState('');
  const [timeUTC, setTimeUTC] = useState('');
  const [isSyncMenuOpen, setIsSyncMenuOpen] = useState(false);
  const syncMenuRef = React.useRef<HTMLDivElement>(null);

  // Fecha o menu de sincronismo ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (syncMenuRef.current && !syncMenuRef.current.contains(event.target as Node)) {
        setIsSyncMenuOpen(false);
      }
    };
    if (isSyncMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSyncMenuOpen]);

  // Consolidação telemétrica: prioriza sensores físicos da SP Pilots com fallback gracioso para a DHN
  const tideData = React.useMemo(() => {
    const sp = telemetriaMare || mares?.telemetriaSpPilots;
    if (sp) {
      return {
        alturaMetros: sp.alturaMetros,
        tendencia: sp.tendencia,
        proximaPreamar: sp.proximaPreamar,
        proximaBaixamar: sp.proximaBaixamar,
        fonte: sp.fonte,
        atualizadoEm: sp.atualizadoEm,
        subtitulo: sp.proximaPreamar ? `Pre ${sp.proximaPreamar}` : 'Canal SP'
      };
    }
    if (mares?.statusAtual) {
      return {
        alturaMetros: mares.statusAtual.altura_m,
        tendencia: (mares.statusAtual.tendencia === 'SUBINDO' ? 'Enchendo' : 'Vazando') as 'Enchendo' | 'Vazando',
        proximaPreamar: mares.statusAtual.proximoExtremo.tipo === 'PREAMAR' ? mares.statusAtual.proximoExtremo.label : undefined,
        proximaBaixamar: mares.statusAtual.proximoExtremo.tipo === 'BAIXA_MAR' ? mares.statusAtual.proximoExtremo.label : undefined,
        fonte: 'DHN_FALLBACK' as const,
        atualizadoEm: 'Astronômica',
        subtitulo: mares.statusAtual.proximoExtremo.label
      };
    }
    return null;
  }, [telemetriaMare, mares]);

  useEffect(() => {
    const updateTimes = () => {
      const now = new Date();
      setTimeBRT(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setTimeUTC(now.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' }) + ' UTC');
    };
    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="relative z-50 bg-white dark:bg-cco-panel border-b border-slate-200 dark:border-cco-border px-4 py-2.5 flex items-center justify-between shadow-sm dark:shadow-lg shrink-0 transition-colors">
      {/* Esquerda: Identidade CDSS */}
      <div className="flex items-center space-x-3">
        <div className="bg-gradient-to-tr from-cyan-600 to-blue-600 p-2 rounded-lg shadow-md flex items-center justify-center text-white">
          <Anchor className="w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center space-x-1.5">
            <h1 className="font-extrabold text-base tracking-wider text-slate-900 dark:text-white leading-tight">
              PCS Lineup
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Porto de São Sebastião
          </p>
        </div>
      </div>

      {/* Centro: Navegação das 3 Abas Principais */}
      <div className="flex items-center bg-slate-100 dark:bg-cco-darkest p-1 rounded-lg border border-slate-200 dark:border-cco-border">
        <button
          onClick={() => setActiveTab('gantt')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'gantt'
              ? 'bg-blue-600 dark:bg-cyan-600 text-white shadow-md shadow-blue-600/30 dark:shadow-cyan-600/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-cco-panel'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Gantt Line-Up</span>
        </button>

        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'map'
              ? 'bg-blue-600 dark:bg-cyan-600 text-white shadow-md shadow-blue-600/30 dark:shadow-cyan-600/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-cco-panel'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Canal & Mapa</span>
        </button>

        <button
          onClick={() => setActiveTab('admin')}
          className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'admin'
              ? 'bg-blue-600 dark:bg-cyan-600 text-white shadow-md shadow-blue-600/30 dark:shadow-cyan-600/30'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-cco-panel'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Gestão & Fila</span>
        </button>
      </div>

      {/* Direita: Relógio, Clima, Alternador de Tema e Ações Rápidas */}
      <div className="flex items-center space-x-2.5">
        {/* Widget de Maré em Tempo Real (Telemetria SP Pilots / DHN) */}
        {tideData && (
          <div
            title={`Nível da Maré em Tempo Real - Canal de São Sebastião (NR / Zero Hidrográfico)\n• Altura: ${tideData.alturaMetros.toFixed(2)}m\n• Tendência: ${tideData.tendencia}\n• Próxima Preamar: ${tideData.proximaPreamar || 'Sob monitoramento'}\n• Próxima Baixa-mar: ${tideData.proximaBaixamar || 'Sob monitoramento'}\n• Origem: ${tideData.fonte === 'SP_PILOTS' ? 'Sensores Físicos da Praticagem (SP Pilots)' : 'Modelo Astronômico Harmônico DHN'}\n• Atualizado: ${tideData.atualizadoEm}`}
            className="hidden xl:flex items-center space-x-2 bg-slate-50 dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border px-3 py-1.5 rounded-lg text-xs font-mono cursor-help hover:border-blue-400 dark:hover:border-cyan-500/40 transition-all shadow-sm"
          >
            <div className="flex items-center space-x-1">
              <span className="text-blue-600 dark:text-cyan-400 text-sm">🌊</span>
              {tideData.tendencia === 'Enchendo' ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 animate-pulse" />
              ) : tideData.tendencia === 'Vazando' ? (
                <TrendingDown className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
              ) : (
                <Waves className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400" />
              )}
            </div>

            <div className="flex flex-col text-right">
              <div
                className={`flex items-center justify-end gap-1.5 text-xs font-bold ${
                  tideData.tendencia === 'Enchendo'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : tideData.tendencia === 'Vazando'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-blue-600 dark:text-cyan-300'
                }`}
              >
                <span>{tideData.alturaMetros.toFixed(2)}m</span>
                <span>•</span>
                <span>
                  {tideData.tendencia === 'Enchendo'
                    ? '▲ Enchendo'
                    : tideData.tendencia === 'Vazando'
                    ? '▼ Vazando'
                    : '━ Estável'}
                </span>
              </div>
              <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono tracking-tight">
                {tideData.fonte === 'SP_PILOTS' ? 'Sensor Real • SP Pilots' : 'Modelo Harmônico • DHN'}
              </div>
            </div>
          </div>
        )}

        {/* Widget Climático de São Sebastião */}
        <div className="hidden lg:flex items-center space-x-2 bg-slate-50 dark:bg-cco-darkest/70 border border-slate-200 dark:border-cco-border px-3 py-1.5 rounded-lg text-xs font-mono">
          <CloudRain className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
          <div className="text-right leading-tight">
            <span className="text-slate-800 dark:text-slate-300 font-semibold">{clima?.temperaturaAprox ?? 24.5}&deg;C</span>
            <span className="text-slate-400 dark:text-slate-500 mx-1">&bull;</span>
            <span className={`${(clima?.horasChuvaProximas24h ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
              Chuva 24h: {clima?.horasChuvaProximas24h ?? 0}h
            </span>
          </div>
        </div>

        {/* Relógio Operacional */}
        <div className="hidden md:flex items-center space-x-2 bg-slate-50 dark:bg-cco-darkest/70 border border-slate-200 dark:border-cco-border px-3 py-1.5 rounded-lg text-xs font-mono">
          <Clock className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <div className="flex flex-col text-right leading-none">
            <span className="text-slate-800 dark:text-slate-200 font-bold">{timeBRT}</span>
            <span className="text-slate-500 text-[10px]">{timeUTC}</span>
          </div>
        </div>

        {/* Botão de Atualização Rápida */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          title="Recalcular Line-up e Clima"
          className="p-2 rounded-lg bg-slate-50 dark:bg-cco-darkest hover:bg-slate-100 dark:hover:bg-cco-hover border border-slate-200 dark:border-cco-border text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600 dark:text-cyan-400' : ''}`} />
        </button>

        {/* Alternador de Tema Dark / Light no Topo */}
        <div
          className="flex items-center bg-slate-100 dark:bg-cco-darkest p-0.5 rounded-lg border border-slate-200 dark:border-cco-border shadow-inner"
          role="group"
          aria-label="Alternar Tema Dark / Light"
        >
          <button
            type="button"
            onClick={() => setTheme('light')}
            title="Ativar Modo Claro (PCS Lineup Corporate Light)"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
              theme === 'light'
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-300/80 border border-slate-200'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Light</span>
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            title="Ativar Modo Escuro (CCO Night Operations)"
            className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
              theme === 'dark'
                ? 'bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-cco-panel'
            }`}
          >
            <Moon className="w-3.5 h-3.5 text-cyan-200" />
            <span className="hidden sm:inline">Dark</span>
          </button>
        </div>

        {/* Seletor de Escala Temporal Dinâmica (7D / 14D / 28D) para o Gantt */}
        {activeTab === 'gantt' && onScaleChange && (
          <div className="flex items-center bg-slate-100 dark:bg-cco-darkest p-0.5 rounded-lg border border-slate-200 dark:border-cco-border shadow-inner">
            <button
              type="button"
              onClick={() => onScaleChange(7)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                scaleDays === 7
                  ? 'bg-blue-600 dark:bg-cyan-600 text-white shadow-sm ring-1 ring-blue-500 dark:ring-cyan-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-cco-panel'
              }`}
              title="Visão Tática / Padrão Operacional do CCO (7 Dias)"
            >
              7 Dias
            </button>
            <button
              type="button"
              onClick={() => onScaleChange(14)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                scaleDays === 14
                  ? 'bg-blue-600 dark:bg-cyan-600 text-white shadow-sm ring-1 ring-blue-500 dark:ring-cyan-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-cco-panel'
              }`}
              title="Visão Quinzena (14 Dias)"
            >
              14 Dias
            </button>
            <button
              type="button"
              onClick={() => onScaleChange(28)}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                scaleDays === 28
                  ? 'bg-blue-600 dark:bg-cyan-600 text-white shadow-sm ring-1 ring-blue-500 dark:ring-cyan-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-cco-panel'
              }`}
              title="Visão Mensal Estratégica (28 Dias)"
            >
              28 Dias
            </button>
          </div>
        )}

        {/* Menu Dropdown de Sincronismo CDSS */}
        <div className="relative" ref={syncMenuRef}>
          <button
            type="button"
            onClick={() => setIsSyncMenuOpen((prev) => !prev)}
            disabled={isLoading || isSyncingSisport || isSyncingAll}
            title="Opções de Sincronização: SISPORT Oficial ou Sincronização Completa com AIS"
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-semibold shadow-md transition-all border ${
              isSyncingAll
                ? 'bg-emerald-700/80 border-emerald-500/40 shadow-emerald-700/20 animate-pulse'
                : isSyncingSisport
                ? 'bg-blue-700 dark:bg-cyan-700/80 border-blue-500/40 dark:border-cyan-500/40 shadow-blue-700/20 animate-pulse'
                : isSyncMenuOpen
                ? 'bg-blue-600 dark:bg-cyan-600 border-blue-400 dark:border-cyan-400 ring-2 ring-blue-400/30 dark:ring-cyan-400/30 shadow-blue-600/30'
                : 'bg-blue-600 hover:bg-blue-700 dark:bg-cyan-700/80 dark:hover:bg-cyan-600 border-blue-500/30 dark:border-cyan-500/30 shadow-blue-600/20 dark:shadow-cyan-700/20'
            } disabled:opacity-60 cursor-pointer`}
          >
            {isSyncingAll || isSyncingSisport ? (
              <RefreshCw className="w-3.5 h-3.5 text-cyan-200 animate-spin" />
            ) : (
              <Globe className="w-3.5 h-3.5 text-cyan-200" />
            )}
            <span className="hidden sm:inline">
              {isSyncingAll
                ? 'Sincronizando Tudo...'
                : isSyncingSisport
                ? 'Sincronizando SISPORT...'
                : 'Sincronizar CDSS'}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-cyan-200 transition-transform duration-200 ${
                isSyncMenuOpen ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>

          {/* Menu Popover Flutuante */}
          {isSyncMenuOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-cyan-500/40 rounded-xl shadow-2xl p-1.5 z-50 flex flex-col gap-1 ring-1 ring-slate-200/50 dark:ring-black/50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Modo de Sincronismo
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-50 dark:bg-cyan-950/80 text-blue-700 dark:text-cyan-400 border border-blue-200 dark:border-cyan-500/30">
                  Canal SS
                </span>
              </div>

              {/* Opção 1: Sincronizar SISPORT */}
              <button
                type="button"
                onClick={() => {
                  setIsSyncMenuOpen(false);
                  onSyncSisport();
                }}
                disabled={isLoading || isSyncingSisport || isSyncingAll}
                className="w-full text-left p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-cyan-950/70 border border-transparent hover:border-slate-200 dark:hover:border-cyan-500/30 transition-all flex items-start space-x-3 group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-cyan-900/40 border border-blue-200 dark:border-cyan-500/30 text-blue-600 dark:text-cyan-300 group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-cyan-600 transition-all shrink-0 mt-0.5">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-700 dark:group-hover:text-white">
                      Sincronizar SISPORT
                    </span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      Rápido
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-1">
                    Sincroniza os navios e programações oficiais em tempo real do portal{' '}
                    <strong className="text-blue-600 dark:text-cyan-300 font-medium">portoss.sp.gov.br</strong>.
                  </p>
                </div>
              </button>

              {/* Opção 2: Sincronizar Tudo */}
              <button
                type="button"
                onClick={() => {
                  setIsSyncMenuOpen(false);
                  onSyncAll();
                }}
                disabled={isLoading || isSyncingSisport || isSyncingAll}
                className="w-full text-left p-2.5 rounded-lg hover:bg-emerald-50/60 dark:hover:bg-emerald-950/70 border border-transparent hover:border-emerald-200 dark:hover:border-emerald-500/40 transition-all flex items-start space-x-3 group cursor-pointer"
              >
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-500/30 text-emerald-600 dark:text-emerald-300 group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-white flex items-center gap-1.5">
                      <span>Sincronizar Tudo</span>
                    </span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30">
                      3 em 1
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-1">
                    Grade <strong className="text-slate-700 dark:text-slate-300">SISPORT</strong> + catálogo{' '}
                    <strong className="text-blue-600 dark:text-cyan-300">Navios CDSS</strong> para IMO real + telemetria AIS{' '}
                    <strong className="text-emerald-600 dark:text-emerald-300">DataDocked</strong>.
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
