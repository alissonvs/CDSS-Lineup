/**
 * Utilitário para validação e detecção de divergência entre a previsão oficial do SISPORT
 * e a previsão reportada pelo transponder AIS via DataDocked.
 */

export interface DivergenciaEta {
  temDivergencia: boolean;
  diferencaHoras: number;
  diferencaDias: number;
  tempoFormatado: string;
  textoResumo: string;
  textoDetalhado: string;
  tipoAlerta: 'atraso' | 'adiantado' | 'alinhado' | 'desatualizado';
  corBadge: string;
  corBorda: string;
  corFundo: string;
}

/**
 * Compara o ETA Oficial da Autoridade Portuária (SISPORT) com o ETA reportado no AIS (DataDocked)
 * Retorna null se uma das datas não estiver disponível.
 */
export function verificarDivergenciaEta(
  etaSisport?: string | null,
  etaAis?: string | null
): DivergenciaEta | null {
  if (!etaSisport || !etaAis) return null;

  const dSisport = new Date(etaSisport);
  const dAis = new Date(etaAis);

  if (isNaN(dSisport.getTime()) || isNaN(dAis.getTime())) return null;

  const diffMs = dAis.getTime() - dSisport.getTime();
  const diffHoras = Math.round(diffMs / (1000 * 60 * 60));
  const absHoras = Math.abs(diffHoras);
  const diffDias = absHoras >= 24 ? Math.floor(absHoras / 24) : 0;
  const remHoras = absHoras % 24;

  let tempoFormatado = '';
  if (diffDias > 0) {
    tempoFormatado = remHoras > 0 ? `${diffDias}d ${remHoras}h` : `${diffDias}d`;
  } else {
    tempoFormatado = `${absHoras}h`;
  }

  // Margem de tolerância: diferenças menores que 2 horas são consideradas alinhadas
  if (absHoras < 2) {
    return {
      temDivergencia: false,
      diferencaHoras: diffHoras,
      diferencaDias: 0,
      tempoFormatado,
      textoResumo: 'ETAs alinhados',
      textoDetalhado: 'A previsão oficial do SISPORT e a telemetria AIS estão em conformidade (menos de 2h de diferença).',
      tipoAlerta: 'alinhado',
      corBadge: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30',
      corBorda: 'border-emerald-500/30',
      corFundo: 'bg-emerald-950/30'
    };
  }

  // Se a discrepância for superior a 30 dias ou a data do AIS for muito anterior à atual,
  // trata-se de transponder desatualizado a bordo (viagem anterior ainda não reprogramada)
  const agora = Date.now();
  const aisPassadoDias = (agora - dAis.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDias > 30 || aisPassadoDias > 15) {
    return {
      temDivergencia: true,
      diferencaHoras: diffHoras,
      diferencaDias: diffDias,
      tempoFormatado,
      textoResumo: 'AIS Desatualizado',
      textoDetalhado: `O transponder AIS reporta data muito divergente (${formatarDataBr(etaAis)}), indicando que o equipamento a bordo não foi atualizado pela tripulação para esta viagem.`,
      tipoAlerta: 'desatualizado',
      corBadge: 'text-amber-400 bg-amber-950/70 border-amber-500/40',
      corBorda: 'border-amber-500/40',
      corFundo: 'bg-amber-950/30'
    };
  }

  if (diffHoras > 0) {
    // Navio chegará DEPOIS do programado pelo porto
    return {
      temDivergencia: true,
      diferencaHoras: diffHoras,
      diferencaDias: diffDias,
      tempoFormatado,
      textoResumo: `Atraso: +${tempoFormatado}`,
      textoDetalhado: `O transponder AIS informa chegada ${tempoFormatado} após a programação oficial do SISPORT.`,
      tipoAlerta: 'atraso',
      corBadge: 'text-amber-400 bg-amber-950/70 border-amber-500/40',
      corBorda: 'border-amber-500/40',
      corFundo: 'bg-amber-950/30'
    };
  } else {
    // Navio chegará ANTES do programado pelo porto
    return {
      temDivergencia: true,
      diferencaHoras: diffHoras,
      diferencaDias: diffDias,
      tempoFormatado,
      textoResumo: `Adiantado: -${tempoFormatado}`,
      textoDetalhado: `O transponder AIS informa chegada ${tempoFormatado} antes da programação oficial do SISPORT.`,
      tipoAlerta: 'adiantado',
      corBadge: 'text-cyan-400 bg-cyan-950/70 border-cyan-500/40',
      corBorda: 'border-cyan-500/40',
      corFundo: 'bg-cyan-950/30'
    };
  }
}

/**
 * Formata data e hora no padrão brasileiro (DD/MM/AAAA às HH:mm)
 */
export function formatarDataBr(dateStr?: string | null): string {
  if (!dateStr) return 'Não informado';
  try {
    const d = new Date(dateStr);
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
        minute: '2-digit'
      })
    );
  } catch {
    return dateStr;
  }
}
