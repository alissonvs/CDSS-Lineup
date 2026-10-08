/**
 * Utilitário de Renderização da Mini-Curva Contínua de Maré (SVG Sparkline Sinusoidal)
 * PCS Lineup - Porto de São Sebastião
 * 
 * Interpolação de Maré via Cosseno a cada 20 minutos a partir dos extremos astronômicos da DHN (Estação 40165)
 * Fórmula clássica de maré:
 * h(t) = h1 + (h2 - h1) * (1 - cos(pi * (t - t1) / (t2 - t1))) / 2
 */

export interface ExtremoMare {
  timestampMs: number;
  alturaMetros: number;
  tipo: 'PREAMAR' | 'BAIXAMAR';
  horaFormatada: string; // Ex: "11:00"
}

export function renderTideWaveSvg(
  extremos: ExtremoMare[],
  startMs: number,
  endMs: number,
  widthPx: number,
  escalaDias: number = 7,
  heightPx: number = 50,
  theme: 'light' | 'dark' = 'dark'
): string {
  if (!extremos || extremos.length < 2 || widthPx <= 0) return '';

  const totalMs = endMs - startMs;
  if (totalMs <= 0) return '';

  const H_MIN = 0.0;
  const H_MAX = 1.6;

  // Padding vertical para evitar colisões no topo e na base
  const PADDING_TOP = 10;
  const PADDING_BOTTOM = 12;
  const usableHeight = heightPx - PADDING_TOP - PADDING_BOTTOM;

  // Mapeamento Y com margem de respiro calibrada
  const getY = (h: number) => {
    const clamped = Math.max(H_MIN, Math.min(H_MAX, h));
    return heightPx - PADDING_BOTTOM - (((clamped - H_MIN) / (H_MAX - H_MIN)) * usableHeight);
  };

  const getX = (t: number) => ((t - startMs) / totalMs) * widthPx;

  // Ordena os extremos cronologicamente e filtra duplicatas espúrias em janela inferior a 15min
  const sortedExtremos = [...extremos]
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .filter((e, idx, arr) => idx === 0 || Math.abs(e.timestampMs - arr[idx - 1].timestampMs) > 15 * 60 * 1000);

  if (sortedExtremos.length < 2) return '';

  // 1. Amostragem interpolada suave a cada 20 minutos
  const stepMs = 20 * 60 * 1000;
  const timeSet = new Set<number>();
  for (let t = startMs; t <= endMs; t += stepMs) {
    timeSet.add(t);
  }
  timeSet.add(endMs);

  sortedExtremos.forEach((e) => {
    if (e.timestampMs >= startMs && e.timestampMs <= endMs) {
      timeSet.add(e.timestampMs);
    }
  });

  const sortedTimes = Array.from(timeSet).sort((a, b) => a - b);
  const points: { x: number; y: number }[] = [];

  for (const t of sortedTimes) {
    let prev = sortedExtremos[0];
    let next = sortedExtremos[sortedExtremos.length - 1];

    if (t <= sortedExtremos[0].timestampMs) {
      prev = sortedExtremos[0];
      next = sortedExtremos[1] || sortedExtremos[0];
    } else if (t >= sortedExtremos[sortedExtremos.length - 1].timestampMs) {
      prev = sortedExtremos[sortedExtremos.length - 2] || sortedExtremos[sortedExtremos.length - 1];
      next = sortedExtremos[sortedExtremos.length - 1];
    } else {
      for (let i = 0; i < sortedExtremos.length - 1; i++) {
        if (t >= sortedExtremos[i].timestampMs && t <= sortedExtremos[i + 1].timestampMs) {
          prev = sortedExtremos[i];
          next = sortedExtremos[i + 1];
          break;
        }
      }
    }

    const span = next.timestampMs - prev.timestampMs;
    const tNorm = span > 0 ? Math.max(0, Math.min(1, (t - prev.timestampMs) / span)) : 0;
    const cosFactor = (1 - Math.cos(tNorm * Math.PI)) / 2;
    const hInterp = prev.alturaMetros + (next.alturaMetros - prev.alturaMetros) * cosFactor;

    points.push({ x: getX(t), y: getY(hInterp) });
  }

  if (points.length === 0) return '';

  // 2. Construção dos caminhos Path do SVG
  let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }

  const fillD = `${pathD} L ${widthPx.toFixed(1)} ${heightPx} L 0 ${heightPx} Z`;
  const yRef100 = getY(1.0); // Linha de segurança náutica (1.00m)

  // 3. Renderização de marcadores e rótulos (com condicional de escala: somente em 7D)
  const exibirRotulosTexto = escalaDias === 7;

  const isLight = theme === 'light';
  const textStrokeColor = isLight ? '#ffffff' : '#070d18';
  const circleStrokeColor = isLight ? '#ffffff' : '#070d18';
  const lineColor = isLight ? '#1E3A8A' : '#38bdf8'; // DESIGN.md: Deep Marine Navy #1E3A8A in light
  const gradientColor = isLight ? '#06b6d4' : '#38bdf8';
  const gradientOpacity = isLight ? 0.28 : 0.22;
  const refLineColor = isLight ? 'rgba(71, 85, 105, 0.35)' : 'rgba(148, 163, 184, 0.22)';
  const refTextColor = isLight ? 'rgba(71, 85, 105, 0.7)' : 'rgba(148, 163, 184, 0.4)';

  const markersHtml = sortedExtremos
    .filter((e) => e.timestampMs >= startMs && e.timestampMs <= endMs)
    .map((e) => {
      const cx = getX(e.timestampMs);
      const cy = getY(e.alturaMetros);
      const isHigh = e.tipo === 'PREAMAR';
      const color = isHigh ? (isLight ? '#0284c7' : '#38bdf8') : (isLight ? '#d97706' : '#f59e0b');

      // Rótulo compacto: apenas a cota, sem o horário entre parênteses
      const label = `${isHigh ? '▲' : '▼'}${e.alturaMetros.toFixed(2)}m`;
      const textY = isHigh ? cy - 6 : cy + 13;
      const tooltip = `${isHigh ? 'Preamar' : 'Baixa-mar'}: ${e.alturaMetros.toFixed(2)}m às ${e.horaFormatada} BRT`;

      return `
        <g class="tide-point cursor-pointer group" data-tide="${tooltip}">
          <title>${tooltip}</title>
          <circle
            cx="${cx.toFixed(1)}"
            cy="${cy.toFixed(1)}"
            r="${exibirRotulosTexto ? '3.5' : '2.5'}"
            fill="${color}"
            stroke="${circleStrokeColor}"
            stroke-width="1.5"
          />
          ${
            exibirRotulosTexto
              ? `<text
                  x="${cx.toFixed(1)}"
                  y="${textY.toFixed(1)}"
                  text-anchor="middle"
                  fill="${color}"
                  font-size="9.5"
                  font-family="monospace"
                  font-weight="700"
                  letter-spacing="-0.3px"
                  paint-order="stroke fill"
                  stroke="${textStrokeColor}"
                  stroke-width="3.5"
                  stroke-linejoin="round"
                  style="paint-order: stroke fill; stroke: ${textStrokeColor}; stroke-width: 3.5px; stroke-linejoin: round;"
                  class="select-none pointer-events-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]"
                >${label}</text>`
              : ''
          }
        </g>
      `;
    })
    .join('');

  return `
    <svg width="${widthPx}" height="${heightPx}" class="overflow-visible block w-full select-none" viewBox="0 0 ${widthPx} ${heightPx}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tideGradientRefined" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${gradientColor}" stop-opacity="${gradientOpacity}" />
          <stop offset="100%" stop-color="${gradientColor}" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <!-- Linha tracejada de cota segura: 1.00m -->
      <line
        x1="0"
        y1="${yRef100.toFixed(1)}"
        x2="${widthPx.toFixed(1)}"
        y2="${yRef100.toFixed(1)}"
        stroke="${refLineColor}"
        stroke-dasharray="3,3"
      />
      <text
        x="6"
        y="${(yRef100 - 3).toFixed(1)}"
        fill="${refTextColor}"
        font-size="8"
        font-family="monospace"
        font-weight="bold"
        class="select-none pointer-events-none"
      >Ref 1.00m</text>
      <!-- Gradiente vertical preenchido -->
      <path d="${fillD}" fill="url(#tideGradientRefined)" />
      <!-- Linha contínua da maré -->
      <path
        d="${pathD}"
        fill="none"
        stroke="${lineColor}"
        stroke-width="${isLight ? '2.0' : '1.5'}"
        stroke-linejoin="round"
      />
      <!-- Pontos de inflexão e rótulos -->
      ${markersHtml}
    </svg>
  `;
}
