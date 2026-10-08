import React, { useState, useEffect } from 'react';
import type { NavioLineup, ResumoOperacional, MaresResponse } from '../types';
import {
  X,
  Sparkles,
  Ship,
  Clock,
  Calendar,
  Package,
  Anchor,
  CloudRain,
  ExternalLink,
  ShieldCheck,
  Radio,
  Navigation,
  AlertTriangle,
  Activity
} from 'lucide-react';
import { syncDataDocked } from '../services/api';
import { verificarDivergenciaEta, formatarDataBr } from '../utils/etaValidation';

interface GanttShipDetailsModalProps {
  navio: NavioLineup | null;
  mares?: MaresResponse | null;
  onClose: () => void;
  onOpenFullEdit?: (navio: NavioLineup) => void;
  onVesselUpdated?: (updated: NavioLineup, allNavios?: NavioLineup[], operacional?: ResumoOperacional | null) => void;
}

export const GanttShipDetailsModal: React.FC<GanttShipDetailsModalProps> = ({
  navio,
  mares,
  onClose,
  onOpenFullEdit,
  onVesselUpdated
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSyncInfo, setLastSyncInfo] = useState<{
    timeStr: string;
    lat?: number;
    lon?: number;
    positionReceived?: string;
  } | null>(null);

  // Isolamento estrito de estado: limpa dados de sincronismo voláteis ao abrir ou alternar de navio
  useEffect(() => {
    setIsSyncing(false);
    setSyncMessage(null);
    setErrorMessage(null);
    setLastSyncInfo(null);
  }, [navio?.id]);

  if (!navio) return null;

  const isOperating = navio.status_cor === 'VERDE';
  const isFundeioReal = navio.status_cor === 'VERMELHO';

  const formatDateTime = (dateStr?: string | null) => {
    if (!dateStr) return 'Não informado';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const formatSyncDateTime = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const normalizedStr = dateStr.includes('T')
        ? (dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
        : dateStr.replace(' ', 'T') + 'Z';
      const d = new Date(normalizedStr);
      if (isNaN(d.getTime())) return dateStr;
      return (
        d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) +
        ' às ' +
        d.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    } catch {
      return dateStr;
    }
  };

  const handleDataDockedSync = async () => {
    if (!navio.imo) return;
    setIsSyncing(true);
    setSyncMessage(null);
    setErrorMessage(null);

    try {
      const { vessel, navios: updatedNavios, operacional: updatedOperacional } = await syncDataDocked(navio.imo, navio.id);
      const latStr = vessel.latitude !== undefined ? vessel.latitude.toFixed(4) : '';
      const lonStr = vessel.longitude !== undefined ? vessel.longitude.toFixed(4) : '';

      const syncTimeStr =
        new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }) +
        ' às ' +
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });

      setLastSyncInfo({
        timeStr: syncTimeStr,
        lat: vessel.latitude,
        lon: vessel.longitude,
        positionReceived: vessel.positionReceived
      });

      setSyncMessage(`AIS sincronizado via DataDocked: Lat ${latStr}, Lon ${lonStr}`);
      if (onVesselUpdated) {
        const updatedSelf: NavioLineup = updatedNavios?.find((n) => n.id === navio.id || n.imo === navio.imo) || {
          ...navio,
          latitude: vessel.latitude,
          longitude: vessel.longitude,
          eta_ais: vessel.eta_previsto || navio.eta_ais,
          sinal_antena: vessel.positionReceived || navio.sinal_antena,
          ais_sincronizado_em: new Date().toISOString(),
          ultima_atualizacao: new Date().toISOString()
        };
        onVesselUpdated(updatedSelf, updatedNavios, updatedOperacional);
      }
    } catch (err) {
      setErrorMessage(`Falha na sincronização AIS: ${(err as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-fade-in overflow-hidden">
      <div className="bg-white dark:bg-cco-panel border border-slate-200 dark:border-cco-border rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl text-slate-800 dark:text-slate-200">
        
        {/* Cabeçalho Fixo */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-cco-bg border-b border-slate-200 dark:border-cco-border flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-xl border ${
              isOperating
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/40'
                : isFundeioReal
                ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:border-rose-500/40'
                : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/40'
            }`}>
              <Ship className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-wide">
                  {navio.nome_navio}
                </h3>
                <span className="text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded dark:border-slate-700">
                  IMO {navio.imo}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {navio.tipo_navio} &bull; Fila #{navio.ordem_fila} &bull; {navio.agencia || 'Agência Local'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com Rolagem Suave */}
        <div className="p-5 sm:p-6 space-y-3.5 overflow-y-auto flex-1 overscroll-contain">
          
          {/* Badge de Status Operacional */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-cco-darkest border border-slate-200 dark:border-cco-border">
            <div className="flex items-center space-x-2.5">
              <span className={`w-3 h-3 rounded-full ${
                isOperating
                  ? 'bg-emerald-500 animate-pulse'
                  : isFundeioReal
                  ? 'bg-rose-500'
                  : 'bg-amber-500'
              }`}></span>
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block uppercase tracking-wider">
                  {isOperating
                    ? '🟢 Operando no Berço Comercial (CDSS)'
                    : isFundeioReal
                    ? '🔴 No Fundeio Real (Ancorado na Barra)'
                    : '🟠 Fundeio Previsto (Aguardando Chegada)'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isOperating
                    ? 'Embarcação em operação exclusiva no cais comercial'
                    : `Previsão de atracação sequencial na posição #${navio.ordem_fila}`}
                </span>
              </div>
            </div>

            {navio.livre_pratica_ok === 1 && (
              <span className="flex items-center space-x-1 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 px-2 py-1 rounded-md">
                <ShieldCheck className="w-3 h-3 text-blue-600 dark:text-cyan-400" />
                <span>Livre Prática OK</span>
              </span>
            )}
          </div>

          {/* Card de Progresso Operacional (SISPORT Oficial) */}
          {isOperating && navio.progresso_operacao !== undefined && navio.progresso_operacao !== null && (
            <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/25 rounded-xl border border-emerald-200 dark:border-emerald-500/30">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1.5">
                <span className="flex items-center space-x-1.5">
                  <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Progresso da Operação no Berço (SISPORT)</span>
                </span>
                <span className="font-mono text-sm">{navio.progresso_operacao.toFixed(1).replace('.', ',')}%</span>
              </div>
              <div className="w-full bg-emerald-200/60 dark:bg-emerald-900/40 rounded-full h-2.5 overflow-hidden shadow-inner">
                <div
                  className="bg-emerald-500 dark:bg-emerald-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, navio.progresso_operacao))}%` }}
                />
              </div>
            </div>
          )}

          {/* Grid de Informações Chave da Escala */}
          <div className="grid grid-cols-2 gap-3">
            
            {/* Bloco 1: Janela de Berço Projetada */}
            <div className="p-3.5 bg-slate-50/90 dark:bg-cco-darkest/70 rounded-xl border border-slate-200 dark:border-cco-border flex flex-col justify-between">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Calendar className="w-4 h-4" />
                <span>Janela no Berço Único</span>
              </div>
              <div className="space-y-1 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">INÍCIO ATRACAÇÃO</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {formatDateTime(navio.inicio_atracacao)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">TÉRMINO PREVISTO</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {formatDateTime(navio.fim_atracacao)}
                  </span>
                </div>
              </div>
            </div>

            {/* Bloco 2: Duração e Meteorologia */}
            <div className="p-3.5 bg-slate-50/90 dark:bg-cco-darkest/70 rounded-xl border border-slate-200 dark:border-cco-border flex flex-col justify-between">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Clock className="w-4 h-4" />
                <span>Tempo de Operação</span>
              </div>
              <div>
                <div className="text-2xl font-mono font-extrabold text-slate-900 dark:text-white">
                  {navio.duracao_estimada_horas}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">horas</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1 space-y-0.5">
                  <div>Base: {navio.duracao_base_horas || 0}h + Manobra: {navio.delta_t_manobra || 2}h</div>
                  {navio.horas_chuva && navio.horas_chuva > 0 ? (
                    <div className="text-amber-600 dark:text-amber-400 flex items-center space-x-1">
                      <CloudRain className="w-3 h-3" />
                      <span>Parada chuva: +{navio.horas_chuva}h</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Bloco 3: Carga e Volume */}
            <div className="p-3.5 bg-slate-50/90 dark:bg-cco-darkest/70 rounded-xl border border-slate-200 dark:border-cco-border">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                <Package className="w-4 h-4" />
                <span>Carga & Volume</span>
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-slate-100">
                {navio.mercadoria}
              </div>
              <div className="text-xs font-mono text-blue-700 dark:text-cyan-300 font-semibold mt-0.5">
                {navio.volume_t.toLocaleString('pt-BR')} toneladas
              </div>
            </div>

            {/* Bloco 4: Prontidão e Chegada */}
            <div className="p-3.5 bg-slate-50/90 dark:bg-cco-darkest/70 rounded-xl border border-slate-200 dark:border-cco-border">
              <div className="flex items-center space-x-2 text-blue-700 dark:text-cyan-400 text-xs font-bold uppercase tracking-wider mb-1.5">
                <Anchor className="w-4 h-4" />
                <span>Chegada ao Porto</span>
              </div>
              <div className="space-y-1 text-xs">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 block text-[10px]">
                    {navio.chegada_fundeio ? 'CHEGADA FUNDEIO (AIS)' : 'ETA PREVISTO'}
                  </span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {formatDateTime(navio.chegada_fundeio || navio.eta_previsto)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card de Validação de Previsão: SISPORT Oficial vs Telemetria AIS */}
          {(() => {
            const divergencia = verificarDivergenciaEta(navio.eta_previsto, navio.eta_ais);
            if (!navio.eta_ais) {
              return (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-cco-darkest/70 border border-slate-200 dark:border-cco-border flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center space-x-2">
                    <Radio className="w-4 h-4 text-blue-600 dark:text-cyan-500" />
                    <span>Previsão AIS (DataDocked) ainda não sincronizada.</span>
                  </div>
                  <span className="text-[10px] text-blue-700 dark:text-cyan-400 font-medium">Sincronize abaixo para confrontar com o porto</span>
                </div>
              );
            }

            return (
              <div className={`p-3.5 rounded-xl border ${divergencia?.temDivergencia ? divergencia.corFundo + ' ' + divergencia.corBorda : 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-500/30'} space-y-2.5`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {divergencia?.temDivergencia ? (
                      <AlertTriangle className={`w-4 h-4 shrink-0 ${divergencia.tipoAlerta === 'atraso' ? 'text-amber-500 dark:text-amber-400' : 'text-blue-600 dark:text-cyan-400'}`} />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                      Validação de Previsão de Chegada
                    </span>
                  </div>
                  {divergencia && (
                    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${divergencia.corBadge}`}>
                      {divergencia.textoResumo}
                    </span>
                  )}
                </div>

                {/* Confronto lado a lado */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2.5 rounded-lg bg-white dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border">
                    <span className="text-[10px] text-blue-700 dark:text-cyan-400 block font-sans font-bold uppercase tracking-wider mb-0.5">
                      🏛️ SISPORT (Porto Oficial)
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {formatarDataBr(navio.eta_previsto)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border">
                    <span className="text-[10px] text-amber-700 dark:text-amber-400 block font-sans font-bold uppercase tracking-wider mb-0.5">
                      📡 Transponder AIS (DataDocked)
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      {formatarDataBr(navio.eta_ais)}
                    </span>
                  </div>
                </div>

                {/* Explicação contextual da divergência */}
                <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                  {divergencia?.textoDetalhado}
                </p>
              </div>
            );
          })()}

          {/* Card de Análise de Calado & Janela de Maré (DHN São Sebastião) */}
          {navio.restricao_mare && (
            <div
              className={`p-3.5 rounded-xl border space-y-2.5 ${
                navio.restricao_mare.temRestricao
                  ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/25 dark:border-amber-500/40 dark:text-amber-200'
                  : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/60 dark:border-cco-border dark:text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-sm">🌊</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                    Tábua de Marés & Calado Dinâmico (DHN)
                  </span>
                  {mares?.statusAtual && (
                    <span className="text-[10px] text-blue-700 dark:text-cyan-400 font-mono hidden sm:inline-block">
                      &bull; Canal agora: {mares.statusAtual.altura_m.toFixed(2)}m ({mares.statusAtual.tendencia === 'SUBINDO' ? '▲ Enchendo' : '▼ Vazando'})
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                    navio.restricao_mare.temRestricao
                      ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 animate-pulse'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40'
                  }`}
                >
                  {navio.restricao_mare.temRestricao ? '⚠️ RESTRIÇÃO DE MARÉ' : '✓ CALADO LIVRE'}
                </span>
              </div>

              {/* Informações Técnicas de Cais e Calado */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-white dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border/60">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Calado Navio</span>
                  <span className={`font-bold ${navio.restricao_mare.temRestricao ? 'text-amber-700 dark:text-amber-300' : 'text-slate-900 dark:text-slate-100'}`}>
                    {navio.calado ? `${Number(navio.calado).toFixed(2)}m` : '-'}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border/60">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Profund. Cais (ZH)</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {navio.restricao_mare.profundidadeBercoZh.toFixed(1)}m
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border/60">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">UKC Mínimo</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {navio.restricao_mare.ukcMinimoExigido.toFixed(2)}m
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-cco-darkest/80 border border-slate-200 dark:border-cco-border/60">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-sans">Maré Mínima Requerida</span>
                  <span className="font-bold text-blue-700 dark:text-cyan-300">
                    {navio.restricao_mare.mareMinimaRequerida > 0
                      ? `${navio.restricao_mare.mareMinimaRequerida.toFixed(2)}m`
                      : 'Livre (0.0m)'}
                  </span>
                </div>
              </div>

              {/* Análise de Atracação e Desatracação */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
                {/* Atracação */}
                <div
                  className={`p-2.5 rounded-lg border ${
                    navio.restricao_mare.atracacao && !navio.restricao_mare.atracacao.seguro
                      ? 'bg-amber-100/60 border-amber-300 dark:bg-amber-950/40 dark:border-amber-500/50'
                      : 'bg-white dark:bg-cco-darkest/80 border-slate-200 dark:border-cco-border/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-sans font-bold text-blue-700 dark:text-cyan-400 uppercase tracking-wider">
                      ⚓ Manobra de Atracação
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                        navio.restricao_mare.atracacao?.seguro
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/30'
                          : 'bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/40'
                      }`}
                    >
                      {navio.restricao_mare.atracacao?.seguro ? '✓ Seguro' : '⚠️ Baixa-mar'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300">
                    Horário: <strong>{formatDateTime(navio.inicio_atracacao)}</strong>
                  </div>
                  {navio.restricao_mare.atracacao && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
                      <div>
                        Maré prevista: <strong className="text-slate-800 dark:text-slate-200">{navio.restricao_mare.atracacao.alturaMare.toFixed(2)}m</strong> &bull; Profundidade: <strong className="text-slate-800 dark:text-slate-200">{navio.restricao_mare.atracacao.profundidadeTotalZh.toFixed(2)}m</strong>
                      </div>
                      <div>
                        Folga Sob Quilha (UKC):{' '}
                        <strong className={navio.restricao_mare.atracacao.ukcCalculado < 0.5 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}>
                          {navio.restricao_mare.atracacao.ukcCalculado.toFixed(2)}m
                        </strong>
                      </div>
                      {navio.restricao_mare.atracacao.proximaPreamar && !navio.restricao_mare.atracacao.seguro && (
                        <div className="text-blue-700 dark:text-cyan-300 text-[9.5px] pt-1 border-t border-slate-200 dark:border-cco-border/30">
                          💡 Janela Recomendada: <strong>{navio.restricao_mare.atracacao.proximaPreamar.label}</strong> ({formatDateTime(navio.restricao_mare.atracacao.proximaPreamar.dataHoraIso)})
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Desatracação */}
                <div
                  className={`p-2.5 rounded-lg border ${
                    navio.restricao_mare.desatracacao && !navio.restricao_mare.desatracacao.seguro
                      ? 'bg-amber-100/60 border-amber-300 dark:bg-amber-950/40 dark:border-amber-500/50'
                      : 'bg-white dark:bg-cco-darkest/80 border-slate-200 dark:border-cco-border/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-sans font-bold text-blue-700 dark:text-cyan-400 uppercase tracking-wider">
                      🚢 Manobra de Desatracação
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                        navio.restricao_mare.desatracacao?.seguro
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-500/30'
                          : 'bg-rose-50 text-rose-700 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-500/40'
                      }`}
                    >
                      {navio.restricao_mare.desatracacao?.seguro ? '✓ Seguro' : '⚠️ Baixa-mar'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-700 dark:text-slate-300">
                    Horário: <strong>{formatDateTime(navio.fim_atracacao)}</strong>
                  </div>
                  {navio.restricao_mare.desatracacao && (
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
                      <div>
                        Maré prevista: <strong className="text-slate-800 dark:text-slate-200">{navio.restricao_mare.desatracacao.alturaMare.toFixed(2)}m</strong> &bull; Profundidade: <strong className="text-slate-800 dark:text-slate-200">{navio.restricao_mare.desatracacao.profundidadeTotalZh.toFixed(2)}m</strong>
                      </div>
                      <div>
                        Folga Sob Quilha (UKC):{' '}
                        <strong className={navio.restricao_mare.desatracacao.ukcCalculado < 0.5 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-emerald-600 dark:text-emerald-400'}>
                          {navio.restricao_mare.desatracacao.ukcCalculado.toFixed(2)}m
                        </strong>
                      </div>
                      {navio.restricao_mare.desatracacao.proximaPreamar && !navio.restricao_mare.desatracacao.seguro && (
                        <div className="text-blue-700 dark:text-cyan-300 text-[9.5px] pt-1 border-t border-slate-200 dark:border-cco-border/30">
                          💡 Janela Recomendada: <strong>{navio.restricao_mare.desatracacao.proximaPreamar.label}</strong> ({formatDateTime(navio.restricao_mare.desatracacao.proximaPreamar.dataHoraIso)})
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mensagens de sincronização AIS com data/hora detalhada */}
          {syncMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-lg shadow-emerald-950/20 animate-fade-in">
              <div className="flex items-start sm:items-center space-x-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-700 dark:text-emerald-300 font-bold shrink-0 mt-0.5 sm:mt-0">
                  ✓
                </span>
                <div>
                  <span className="font-semibold text-slate-900 dark:text-white block">{syncMessage}</span>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-mono mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>
                      Sincronizado em: <strong className="text-emerald-800 dark:text-emerald-300">{lastSyncInfo?.timeStr}</strong> (BRT)
                    </span>
                    {(lastSyncInfo?.positionReceived || navio.sinal_antena) && (
                      <span className="opacity-80">&bull; Sinal da antena: {lastSyncInfo?.positionReceived || navio.sinal_antena}</span>
                    )}
                  </div>
                </div>
              </div>
              <span className="bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/30 shrink-0 self-start sm:self-auto">
                1 Crédito
              </span>
            </div>
          )}
          {errorMessage && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 text-xs flex items-center space-x-2">
              <span>✕</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Botão para sincronizar telemetria AIS sob demanda com histórico de atualização */}
          <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-cyan-950/30 dark:to-blue-950/30 rounded-xl border border-blue-200 dark:border-cyan-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-blue-600 dark:text-cyan-400 animate-pulse" />
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Telemetria AIS em Tempo Real
                </span>
              </div>
              <button
                onClick={handleDataDockedSync}
                disabled={isSyncing}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white font-bold rounded-lg text-xs shadow-md shadow-blue-600/30 flex items-center space-x-1.5 transition-all disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Consultando...' : 'Sincronizar AIS (1 Crédito)'}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 text-[11px] text-slate-600 dark:text-slate-300 pt-2 border-t border-blue-200 dark:border-cyan-500/10 font-mono">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
                <span className="text-slate-500 dark:text-slate-400">Última Sincronização:</span>
                <span className="text-blue-700 dark:text-cyan-300 font-semibold">
                  {lastSyncInfo?.timeStr || formatSyncDateTime(navio.ais_sincronizado_em) || 'Aguardando sincronização inicial'}
                </span>
              </div>

              {navio.latitude !== undefined && navio.longitude !== undefined && (
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400">
                  <Navigation className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Posição:</span>
                  <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                    Lat {navio.latitude.toFixed(4)}, Lon {navio.longitude.toFixed(4)}
                  </span>
                </div>
              )}
            </div>

            {(navio.sinal_antena || lastSyncInfo?.positionReceived) && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono pt-1.5 border-t border-blue-200 dark:border-cyan-500/10 flex items-center space-x-1.5">
                <Radio className="w-3 h-3 text-blue-600 dark:text-cyan-400 shrink-0" />
                <span>Sinal da Antena AIS:</span>
                <span className="text-blue-800 dark:text-cyan-200">{lastSyncInfo?.positionReceived || navio.sinal_antena}</span>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé Fixo do Modal */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-cco-bg border-t border-slate-200 dark:border-cco-border flex items-center justify-between shrink-0">
          {onOpenFullEdit ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenFullEdit(navio);
              }}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-cyan-400 dark:hover:text-cyan-300 font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Editar Dados Completos na Gestão</span>
            </button>
          ) : (
            <div></div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
