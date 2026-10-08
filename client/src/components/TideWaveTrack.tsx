import React, { useMemo } from 'react';
import { renderTideWaveSvg, type ExtremoMare } from '../utils/tideWaveRenderer';
import { useTheme } from '../context/ThemeContext';

interface TideWaveTrackProps {
  extremos: ExtremoMare[];
  timelineStartMs: number;
  timelineEndMs: number;
  widthPx: number;
  escalaDias?: number;
  heightPx?: number;
}

export const TideWaveTrack: React.FC<TideWaveTrackProps> = ({
  extremos,
  timelineStartMs,
  timelineEndMs,
  widthPx,
  escalaDias = 7,
  heightPx = 50
}) => {
  const { theme } = useTheme();

  const svgHtml = useMemo(() => {
    return renderTideWaveSvg(
      extremos,
      timelineStartMs,
      timelineEndMs,
      widthPx,
      escalaDias,
      heightPx,
      theme
    );
  }, [extremos, timelineStartMs, timelineEndMs, widthPx, escalaDias, heightPx, theme]);

  if (!svgHtml) {
    return null;
  }

  return (
    <div
      className="w-full h-full relative overflow-visible pointer-events-auto"
      dangerouslySetInnerHTML={{ __html: svgHtml }}
    />
  );
};
