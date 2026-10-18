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
 * Converte qualquer string de data (ISO UTC com Z, offset +/-, ou string local)
 * para um Date com garantia de fuso horário de Brasília (UTC-3) quando não especificado.
 */
export function parseDateSafe(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const s = dateStr.trim();
  if (!s) return null;
  if (s.endsWith('Z') || s.includes('+') || (s.lastIndexOf('-') > 7)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const iso = s.includes('T') ? s : s.replace(' ', 'T');
  const d = new Date(`${iso}-03:00`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Converte data ISO (mesmo em UTC Z) para o formato esperado pelo <input type="datetime-local">
 * no fuso horário local do navegador (YYYY-MM-DDTHH:mm).
 */
export function toLocalDateTimeInput(dateStr?: string | null): string {
  if (!dateStr) return '';
  const s = dateStr.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return s.slice(0, 16);
  }
  const d = parseDateSafe(s);
  if (!d || isNaN(d.getTime())) return s.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

  const dSisport = parseDateSafe(etaSisport);
  const dAis = parseDateSafe(etaAis);

  if (!dSisport || !dAis || isNaN(dSisport.getTime()) || isNaN(dAis.getTime())) return null;

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
 * Garante que qualquer entrada (UTC Z ou local) seja convertida e expressa no Horário de Brasília (BRT).
 */
export function formatarDataBr(dateStr?: string | null, incluirFuso = false): string {
  if (!dateStr) return 'Não informado';
  try {
    const d = parseDateSafe(dateStr);
    if (!d || isNaN(d.getTime())) return dateStr;
    const base = (
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
    return incluirFuso ? `${base} (BRT)` : base;
  } catch {
    return dateStr;
  }
}

/**
 * Formata data e hora no padrão conciso brasileiro (DD/MM HH:mm) para uso em cards compactos
 */
export function formatarDataHoraCurta(dateStr?: string | null): string {
  if (!dateStr) return '-';
  try {
    const d = parseDateSafe(dateStr);
    if (!d || isNaN(d.getTime())) return dateStr;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dia}/${mes} ${hora}:${min}`;
  } catch {
    return dateStr;
  }
}
