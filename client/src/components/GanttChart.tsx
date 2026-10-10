import React, { useState, useMemo, useEffect, useRef } from 'react';
import type {
  NavioLineup,
  ResumoOperacional,
  MaresResponse
} from '../types';
import {
  CloudRain,
  Ship,
  Anchor,
  Package,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { verificarDivergenciaEta, formatarDataBr } from '../utils/etaValidation';
import { TideWaveTrack } from './TideWaveTrack';
import type { ExtremoMare } from '../utils/tideWaveRenderer';
import { useTheme } from '../context/ThemeContext';

export const isCargaSensivelChuva = (mercadoria?: string): boolean => {
  if (!mercadoria) return false;
  const m = mercadoria.toLowerCase();
  return (
    m.includes('cevada') ||
    m.includes('barrilha') ||
    m.includes('barilha') ||
    m.includes('alumina') ||
    m.includes('fertilizante') ||
    m.includes('adubo') ||
    m.includes('trigo') ||
    m.includes('açúcar') ||
    m.includes('acucar')
  );
};

interface GanttChartProps {
  navios: NavioLineup[];
  operacional: ResumoOperacional | null;
  mares?: MaresResponse | null;
  onSelectNavio?: (navio: NavioLineup) => void;
  scaleDays?: 7 | 14 | 28;
  onScaleChange?: (scale: 7 | 14 | 28) => void;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  navios,
  operacional,
  mares,
  onSelectNavio,
  scaleDays = 7,
  onScaleChange: _onScaleChange
}) => {
  const { isDark } = useTheme();
  const [hoveredNavio, setHoveredNavio] = useState<NavioLineup | null>(null);

  // Escala Temporal Selecionada (7D / 14D / 28D) controlada pelo CCO Header
  const currentScale = scaleDays ?? 7;

  // Medição da largura real da pista temporal para micro-labels inteligentes
  const trackContainerRef = useRef<HTMLDivElement>(null);
  const [trackWidthPx, setTrackWidthPx] = useState<number>(1200);

  useEffect(() => {
    const el = trackContainerRef.current;
    if (!el) return;
    const updateWidth = () => {
      // Largura da raia do Gantt descontando a coluna lateral de 26.5rem (424px)
      const available = el.clientWidth - 424;
      if (available > 100) setTrackWidthPx(available);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener('resize', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // Medição da largura real da pista de maré para o SVG Sparkline
  const tideTrackRef = useRef<HTMLDivElement>(null);
  const [tideWidthPx, setTideWidthPx] = useState<number>(1200);

  useEffect(() => {
    const el = tideTrackRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 50) setTideWidthPx(w);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener('resize', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // Momento presente de referência ("Agora") reativo em tempo real
  const [agoraDate, setAgoraDate] = useState(() => new Date());

  useEffect(() => {
    // Atualiza o tempo presente a cada 10 segundos para avançar a barra suavemente
    const interval = setInterval(() => {
      setAgoraDate(new Date());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Período de visualização da escala CCO: Janela dinâmica reativa (7D / 14D / 28D)
  const { timelineStart, timelineEnd, totalMs } = useMemo(() => {
    // Início do dia atual (00:00:00 local)
    const startOfToday = new Date(agoraDate);
    startOfToday.setHours(0, 0, 0, 0);

    // No modo 7D: 2 dias no passado e 5 dias no futuro (total 7 dias)
    // No modo 14D: 3 dias no passado e 11 dias no futuro (total 14 dias)
    // No modo 28D: 3 dias no passado e 25 dias no futuro (total 28 dias)
    const pastDays = currentScale === 7 ? 2 : 3;

    const start = new Date(startOfToday.getTime() - pastDays * 24 * 3600 * 1000);
    start.setHours(0, 0, 0, 0);

    const totalTimelineMs = currentScale * 24 * 3600 * 1000;
    const end = new Date(start.getTime() + totalTimelineMs);

    return {
      timelineStart: start,
      timelineEnd: end,
      totalMs: totalTimelineMs
    };
  }, [agoraDate.toDateString(), currentScale]);

  // Posição percentual exata do momento presente dentro da escala total
  const agoraPercent = Math.max(
    0,
    Math.min(100, ((agoraDate.getTime() - timelineStart.getTime()) / totalMs) * 100)
  );

  const isAgoraVisible =
    agoraDate.getTime() >= timelineStart.getTime() &&
    agoraDate.getTime() <= timelineEnd.getTime();

  // Lista dos dias para o Eixo X
  const daysList = useMemo(() => {
    const days: { date: Date; label: string; dayNum: number; weekday: string; isToday: boolean; isWeekend: boolean }[] = [];
    const curr = new Date(timelineStart);
    while (curr < timelineEnd) {
      const isToday =
        curr.getFullYear() === agoraDate.getFullYear() &&
        curr.getMonth() === agoraDate.getMonth() &&
        curr.getDate() === agoraDate.getDate();
      const isWeekend = curr.getDay() === 0 || curr.getDay() === 6; // Domingo (0) ou Sábado (6)
      days.push({
        date: new Date(curr),
        label: `${curr.getDate().toString().padStart(2, '0')}/${(curr.getMonth() + 1).toString().padStart(2, '0')}`,
        dayNum: curr.getDate(),
        weekday: curr.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3),
        isToday,
        isWeekend
      });
      curr.setDate(curr.getDate() + 1);
    }
    return days;
  }, [timelineStart, timelineEnd, agoraDate.toDateString()]);

  // Função auxiliar para parsing de data UTC invariante evitando desvios de fuso
  const parseDateToMs = (dateStr?: string | null): number => {
    if (!dateStr) return NaN;
    const s = dateStr.trim();
    if (!s) return NaN;
    const norm = s.endsWith('Z') || s.includes('+') || (s.lastIndexOf('-') > 7) ? s : s + 'Z';
    return new Date(norm).getTime();
  };

  // Mapeamento contínuo dos extremos astronômicos da DHN para a Mini-Curva de Maré (SVG Sparkline)
  const extremosMare: ExtremoMare[] = useMemo(() => {
    if (!mares?.extremos || mares.extremos.length === 0) return [];

    return mares.extremos
      .map((e) => {
        const ms = parseDateToMs(e.dataHoraIso);
        if (isNaN(ms)) return null;
        const d = new Date(ms);
        const horaFormatada = d.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit'
        });
        return {
          timestampMs: ms,
          alturaMetros: e.altura_m,
          tipo: (e.tipo === 'PREAMAR' ? 'PREAMAR' : 'BAIXAMAR') as 'PREAMAR' | 'BAIXAMAR',
          horaFormatada
        };
      })
      .filter((e): e is ExtremoMare => e !== null)
      .sort((a, b) => a.timestampMs - b.timestampMs);
  }, [mares?.extremos]);

  const formatSyncDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const normalizedStr = dateStr.includes('T')
        ? (dateStr.endsWith('Z') ? dateStr : dateStr + 'Z')
        : dateStr.replace(' ', 'T') + 'Z';
      const d = new Date(normalizedStr);
      if (isNaN(d.getTime())) return dateStr;
      return (
        d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
        ' às ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return dateStr;
    }
  };

  // Métricas desacopladas da Taxa de Ocupação Mensal vs Backlog Total da Carteira
  const totalHorasBacklog = operacional?.horas_ocupadas ?? navios.reduce((acc, n) => acc + (n.duracao_estimada_horas || 0), 0);
  const horasJanelaMes = 720; // 30 dias nominais x 24 horas
  const totalNaviosProgramados = operacional?.total_navios ?? navios.length;

  // Taxa de ocupação estritamente restrita à capacidade nominal da janela de 30 dias (720h)
  const ocupacaoJanela30d = Math.min(
    100,
    Math.round((Math.min(totalHorasBacklog, horasJanelaMes) / horasJanelaMes) * 100)
  );

  // Demanda acumulada de toda a carteira da fila em relação à capacidade mensal de 720h
  const demandaPercentualStr = ((totalHorasBacklog / horasJanelaMes) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  const diasCaisEstimados = Math.round(totalHorasBacklog / 24);

  const totalHorasBacklogStr = totalHorasBacklog.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });

  const tooltipAuditoria = `Janela Mensal: ${horasJanelaMes}h saturada (${ocupacaoJanela30d}%) | Backlog em Carteira: ${totalHorasBacklogStr}h com ${totalNaviosProgramados} navios programados`;

  return (
    <div
      ref={trackContainerRef}
      className="flex-1 flex flex-col h-full w-full bg-slate-50 dark:bg-cco-darkest overflow-hidden relative select-none"
    >
      {/* Barra superior de legenda e informações da CCO */}
      <div className="bg-white dark:bg-cco-bg px-4 py-2 border-b border-slate-200 dark:border-cco-border flex flex-wrap items-center text-xs shrink-0 gap-y-2">
        <div className="flex flex-wrap items-center space-x-4">
          <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Padronização Oficial CDSS:</span>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-emerald-500 border border-emerald-400 animate-pulse"></span>
            <span className="text-slate-700 dark:text-slate-200 font-medium">Operando Real (Verde)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-blue-600 border border-blue-400"></span>
            <span className="text-slate-700 dark:text-slate-200 font-medium">Previsão de Operação (Azul)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-rose-500 border border-rose-400"></span>
            <span className="text-slate-700 dark:text-slate-200 font-medium">No Fundeio Real (Vermelho)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-3 rounded bg-amber-500 border border-amber-400"></span>
            <span className="text-slate-700 dark:text-slate-200 font-medium">Fundeio Previsto (Laranja)</span>
          </div>

          {/* Identificação da Linha "Agora" agrupada à esquerda */}
          <div className="flex items-center space-x-1.5 pl-3 border-l border-slate-300 dark:border-slate-700">
            <span className="w-3 h-0.5 bg-rose-500"></span>
            <span className="text-rose-600 dark:text-rose-400 font-mono font-semibold whitespace-nowrap">
              Linha "Agora" ({agoraDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}{' '}
              {agoraDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} BRT)
            </span>
          </div>
        </div>
      </div>

      {/* Grade Principal do Gantt com Rolagem Sincronizada */}
      <div className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative">
        {/* 1. Linha Dedicada de Marcadores Temporais (Agora / CCO Time) */}
        <div className="sticky top-0 z-30 bg-slate-100 dark:bg-[#070d18] border-b border-slate-200 dark:border-cco-border/60 flex h-6 shrink-0 shadow-sm">
          {/* Coluna lateral esquerda da Linha de Marcador Temporal */}
          <div className="w-[26.5rem] min-w-[26.5rem] px-4 bg-slate-100 dark:bg-[#070d18] border-r border-slate-200 dark:border-cco-border flex items-center justify-between text-[9px] font-mono shrink-0">
            <span className="font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <span>⏱️</span>
              <span>Marcador Temporal CCO</span>
            </span>
            <span className="text-rose-600 dark:text-rose-400 font-bold flex items-center space-x-1 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-300 dark:border-rose-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
              <span>TEMPO REAL</span>
            </span>
          </div>

          {/* Área da régua temporal com o badge AGORA elevado e isolado */}
          <div className="flex-1 relative flex items-center bg-slate-100 dark:bg-[#070d18] overflow-hidden">
            {/* Grade vertical de fundo */}
            <div className="absolute inset-0 flex pointer-events-none">
              {daysList.map((day, idx) => (
                <div
                  key={idx}
                  className={`flex-1 border-r ${
                    day.isWeekend ? 'bg-slate-200/50 dark:bg-slate-900/40 border-slate-300/50 dark:border-cco-border/30' : 'border-slate-200 dark:border-cco-border/15'
                  }`}
                ></div>
              ))}
            </div>

            {/* Cápsula AGORA elevada e isolada, sem sobreposição com a régua de dias nem tábua de marés */}
            {isAgoraVisible && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none flex items-center -translate-x-1/2 z-30"
                style={{ left: `${agoraPercent}%` }}
              >
                <div className="bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-lg shadow-rose-600/60 uppercase tracking-tighter whitespace-nowrap flex items-center space-x-1 border border-rose-400 animate-pulse pointer-events-none">
                  <span>AGORA</span>
                  <span className="text-[8px] leading-none text-rose-200">▼</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. Cabeçalho do Eixo X: Régua de Dias do Mês */}
        <div className="sticky top-[24px] z-30 bg-slate-100 dark:bg-[#070d18] border-b border-slate-200 dark:border-cco-border flex h-11 shrink-0 shadow-sm">
          {/* Coluna fixa do Y-axis header */}
          <div className="w-[26.5rem] min-w-[26.5rem] px-4 py-2 bg-slate-100 dark:bg-[#070d18] border-r border-slate-200 dark:border-cco-border flex items-center justify-between font-bold text-xs text-slate-700 dark:text-slate-300 tracking-wider uppercase shrink-0">
            <span>Fila | Embarcação</span>
            <span>Carga / Volume</span>
          </div>

          {/* Escala dos dias do Eixo X */}
          <div className="flex-1 flex relative bg-slate-100 dark:bg-[#070d18]">
            {daysList.map((day, idx) => (
              <div
                key={idx}
                className={`flex-1 flex flex-col items-center justify-center border-r text-[10px] font-mono leading-tight transition-colors ${
                  day.isToday
                    ? 'bg-rose-100/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-bold border-rose-300 dark:border-rose-500/60'
                    : day.isWeekend
                    ? 'bg-slate-200/60 dark:bg-slate-900/90 text-blue-900 dark:text-cyan-200 border-slate-300 dark:border-cco-border/50 ring-1 ring-inset ring-blue-500/10 dark:ring-cyan-500/15'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/40 dark:hover:bg-cco-hover/40 border-slate-200 dark:border-cco-border/30'
                }`}
              >
                <span className={`uppercase text-[9px] font-bold ${day.isWeekend ? 'text-blue-700 dark:text-cyan-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {day.weekday}
                </span>
                <span className={`text-xs ${day.isToday ? 'text-rose-600 dark:text-rose-400 font-extrabold' : day.isWeekend ? 'text-slate-900 dark:text-white font-extrabold' : 'text-slate-800 dark:text-slate-200 font-semibold'}`}>
                  {day.dayNum}
                </span>
              </div>
            ))}

            {/* Linha vertical vermelha guia no cabeçalho dos dias */}
            {isAgoraVisible && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none w-0.5 bg-rose-500/80 -translate-x-1/2"
                style={{ left: `${agoraPercent}%` }}
              ></div>
            )}
          </div>
        </div>

        {/* 3. Régua / Mini-Curva Contínua de Maré (DHN Estação 40165 • NR) */}
        <div className="sticky top-[68px] z-30 bg-slate-50 dark:bg-[#070d18] border-b border-slate-200 dark:border-cco-border/80 flex h-[50px] shrink-0 shadow-sm">
          {/* Coluna Y fixa da maré */}
          <div className="w-[26.5rem] min-w-[26.5rem] h-[50px] px-4 py-1 bg-slate-50 dark:bg-[#070d18] border-r border-slate-200 dark:border-cco-border flex items-center justify-between text-[10px] font-mono shrink-0">
            <div className="flex flex-col justify-center">
              <div className="flex items-center space-x-1.5 text-blue-700 dark:text-cyan-400 font-bold">
                <span className="text-sm">🌊</span>
                <span className="text-[11px] text-slate-800 dark:text-slate-200 font-semibold tracking-tight">Maré Astronômica (DHN • NR)</span>
              </div>
              <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono pl-5">
                Estação 40165 &bull; Ref. 1.00m
              </div>
            </div>
            <div className="flex flex-col items-end space-y-0.5 text-[9px] font-mono">
              <span className="flex items-center space-x-1" title="Preamar (Água Alta)">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E3A8A] dark:bg-[#38bdf8]"></span>
                <span className="text-blue-800 dark:text-cyan-300 font-medium">Preamar</span>
              </span>
              <span className="flex items-center space-x-1" title="Baixa-mar (Água Baixa)">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d97706] dark:bg-[#f59e0b]"></span>
                <span className="text-amber-700 dark:text-amber-300 font-medium">Baixa-mar</span>
              </span>
            </div>
          </div>

          {/* Eixo horizontal da linha de marés com a Mini-Curva Contínua (SVG Sparkline) */}
          <div
            ref={tideTrackRef}
            id="tide-track-container"
            className="h-[50px] flex-1 flex relative overflow-hidden bg-slate-50 dark:bg-[#070d18]"
          >
            {/* Linhas verticais dos dias de fundo para alinhamento 1:1 com a régua de dias */}
            <div className="absolute inset-0 flex pointer-events-none">
              {daysList.map((day, idx) => (
                <div
                  key={idx}
                  className={`flex-1 border-r ${
                    day.isWeekend ? 'bg-slate-200/50 dark:bg-slate-900/60 border-slate-300/50 dark:border-cco-border/35' : 'border-slate-200 dark:border-cco-border/20'
                  }`}
                ></div>
              ))}
            </div>

            {/* Linha vertical guia vermelha do AGORA na fita de marés */}
            {isAgoraVisible && (
              <div
                className="absolute top-0 bottom-0 z-[5] pointer-events-none w-0.5 bg-rose-500/80 -translate-x-1/2"
                style={{ left: `${agoraPercent}%` }}
              ></div>
            )}

            {/* SVG Sparkline Contínuo perfeitamente sincronizado com o eixo de tempo */}
            <div className="absolute inset-0 z-10 pointer-events-auto">
              <TideWaveTrack
                extremos={extremosMare}
                timelineStartMs={timelineStart.getTime()}
                timelineEndMs={timelineEnd.getTime()}
                widthPx={tideWidthPx > 50 ? tideWidthPx : trackWidthPx}
                escalaDias={currentScale}
                heightPx={50}
              />
            </div>
          </div>
        </div>

        {/* 4. Trilho Consolidado de Berço Único (Cais Comercial CDSS) - Linha Mestre Fixa */}
        <div className="sticky top-[118px] z-30 bg-white dark:bg-[#070d18] border-b border-slate-200 dark:border-cco-border flex h-12 items-center shrink-0 shadow-sm">
          {/* Coluna Y fixa do Berço */}
          <div className="w-[26.5rem] min-w-[26.5rem] px-4 py-2 bg-white dark:bg-[#070d18] border-r border-slate-200 dark:border-cco-border flex items-center justify-between shrink-0 z-30">
            <div className="flex items-center space-x-2">
              <span className="text-emerald-500 dark:text-emerald-400 font-extrabold text-base">⚓</span>
              <div>
                <div className="font-extrabold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                  Berço Comercial (CDSS)
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  Cais Único de Operação
                </div>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-bold px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-500/40">
              Fila Contínua
            </span>
          </div>

          {/* Fita contínua de ocupação no tempo (Verde + Azuis em série sem sobreposição) */}
          <div className="flex-1 relative flex items-center h-full bg-white dark:bg-[#070d18]">
            {/* Linhas verticais dos dias de fundo */}
            <div className="absolute inset-0 flex pointer-events-none">
              {daysList.map((day, idx) => (
                <div
                  key={idx}
                  className={`flex-1 border-r ${
                    day.isWeekend ? 'bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-cco-border/30' : 'border-slate-100 dark:border-cco-border/15'
                  }`}
                ></div>
              ))}
            </div>

            {/* Linha vertical vermelha guia em Linha 0 */}
            {isAgoraVisible && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none w-0.5 bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] -translate-x-1/2"
                style={{ left: `${agoraPercent}%` }}
              ></div>
            )}

            {navios.flatMap((n) => {
              const berthBlocks = (n.blocos || []).filter((b) => b.tipo === 'VERDE' || b.tipo === 'AZUL');
              if (berthBlocks.length > 0) {
                return berthBlocks.map((b, bIdx) => ({
                  navio: n,
                  bloco: b,
                  key: `berco-track-${n.id}-${bIdx}`
                }));
              }
              return [{
                navio: n,
                bloco: {
                  tipo: (n.status_cor === 'VERDE' ? 'VERDE' : 'AZUL') as 'VERDE' | 'AZUL',
                  label: n.nome_navio,
                  inicioIso: n.inicio_atracacao || '',
                  fimIso: n.fim_atracacao || '',
                  duracaoHoras: n.duracao_estimada_horas || 0
                },
                key: `berco-track-${n.id}-0`
              }];
            }).map(({ navio: n, bloco: b, key }) => {
              const bStartMs = parseDateToMs(b.inicioIso);
              const bEndMs = parseDateToMs(b.fimIso);
              if (isNaN(bStartMs) || isNaN(bEndMs)) return null;

              // Não renderiza se o bloco estiver completamente fora da escala selecionada
              if (bEndMs <= timelineStart.getTime() || bStartMs >= timelineEnd.getTime()) {
                return null;
              }

              const leftPct = Math.max(0, Math.min(100, ((bStartMs - timelineStart.getTime()) / totalMs) * 100));
              const rightPct = Math.max(0, Math.min(100, ((bEndMs - timelineStart.getTime()) / totalMs) * 100));
              const widthPct = Math.max(0.4, rightPct - leftPct);
              const blockPx = (widthPct / 100) * trackWidthPx;
              const isUltraShort = blockPx < 15;

              if (rightPct <= 0 || leftPct >= 100) return null;

              const isOp = b.tipo === 'VERDE';
              const isTerminoNavioEmCais = n.status_cor === 'VERDE' && b.tipo === 'AZUL';
              const isCaladoCritico = b.caladoCritico || ((n.calado || 0) > 9.50 && (b.tipo === 'AZUL' || b.tipo === 'VERDE'));
              const overflowsRight = bEndMs > timelineEnd.getTime();
              const roundedMasterClass = overflowsRight ? 'rounded-l rounded-r-none' : 'rounded';

              return (
                <div
                  key={key}
                  onClick={onSelectNavio ? () => onSelectNavio(n) : undefined}
                  title={`${isOp ? 'Operando Real' : isTerminoNavioEmCais ? 'Término de Operação' : 'Previsão de Berço'}: ${n.nome_navio} (${b.duracaoHoras}h)`}
                  className={`absolute h-7 border flex items-center justify-between px-1 text-[10px] font-bold ${
                    onSelectNavio ? 'cursor-pointer hover:brightness-125' : 'cursor-default'
                  } z-20 overflow-hidden border-r-2 border-slate-950/80 shadow-md ${roundedMasterClass} ${
                    isUltraShort
                      ? 'border-x-2 border-cyan-300 shadow-[0_0_8px_rgba(59,130,246,0.6)] ring-1 ring-cyan-400'
                      : ''
                  } ${
                    isCaladoCritico
                      ? 'border-red-400 text-white shadow-md shadow-red-950/40 ring-1 ring-red-400 font-extrabold'
                      : isOp
                      ? 'bg-emerald-600 border-emerald-300 text-white shadow-emerald-500/40 ring-1 ring-emerald-300'
                      : 'bg-blue-600 border-blue-400 text-white shadow-sm'
                  }`}
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    minWidth: '10px',
                    ...(isCaladoCritico
                      ? {
                          backgroundImage: 'repeating-linear-gradient(45deg, #dc2626, #dc2626 8px, #991b1b 8px, #991b1b 16px)'
                        }
                      : {})
                  }}
                >
                  {isOp ? (
                    /* Bloco Verde de Operação Real: Micro-label condicional de alta densidade */
                    blockPx < 80 ? (
                      /* Se < 80px: suprima o nome e exiba estritamente o valor em negrito */
                      <span className="font-mono font-black text-[9.5px] text-center w-full">
                        {Number(b.duracaoHoras).toFixed(1)}h
                      </span>
                    ) : (
                      /* Se >= 80px: exiba o nome e a duração: ${navio.nome} • ${duracao}h */
                      <div className="flex items-center justify-center gap-1.5 w-full px-1 text-center truncate">
                        <span className="shrink-0 text-xs">🟢</span>
                        <span className="truncate tracking-tight font-extrabold text-[10px]">
                          {n.nome_navio}
                        </span>
                        <span className="opacity-60 text-white shrink-0">•</span>
                        <span className="font-mono text-[9px] font-black shrink-0">
                          {Number(b.duracaoHoras).toFixed(1)}h
                        </span>
                      </div>
                    )
                  ) : blockPx >= 110 ? (
                    <div className="flex items-center justify-center gap-1.5 w-full px-1 text-center truncate">
                      <span className="shrink-0 text-xs">{isCaladoCritico ? '⚠️' : '🔵'}</span>
                      <span className="truncate tracking-tight font-extrabold text-[10px]">
                        {isCaladoCritico
                          ? `[RESTRITO >9.5m] ${isTerminoNavioEmCais ? `Término ${n.nome_navio}` : `#${n.ordem_fila} ${n.nome_navio}`}`
                          : isTerminoNavioEmCais
                          ? `Término ${n.nome_navio}`
                          : `#${n.ordem_fila} ${n.nome_navio}`}
                      </span>
                      <span className="opacity-60 text-white shrink-0">•</span>
                      <span className="font-mono text-[9px] font-black shrink-0">
                        {Number(b.duracaoHoras).toFixed(1)}h
                      </span>
                    </div>
                  ) : blockPx >= 55 ? (
                    <div className="flex items-center justify-center gap-1 w-full px-0.5 text-[9px] text-center truncate">
                      <span className="truncate font-bold">
                        {isTerminoNavioEmCais ? `Término ${n.nome_navio.slice(0, 5)}` : `#${n.ordem_fila} ${n.nome_navio.slice(0, 6)}`}
                      </span>
                      <span className="opacity-60 text-white shrink-0">•</span>
                      <span className="font-mono font-black shrink-0">{Number(b.duracaoHoras).toFixed(1)}h</span>
                    </div>
                  ) : blockPx >= 20 ? (
                    <span className="font-mono font-black text-[9px] text-center w-full">
                      {Number(b.duracaoHoras).toFixed(1)}h
                    </span>
                  ) : null}

                  {overflowsRight && (
                    <span
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 font-black text-[9px] text-white/90 drop-shadow pointer-events-none select-none tracking-tighter"
                      title="Continua além da escala visível"
                    >
                      ❯❯
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Linhas Horizontais dos Navios do Line-up */}
        <div className="relative flex-1 divide-y divide-slate-200 dark:divide-cco-border/30">
          {/* Máscara de Histórico (Passado à esquerda da linha "AGORA") */}
          {isAgoraVisible && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none z-[4]"
              style={{
                left: '26.5rem',
                width: `calc((100% - 26.5rem) * ${agoraPercent / 100})`,
                background: isDark
                  ? 'linear-gradient(to right, rgba(2, 6, 23, 0.45), rgba(2, 6, 23, 0.35))'
                  : 'linear-gradient(to right, rgba(226, 232, 240, 0.45), rgba(241, 245, 249, 0.35))',
                backgroundImage: isDark
                  ? 'repeating-linear-gradient(45deg, rgba(2,6,23,0.3) 0px, rgba(2,6,23,0.3) 12px, rgba(15,23,42,0.3) 12px, rgba(15,23,42,0.3) 24px)'
                  : 'repeating-linear-gradient(45deg, rgba(203,213,225,0.35) 0px, rgba(203,213,225,0.35) 12px, rgba(241,245,249,0.35) 12px, rgba(241,245,249,0.35) 24px)'
              }}
            >
              <div className="absolute top-2 left-2 text-[9px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-widest bg-white/90 dark:bg-slate-950/80 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 shadow-sm">
                Histórico Consumado
              </div>
            </div>
          )}

          {/* Linha vertical vermelha que desce por todo o corpo da grade */}
          {isAgoraVisible && (
            <div
              className="absolute top-0 bottom-0 z-20 pointer-events-none w-0.5 bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)] -translate-x-1/2"
              style={{ left: `calc(26.5rem + (100% - 26.5rem) * ${agoraPercent / 100})` }}
            ></div>
          )}

          {/* Grade de fundo (linhas verticais dos dias com destaque para fins de semana) */}
          <div className="absolute inset-0 pointer-events-none flex" style={{ left: '26.5rem' }}>
            {daysList.map((day, idx) => (
              <div
                key={idx}
                className={`flex-1 border-r transition-colors ${
                  day.isToday
                    ? 'border-rose-300/40 bg-rose-50/20 dark:border-rose-500/25 dark:bg-rose-950/15'
                    : day.isWeekend
                    ? 'border-slate-200 dark:border-cco-border/40 bg-slate-100/60 dark:bg-[#0c1527]/75 shadow-[inset_0_0_12px_rgba(15,23,42,0.03)] dark:shadow-[inset_0_0_12px_rgba(15,23,42,0.6)]'
                    : 'border-slate-100 dark:border-cco-border/20'
                }`}
              ></div>
            ))}
          </div>

          {/* Raias Individuais por Embarcação */}
          {navios.map((navio, navioIdx) => {
            const isOperating = navio.status_cor === 'VERDE';
            const divergencia = verificarDivergenciaEta(navio.eta_previsto, navio.eta_ais);
            // Identifica se a linha está na porção inferior da lista para ancorar o popover para cima (bottom-0)
            const isNearBottom = navioIdx >= Math.max(2, navios.length - 4);

            return (
              <div
                key={navio.id || navio.imo}
                className="flex h-20 relative hover:bg-slate-50 dark:hover:bg-cco-hover/30 transition-colors group z-10 hover:z-40"
              >
                {/* Coluna Y-Axis fixa com detalhes da embarcação */}
                <div
                  onMouseEnter={() => setHoveredNavio(navio)}
                  onMouseLeave={() => setHoveredNavio(null)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-[26.5rem] min-w-[26.5rem] px-4 py-1.5 bg-white/95 dark:bg-cco-panel/95 border-r border-slate-200 dark:border-cco-border flex items-center justify-between shrink-0 z-20 group-hover:bg-slate-50 dark:group-hover:bg-cco-panel transition-colors relative cursor-default"
                >
                  <div className="flex items-center space-x-2.5 overflow-hidden flex-1 min-w-0">
                    {/* Badge da ordem na fila */}
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        isOperating
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/30 ring-2 ring-emerald-400'
                          : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-cco-darkest dark:text-slate-300 dark:border-cco-border'
                      }`}
                    >
                      {navio.ordem_fila}
                    </div>

                    {/* Dados Centrais do Navio estruturados em 3 linhas sem quebras parasitárias */}
                    <div className="flex-1 min-w-0 flex flex-col justify-center space-y-0.5 overflow-hidden">
                      {/* Linha 1: Nome do Navio + Badge No Berço + Progresso % */}
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span
                          className="font-bold text-sm text-slate-900 dark:text-slate-100 transition-colors truncate"
                          title={navio.nome_navio}
                        >
                          {navio.nome_navio}
                        </span>
                        {isOperating && (
                          <div className="flex items-center space-x-1 shrink-0">
                            <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 text-[9px] px-1.5 py-0.2 rounded font-bold border border-emerald-200 dark:border-emerald-500/40">
                              NO BERÇO
                            </span>
                            {navio.progresso_operacao !== undefined && navio.progresso_operacao !== null && (
                              <span
                                className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-bold border border-emerald-300 dark:border-emerald-500/40 flex items-center space-x-0.5"
                                title={`Progresso Operacional no Berço: ${navio.progresso_operacao.toFixed(1).replace('.', ',')}%`}
                              >
                                <span>⚡</span>
                                <span>{navio.progresso_operacao.toFixed(1).replace('.', ',')}%</span>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Linha 2: Dimensões Operacionais Primárias (Calado e LOA) + Registro IMO */}
                      <div className="text-[10.5px] text-slate-500 dark:text-slate-400 font-mono flex items-center space-x-1.5 whitespace-nowrap overflow-hidden">
                        <span
                          className={`font-semibold flex items-center space-x-0.5 ${
                            navio.restricao_mare?.temRestricao ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-blue-700 dark:text-cyan-300'
                          }`}
                          title={navio.restricao_mare?.resumoAlerta}
                        >
                          {navio.restricao_mare?.temRestricao && <span>🌊⚠️</span>}
                          <span>Cal. {navio.calado ? `${Number(navio.calado).toFixed(2)}m` : '-'}</span>
                        </span>
                        <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                        <span className="text-slate-700 dark:text-slate-300">LOA {navio.loa}m</span>
                        <span className="text-slate-300 dark:text-slate-600">&bull;</span>
                        <span className="text-slate-500 dark:text-slate-400">IMO {navio.imo}</span>
                      </div>

                      {/* Linha 3: Status da Telemetria AIS ou Alerta de Maré/Divergência */}
                      <div className="min-w-0 flex items-center">
                        {navio.restricao_mare?.temRestricao ? (
                          <span
                            title={`Alerta de Restrição de Calado & Maré (DHN):\n${navio.restricao_mare.resumoAlerta}\nCalado do Navio: ${navio.calado}m | Profundidade Berço (ZH): ${navio.restricao_mare.profundidadeBercoZh}m\nAtracação: ${navio.restricao_mare.atracacao ? `Maré ${navio.restricao_mare.atracacao.alturaMare.toFixed(2)}m (UKC ${navio.restricao_mare.atracacao.ukcCalculado.toFixed(2)}m)` : 'N/A'}\nRecomendação: Aguardar Preamar para manobra`}
                            className="text-[9px] px-1.5 py-0.5 rounded font-mono inline-flex items-center space-x-1 shrink-0 cursor-help border bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-500/40 font-bold max-w-full truncate"
                          >
                            <span>🌊⚠️</span>
                            <span className="truncate">{navio.restricao_mare.resumoAlerta}</span>
                          </span>
                        ) : divergencia?.temDivergencia ? (
                          <span
                            title={`Divergência de ETA:\nSISPORT (Oficial): ${formatarDataBr(navio.eta_previsto)}\nAIS (DataDocked): ${formatarDataBr(navio.eta_ais)}\n${divergencia.textoDetalhado}`}
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono inline-flex items-center space-x-1 shrink-0 cursor-help border max-w-full truncate ${
                              isOperating
                                ? 'bg-slate-100 text-slate-600 border border-slate-300 dark:bg-slate-800/80 dark:text-slate-400 dark:border-slate-700/60'
                                : `${divergencia.corBadge} font-bold`
                            }`}
                          >
                            <AlertTriangle className={`w-2.5 h-2.5 shrink-0 ${isOperating ? 'text-slate-500' : ''}`} />
                            <span className="truncate">{divergencia.textoResumo}</span>
                          </span>
                        ) : navio.ais_sincronizado_em ? (
                          <span className="text-[9px] font-mono text-emerald-600 dark:text-emerald-400/90 flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                            <span>AIS Conectado</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500">
                            Aguardando AIS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Informação de Carga, Volume, Sensibilidade à Chuva e Progresso Operacional */}
                  <div className="text-right shrink-0 pl-2 flex flex-col justify-center">
                    <div className="flex items-center justify-end space-x-1">
                      <span className="text-xs font-semibold text-slate-800 dark:text-cyan-300 block truncate max-w-[100px]" title={navio.mercadoria}>
                        {navio.mercadoria}
                      </span>
                      {isCargaSensivelChuva(navio.mercadoria) && (
                        <span
                          title="Granel sensível à água: operação sujeita a interrupção por fechamento de escotilhas sob chuva."
                          className="text-[9px] bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/80 dark:text-sky-300 dark:border-sky-500/30 px-1 py-0.2 rounded font-mono flex items-center space-x-0.5 shrink-0 cursor-help"
                        >
                          <span>🌧️</span>
                          <span className="hidden xl:inline text-[8px] font-semibold">Sensível</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {navio.volume_t.toLocaleString('pt-BR')} t
                    </span>
                    {isOperating && navio.progresso_operacao !== undefined && navio.progresso_operacao !== null && (
                      <div className="mt-1 flex flex-col items-end">
                        <div className="flex items-center space-x-1 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="text-[8.5px] text-slate-400 dark:text-slate-500 font-normal">Progresso:</span>
                          <span>{navio.progresso_operacao.toFixed(1).replace('.', ',')}%</span>
                        </div>
                        <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700/80 rounded-full overflow-hidden mt-0.5 shadow-inner" title={`Operação: ${navio.progresso_operacao.toFixed(1).replace('.', ',')}% concluída`}>
                          <div
                            className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, navio.progresso_operacao))}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Popover de Detalhes da Embarcação Projetado à Direita da Coluna Lateral (sobre Histórico Consumido) */}
                  {hoveredNavio?.id === navio.id && (
                    <div
                      className={`absolute left-full ml-3 w-80 rounded-lg bg-white/98 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700/80 p-3.5 shadow-2xl backdrop-blur-md z-50 pointer-events-auto text-left transition-all duration-150 ${
                        isNearBottom ? 'bottom-0' : 'top-0'
                      }`}
                    >
                      {/* Seta indicadora apontando para o cartão à esquerda */}
                      <div
                        className={`absolute -left-1.5 w-3 h-3 rotate-45 bg-white dark:bg-slate-900 border-l border-b border-slate-200 dark:border-slate-700/80 ${
                          isNearBottom ? 'bottom-8' : 'top-8'
                        }`}
                      />

                      {/* Cabeçalho do Popover */}
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/70 pb-2 mb-2.5">
                        <div className="flex items-center space-x-2 min-w-0">
                          <div
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                              navio.status_cor === 'VERDE'
                                ? 'bg-emerald-500 animate-pulse'
                                : navio.status_cor === 'VERMELHO'
                                ? 'bg-rose-500'
                                : 'bg-amber-500'
                            }`}
                          />
                          <div className="min-w-0">
                            <span className="font-bold text-slate-900 dark:text-white text-sm block truncate">{navio.nome_navio}</span>
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">IMO {navio.imo}</span>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            navio.status_cor === 'VERDE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'
                              : navio.status_cor === 'VERMELHO'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30'
                              : 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'
                          }`}
                        >
                          {navio.status_cor === 'VERDE'
                            ? 'Operando Real'
                            : navio.status_cor === 'VERMELHO'
                            ? 'No Fundeio Real'
                            : 'Fundeio Previsto'}
                        </span>
                      </div>

                      {/* Grade de Parâmetros Operacionais */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Carga / Volume:</span>
                          <span className="text-slate-900 dark:text-slate-100 font-semibold block truncate" title={navio.mercadoria}>
                            {navio.mercadoria}
                          </span>
                          <span className="text-blue-700 dark:text-cyan-300 text-[10px]">
                            {navio.volume_t.toLocaleString('pt-BR')} t
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Duração de Berço:</span>
                          <span className="text-blue-700 dark:text-cyan-300 font-bold block">
                            {navio.duracao_estimada_horas}h
                          </span>
                          <span className="text-slate-500 dark:text-slate-400 text-[9.5px]">
                            ({navio.duracao_base_horas}h op + 2h manobra)
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] block">ETA / Fundeio:</span>
                          <span className="text-slate-700 dark:text-slate-200 block text-[10px]">
                            {navio.chegada_fundeio
                              ? `Fundeio: ${new Date(navio.chegada_fundeio).toLocaleDateString('pt-BR')}`
                              : navio.eta_previsto
                              ? `ETA: ${new Date(navio.eta_previsto).toLocaleDateString('pt-BR')}`
                              : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 dark:text-slate-400 text-[10px] block">Janela Berço:</span>
                          <span className="text-blue-700 dark:text-blue-300 font-bold block text-[10px]">
                            {navio.inicio_atracacao ? new Date(navio.inicio_atracacao).toLocaleDateString('pt-BR') : '-'}
                            {' → '}
                            {navio.fim_atracacao ? new Date(navio.fim_atracacao).toLocaleDateString('pt-BR') : '-'}
                          </span>
                        </div>
                        {isOperating && navio.progresso_operacao !== undefined && navio.progresso_operacao !== null && (
                          <div className="col-span-2 pt-1.5 border-t border-slate-200 dark:border-slate-700/60">
                            <div className="flex items-center justify-between text-[10.5px] font-mono">
                              <span className="text-slate-500 dark:text-slate-400">Progresso da Operação (SISPORT):</span>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                {navio.progresso_operacao.toFixed(1).replace('.', ',')}%
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-1 shadow-inner">
                              <div
                                className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-300"
                                style={{ width: `${Math.min(100, Math.max(0, navio.progresso_operacao))}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Informações Complementares: Sincronização AIS e Restrição de Maré */}
                      {navio.ais_sincronizado_em && (
                        <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                          <span>Última Sincronização AIS:</span>
                          <span className="text-blue-700 dark:text-cyan-300 font-semibold font-mono">{formatSyncDate(navio.ais_sincronizado_em)}</span>
                        </div>
                      )}

                      {navio.restricao_mare?.temRestricao && (
                        <div className="mt-2 pt-1.5 border-t border-slate-200 dark:border-slate-700/60 text-[10px] bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-200 dark:border-amber-500/30">
                          <div className="flex items-center space-x-1.5 text-amber-800 dark:text-amber-300 font-bold">
                            <span>🌊⚠️</span>
                            <span>Restrição de Maré (DHN São Sebastião):</span>
                          </div>
                          <div className="text-slate-700 dark:text-slate-300 mt-1 leading-snug">
                            {navio.restricao_mare.resumoAlerta}
                          </div>
                          {navio.restricao_mare.atracacao?.proximaPreamar && (
                            <div className="text-blue-700 dark:text-cyan-300 text-[9.5px] mt-1 font-semibold flex items-center space-x-1">
                              <span>💡</span>
                              <span>Janela Segura Recomendada: {navio.restricao_mare.atracacao.proximaPreamar.label}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Área da Linha do Tempo (Gantt Track) com Blocos Discretos e Micro-Labels Inteligentes */}
                <div className="flex-1 relative flex items-center h-full">
                  {/* Badge de Navios com Operação Projetada para Além do Horizonte Visível */}
                  {(() => {
                    const blocks = navio.blocos || [];
                    const visibleBlocks = blocks.filter((b) => {
                      const bStart = parseDateToMs(b.inicioIso);
                      const bEnd = parseDateToMs(b.fimIso);
                      return !isNaN(bStart) && !isNaN(bEnd) && bEnd > timelineStart.getTime() && bStart < timelineEnd.getTime();
                    });
                    const inicioMs = parseDateToMs(navio.inicio_atracacao);
                    const isFuture = visibleBlocks.length === 0 && (
                      (!isNaN(inicioMs) && inicioMs >= timelineEnd.getTime()) ||
                      (blocks.length > 0 && blocks.every((b) => parseDateToMs(b.inicioIso) >= timelineEnd.getTime()))
                    );

                    if (!isFuture) return null;

                    const calado = navio.calado || 0;
                    const isRestritoCalado = calado > 9.50;
                    const dataFormatada = navio.inicio_atracacao
                      ? new Date(navio.inicio_atracacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                      : navio.eta_previsto
                      ? `ETA ${new Date(navio.eta_previsto).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
                      : 'Futuro';

                    if (isRestritoCalado) {
                      return (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center space-x-1.5 bg-red-50 border border-red-300 text-red-800 dark:bg-red-950/80 dark:border-red-500/70 px-2.5 py-1 rounded text-[11px] dark:text-red-200 shadow-md backdrop-blur-sm animate-pulse">
                          <span className="text-amber-500 font-bold text-xs">⚠️</span>
                          <span className="font-semibold text-red-700 dark:text-red-300">Restrito por Calado ({calado.toFixed(1)}m):</span>
                          <strong className="text-slate-900 dark:text-white font-mono font-bold">{dataFormatada}</strong>
                        </div>
                      );
                    }

                    return (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center space-x-1.5 bg-white/95 border border-slate-200 text-slate-700 dark:bg-slate-800/85 dark:border-slate-700/70 px-2.5 py-1 rounded text-[11px] dark:text-slate-300 shadow-md backdrop-blur-sm">
                        <span className="text-blue-600 dark:text-cyan-400 font-extrabold text-xs">❯❯</span>
                        <span className="text-slate-500 dark:text-slate-400">Operação projetada para:</span>
                        <strong className="text-slate-900 dark:text-slate-100 font-mono font-bold">{dataFormatada}</strong>
                      </div>
                    );
                  })()}

                  {navio.blocos && navio.blocos.length > 0 ? (
                    navio.blocos.map((bloco, bIdx) => {
                      const bStartMs = parseDateToMs(bloco.inicioIso);
                      const bEndMs = parseDateToMs(bloco.fimIso);
                      if (isNaN(bStartMs) || isNaN(bEndMs)) return null;

                      // Não renderiza se o bloco estiver completamente fora da escala selecionada
                      if (bEndMs <= timelineStart.getTime() || bStartMs >= timelineEnd.getTime()) {
                        return null;
                      }

                      const leftPct = Math.max(0, Math.min(100, ((bStartMs - timelineStart.getTime()) / totalMs) * 100));
                      const rightPct = Math.max(0, Math.min(100, ((bEndMs - timelineStart.getTime()) / totalMs) * 100));
                      const widthPct = Math.max(0.4, rightPct - leftPct);
                      const blockPx = (widthPct / 100) * trackWidthPx;
                      const isUltraShort = blockPx < 15;
                      const overflowsRight = bEndMs > timelineEnd.getTime();

                      if (rightPct <= 0 || leftPct >= 100) return null;

                      const isCaladoCritico = bloco.caladoCritico || ((navio.calado || 0) > 9.50 && (bloco.tipo === 'AZUL' || bloco.tipo === 'VERDE'));

                      // Estilização semântica rigorosa conforme padronização CCO
                      let blockStyle = '';
                      let heightClass = 'h-10';
                      let roundedClass = overflowsRight ? 'rounded-l-lg rounded-r-none' : 'rounded-lg';

                      if (isCaladoCritico) {
                        blockStyle = 'border-red-400 text-white shadow-lg shadow-red-950/40 ring-1 ring-red-400 font-extrabold';
                      } else if (bloco.tipo === 'VERDE') {
                        // Operando Real (Passado até Now)
                        blockStyle = 'bg-emerald-600 border-emerald-300 text-white shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-400';
                        roundedClass = overflowsRight
                          ? 'rounded-l-lg rounded-r-none'
                          : navio.blocos?.some((b) => b.tipo === 'AZUL')
                          ? 'rounded-l-lg'
                          : 'rounded-lg';
                      } else if (bloco.tipo === 'AZUL') {
                        // Previsão de Operação / Término (Now até ETD ou Início até Fim de Cais)
                        blockStyle = 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/25';
                        roundedClass = overflowsRight
                          ? 'rounded-r-none'
                          : (isOperating || navio.blocos?.some((b) => b.tipo === 'LARANJA' || b.tipo === 'VERMELHO'))
                          ? 'rounded-r-lg'
                          : 'rounded-lg';
                      } else if (bloco.tipo === 'VERMELHO') {
                        // No Fundeio Real (AIS Barra)
                        blockStyle = 'bg-rose-600 border-rose-400 text-white shadow-md shadow-rose-600/20';
                        heightClass = 'h-8';
                        roundedClass = overflowsRight ? 'rounded-l-lg rounded-r-none' : 'rounded-lg';
                      } else if (bloco.tipo === 'LARANJA') {
                        // Fundeio Previsto / Projetado (Espera até atracação)
                        blockStyle = 'bg-amber-500 border-amber-300 text-slate-950 shadow-md shadow-amber-500/20 font-semibold';
                        heightClass = 'h-8';
                        roundedClass = overflowsRight ? 'rounded-l-lg rounded-r-none' : 'rounded-lg';
                      }

                      const ultraShortStyle = isUltraShort
                        ? 'border-x-2 border-cyan-300 shadow-[0_0_8px_rgba(59,130,246,0.6)] ring-1 ring-cyan-400'
                        : '';

                      return (
                        <div
                          key={`block-${navio.id}-${bIdx}`}
                          className={`absolute ${heightClass} border flex items-center justify-between px-1.5 text-xs font-bold transition-all z-10 hover:brightness-110 overflow-hidden ${roundedClass} ${blockStyle} ${ultraShortStyle}`}
                          style={{
                            left: `${leftPct}%`,
                            width: `${widthPct}%`,
                            minWidth: '10px',
                            ...(isCaladoCritico
                              ? {
                                  backgroundImage: 'repeating-linear-gradient(45deg, #dc2626, #dc2626 10px, #991b1b 10px, #991b1b 20px)'
                                }
                              : {})
                          }}
                        >
                          {/* Micro-Labels Inteligentes por Largura em Pixels e Semântica de CCO */}
                          {isUltraShort ? null : bloco.tipo === 'VERDE' ? (
                            /* Bloco Verde (Operando Real): Limiar cirúrgico de 70px sem truncamento */
                            blockPx < 70 ? (
                              <span className="font-mono font-black text-center w-full text-[10px] tracking-tight">
                                {Number(bloco.duracaoHoras).toFixed(1)}h
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-1.5 w-full text-center whitespace-nowrap px-1">
                                <span className="text-xs shrink-0">🟢</span>
                                <span className="tracking-tight uppercase text-[10px] font-extrabold">Operando</span>
                                {navio.progresso_operacao !== undefined && navio.progresso_operacao !== null && (
                                  <>
                                    <span className="opacity-60 text-white">•</span>
                                    <span className="font-mono font-black text-[10px] bg-emerald-700/80 px-1 py-0.2 rounded shrink-0">
                                      {navio.progresso_operacao.toFixed(1).replace('.', ',')}%
                                    </span>
                                  </>
                                )}
                                <span className="opacity-60 text-white">•</span>
                                <span className="font-mono font-black text-[10px] shrink-0">{Number(bloco.duracaoHoras).toFixed(1)}h</span>
                              </div>
                            )
                          ) : (bloco.tipo === 'LARANJA' || bloco.tipo === 'VERMELHO') ? (
                            /* Blocos de Fundeio (Real ou Previsto): Rótulo unificado centralizado com recuo de segurança */
                            blockPx < 55 ? (
                              <span className="font-mono font-black text-center w-full text-[10px] tracking-tight">
                                {Number(bloco.duracaoHoras).toFixed(1)}h
                              </span>
                            ) : blockPx < 110 ? (
                              <div className={`flex items-center justify-center gap-1 w-full text-center whitespace-nowrap px-3 overflow-hidden ${overflowsRight ? 'pr-8' : ''}`}>
                                <span className="tracking-tight uppercase text-[9.5px] font-bold">
                                  {bloco.tipo === 'VERMELHO' ? 'Fundeio' : 'Fundeio'}
                                </span>
                                <span className="opacity-60 text-white">•</span>
                                <span className="font-mono font-black text-[9.5px] shrink-0">{Number(bloco.duracaoHoras).toFixed(1)}h</span>
                              </div>
                            ) : (
                              <div className={`flex items-center justify-center gap-1.5 w-full text-center px-3 whitespace-nowrap overflow-hidden ${overflowsRight ? 'pr-8' : ''}`}>
                                <span className="shrink-0 text-xs">
                                  {bloco.tipo === 'VERMELHO' ? '🔴' : '🟠'}
                                </span>
                                <span className="tracking-tight uppercase text-[10.5px] font-bold">
                                  {bloco.tipo === 'VERMELHO' ? 'Fundeio Real' : 'Fundeio Previsto'}
                                </span>
                                <span className="opacity-60 text-white">•</span>
                                <span className="font-mono font-black shrink-0 text-[10.5px]">{Number(bloco.duracaoHoras).toFixed(1)}h</span>
                              </div>
                            )
                          ) : blockPx < 50 ? (
                            /* Largura Compacta (< 50px) para Azul/Restrito: Apenas número */
                            <span className="font-mono font-black text-center w-full text-[10px] tracking-tight">
                              {Number(bloco.duracaoHoras).toFixed(1)}h
                            </span>
                          ) : blockPx < 115 ? (
                            /* Largura Média Curta (50px a 115px) para Azul/Restrito */
                            <div className={`flex items-center justify-center gap-1 w-full px-2 text-[10px] font-bold whitespace-nowrap overflow-hidden ${overflowsRight ? 'pr-8' : ''}`}>
                              <span className="tracking-tight uppercase">
                                {isCaladoCritico
                                  ? 'RESTRITO'
                                  : isOperating
                                  ? 'TÉRMINO'
                                  : 'OPERAÇÃO'}
                              </span>
                              <span className="opacity-60 text-white">•</span>
                              <span className="font-mono font-black shrink-0">{Number(bloco.duracaoHoras).toFixed(1)}h</span>
                            </div>
                          ) : (
                            /* Largura Ampla para Azul/Restrito: Rótulo compacto sem reticências */
                            <div className={`flex items-center justify-center gap-1.5 w-full px-3 text-center whitespace-nowrap overflow-hidden ${overflowsRight ? 'pr-8' : ''}`}>
                              <span className="shrink-0 text-xs">
                                {isCaladoCritico ? '⚠️' : '🔵'}
                              </span>
                              <span className="tracking-tight uppercase text-[10.5px] font-bold">
                                {isCaladoCritico
                                  ? `[RESTRITO >9.5m]`
                                  : isOperating
                                  ? `Término ${navio.nome_navio}`
                                  : `Operação`}
                              </span>
                              <span className="opacity-60 text-white shrink-0">•</span>
                              <span className="font-mono font-black shrink-0 text-[10.5px]">{Number(bloco.duracaoHoras).toFixed(1)}h</span>
                              {navio.horas_chuva && navio.horas_chuva > 0 ? (
                                <span className="bg-sky-900/60 text-sky-200 border border-sky-400/40 text-[9px] px-1.5 py-0.5 rounded flex items-center space-x-1 font-mono shrink-0 ml-1">
                                  <CloudRain className="w-2.5 h-2.5 text-sky-300" />
                                  <span>+{navio.horas_chuva}h</span>
                                </span>
                              ) : null}
                              {navio.restricao_mare?.temRestricao && !isCaladoCritico && (
                                <span
                                  className="bg-amber-950/85 text-amber-300 border border-amber-400/50 text-[9px] px-1.5 py-0.2 rounded flex items-center space-x-0.5 font-mono font-bold shrink-0 animate-pulse ml-1"
                                  title={navio.restricao_mare.resumoAlerta}
                                >
                                  <span>🌊⚠️</span>
                                  <span>Maré</span>
                                </span>
                              )}
                            </div>
                          )}

                          {/* Indicador de Continuidade para Barras que Sangram a Borda da Escala */}
                          {overflowsRight && (
                            <span
                              className="absolute right-2 top-1/2 -translate-y-1/2 font-black text-[11px] text-white/95 drop-shadow-md pointer-events-none select-none tracking-tighter"
                              title="Continua além da escala visível"
                            >
                              ❯❯
                            </span>
                          )}
                        </div>
                      );
                    })
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rodapé CCO: Indicadores Operacionais e Taxa de Ocupação */}
      <div className="bg-white dark:bg-cco-panel border-t border-slate-200 dark:border-cco-border px-6 py-2.5 flex items-center justify-between shadow-lg z-20 shrink-0">
        <div className="flex items-center space-x-6">
          {/* Total de Embarcações */}
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 dark:bg-cyan-500/10 dark:border-cyan-500/20 dark:text-cyan-400">
              <Ship className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Total no Line-up
              </span>
              <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                {operacional?.total_navios ?? navios.length} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">navios</span>
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-cco-border"></div>

          {/* Em Operação (Verde) */}
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-400">
              <Anchor className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Operando no Berço
              </span>
              <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
                {operacional?.navios_em_operacao ?? (navios.filter(n => n.status_cor === 'VERDE').length)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">ativo</span>
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-cco-border"></div>

          {/* No Fundeio / Barra */}
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Fundeio / Espera
              </span>
              <span className="text-base font-extrabold text-amber-600 dark:text-amber-300 font-mono">
                {operacional?.navios_fundeados ?? (navios.filter(n => n.status_cor !== 'VERDE').length)} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">aguardando</span>
              </span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-cco-border"></div>

          {/* Volume Total */}
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Carga Total Programada
              </span>
              <span className="text-base font-extrabold text-blue-700 dark:text-blue-300 font-mono">
                {(operacional?.volume_total_t ?? navios.reduce((acc, n) => acc + n.volume_t, 0)).toLocaleString('pt-BR')} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">t</span>
              </span>
            </div>
          </div>
        </div>

        {/* Taxa de Ocupação do Berço & Backlog da Fila */}
        <div
          className="flex items-center space-x-4 group/ocupacao relative cursor-help"
          title={tooltipAuditoria}
        >
          <div className="text-right">
            <div className="flex items-center justify-end space-x-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Clock className="w-3.5 h-3.5 text-blue-600 dark:text-cyan-400 shrink-0" />
              <span>Ocupação do Berço (Janela 30D)</span>
            </div>
            <div className="flex items-baseline justify-end space-x-2">
              <span className="text-base font-extrabold text-blue-700 dark:text-cyan-300 font-mono">
                {ocupacaoJanela30d}%
              </span>
            </div>
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5 whitespace-nowrap">
              <span>Fila Total: </span>
              <strong className="text-slate-800 dark:text-slate-200">{totalHorasBacklogStr}h</strong>
              <span> • Demanda: </span>
              <strong className="text-amber-600 dark:text-amber-300">{demandaPercentualStr}%</strong>
              <span className="text-slate-500 dark:text-slate-400"> (~{diasCaisEstimados} dias de cais)</span>
            </div>
          </div>

          {/* Barra de progresso da ocupação com Tooltip de Auditoria */}
          <div
            className="w-32 bg-slate-100 dark:bg-cco-darkest h-3 rounded-full border border-slate-300 dark:border-cco-border overflow-hidden p-0.5 relative cursor-help"
            title={tooltipAuditoria}
          >
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-emerald-500 dark:from-cyan-500 dark:to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${ocupacaoJanela30d}%` }}
            />
          </div>

          {/* Tooltip de Auditoria Flutuante no Hover */}
          <div className="absolute right-0 bottom-full mb-2.5 hidden group-hover/ocupacao:flex items-center space-x-2 bg-white dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs px-3 py-1.5 rounded-lg shadow-2xl backdrop-blur-md whitespace-nowrap z-50 pointer-events-none animate-in fade-in duration-150">
            <span className="text-blue-600 dark:text-cyan-400 font-bold">ℹ️</span>
            <span>{tooltipAuditoria}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
