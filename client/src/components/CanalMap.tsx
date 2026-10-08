import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useTheme } from '../context/ThemeContext';
import type { NavioLineup, StatusCor } from '../types';

interface CanalMapProps {
  navios: NavioLineup[];
  onSelectNavio: (navio: NavioLineup) => void;
}

type BasemapStyle = 'dark' | 'voyager' | 'positron' | 'satellite';

const CARTO_KEY = (import.meta.env.VITE_CARTO_API_KEY || import.meta.env.CARTO_API_KEY || '') as string;

interface BasemapOption {
  id: BasemapStyle;
  name: string;
  icon: string;
  url: string;
  subdomains?: string;
  attribution: string;
  maxZoom: number;
}

const BASEMAP_OPTIONS: Record<BasemapStyle, BasemapOption> = {
  dark: {
    id: 'dark',
    name: 'Dark Matter',
    icon: '🌙',
    url: `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    maxZoom: 20
  },
  voyager: {
    id: 'voyager',
    name: 'Voyager Náutico',
    icon: '🧭',
    url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    maxZoom: 20
  },
  positron: {
    id: 'positron',
    name: 'Positron Claro',
    icon: '☀️',
    url: `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`,
    subdomains: 'abcd',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>',
    maxZoom: 20
  },
  satellite: {
    id: 'satellite',
    name: 'Satélite HD',
    icon: '🛰️',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &bull; Earthstar Geographics',
    maxZoom: 19
  }
};

export const CanalMap: React.FC<CanalMapProps> = ({ navios, onSelectNavio }) => {
  const { theme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const apoLayerRef = useRef<L.GeoJSON | null>(null);

  const [activeBasemap, setActiveBasemap] = useState<BasemapStyle>(theme === 'light' ? 'positron' : 'dark');
  const [showApo, setShowApo] = useState<boolean>(true);
  const [apoTotalAnexos, setApoTotalAnexos] = useState<number>(13);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  // Sincroniza o basemap quando o tema geral for alternado
  useEffect(() => {
    if (theme === 'light' && activeBasemap === 'dark') {
      setActiveBasemap('positron');
    } else if (theme === 'dark' && activeBasemap === 'positron') {
      setActiveBasemap('dark');
    }
  }, [theme]);

  // 1. Inicializa o mapa Leaflet
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Coordenadas centrais estratégicas do Canal de São Sebastião: [-23.8045, -45.3970]
    const map = L.map(mapContainerRef.current, {
      center: [-23.8045, -45.3970],
      zoom: 12,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // TileLayer inicial (Dark Matter com a chave autenticada do CARTO)
    const initialConfig = BASEMAP_OPTIONS.dark;
    const initialTileLayer = L.tileLayer(initialConfig.url, {
      maxZoom: initialConfig.maxZoom,
      subdomains: initialConfig.subdomains || 'abc',
      attribution: initialConfig.attribution
    }).addTo(map);

    tileLayerRef.current = initialTileLayer;

    // 2. Carrega a Poligonal Oficial do Porto Organizado (GeoJSON extraído do KMZ - Portaria 501/2019)
    fetch('/data/porto_organizado_sao_sebastiao.json')
      .then((res) => res.json())
      .then((data) => {
        if (!mapInstanceRef.current || mapInstanceRef.current !== map) return;

        setApoTotalAnexos(data.features?.length || 13);

        const geoJsonLayer = L.geoJSON(data, {
          style: (feature) => {
            const props = feature?.properties || {};
            const isPraticagem = props.tipo === 'praticagem';
            const isFundeadouro = props.tipo === 'fundeadouro';
            const isBacia = props.tipo === 'bacia_evolucao';

            return {
              color: props.cor || '#38bdf8',
              weight: props.weight || (isBacia ? 2.5 : 2),
              opacity: 0.95,
              dashArray: isPraticagem ? '6, 6' : isFundeadouro ? '4, 4' : undefined,
              fillColor: props.fillColor || props.cor || '#0284c7',
              fillOpacity: props.fillOpacity || 0.18
            };
          },
          onEachFeature: (feature, layer) => {
            const props = feature.properties || {};

            // Interação de Hover
            layer.on({
              mouseover: (e) => {
                const target = e.target;
                target.setStyle({
                  weight: (props.weight || 2) + 1.5,
                  fillOpacity: Math.min((props.fillOpacity || 0.18) + 0.15, 0.6)
                });
                setSelectedZone(`${props.anexo}: ${props.categoria}`);
              },
              mouseout: (e) => {
                geoJsonLayer.resetStyle(e.target);
                setSelectedZone(null);
              }
            });

            // Tooltip no Mapa
            layer.bindTooltip(
              `<div style="font-size: 11px; font-weight: bold; color: ${props.cor || '#38bdf8'};">
                ${props.anexo}: ${props.categoria}
              </div>`,
              { sticky: true, className: 'custom-map-tooltip' }
            );

            // Popup Informativo CCO
            layer.bindPopup(`
              <div style="font-family: sans-serif; font-size: 12px; color: #f1f5f9; min-width: 260px; padding: 4px;">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #334155; padding-bottom: 4px; margin-bottom: 6px;">
                  <strong style="color: ${props.cor || '#38bdf8'}; font-size: 13px;">${props.anexo}</strong>
                  <span style="font-size: 10px; background: #0f172a; color: #94a3b8; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155;">
                    Portaria 501/2019
                  </span>
                </div>
                <p style="margin: 0 0 6px 0; font-weight: 600; color: #e2e8f0; font-size: 11.5px; line-height: 1.3;">
                  ${props.nome}
                </p>
                <div style="display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #94a3b8; background: #0b1120; padding: 6px; border-radius: 6px; border: 1px solid #1e293b;">
                  <div><span style="color: #64748b;">Classificação:</span> <strong style="color: ${props.cor || '#38bdf8'};">${props.categoria}</strong></div>
                  ${props.area_m2 ? `<div><span style="color: #64748b;">Área Homologada:</span> <strong style="color: #cbd5e1;">${props.area_m2}</strong></div>` : ''}
                  ${props.perimetro_m ? `<div><span style="color: #64748b;">Perímetro:</span> <strong style="color: #cbd5e1;">${props.perimetro_m}</strong></div>` : ''}
                  <div><span style="color: #64748b;">Jurisdição:</span> <strong style="color: #10b981;">Área do Porto Organizado (APO)</strong></div>
                </div>
              </div>
            `);
          }
        });

        if (mapInstanceRef.current === map) {
          geoJsonLayer.addTo(map);
          apoLayerRef.current = geoJsonLayer;
        }
      })
      .catch((err) => {
        console.error('[CanalMap] Erro ao carregar GeoJSON da Área do Porto Organizado:', err);
      });

    // 3. Marcador Fixo do Berço Comercial Público da CDSS (Cais Comercial)
    const bercoCoords: [number, number] = [-23.8242, -45.3931];

    const bercoIcon = L.divIcon({
      className: 'custom-berco-marker',
      html: `
        <div style="
          background: #0f172a;
          border: 2px solid #10b981;
          color: #10b981;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.6);
        ">
          ⚓
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const bercoMarker = L.marker(bercoCoords, { icon: bercoIcon }).addTo(map);
    bercoMarker.bindPopup(`
      <div style="font-family: sans-serif; font-size: 12px; color: #f1f5f9; padding: 4px;">
        <h4 style="font-weight: bold; color: #34d399; margin: 0 0 4px 0; font-size: 13px;">
          Berço Comercial Público (CDSS)
        </h4>
        <p style="margin: 0; color: #94a3b8;">Berço Único de Operação Comercial</p>
        <p style="margin: 2px 0 0 0; color: #cbd5e1; font-family: monospace;">Calado Homologado: 8,5m &bull; Extensão: 210m</p>
      </div>
    `);

    // Layer Group para os marcadores de navios
    const markersLayer = L.layerGroup().addTo(map);
    markersLayerRef.current = markersLayer;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Troca dinâmica de Basemap (CARTO Dark, CARTO Voyager, CARTO Positron, Satélite)
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const config = BASEMAP_OPTIONS[activeBasemap];

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    const newLayer = L.tileLayer(config.url, {
      maxZoom: config.maxZoom,
      subdomains: config.subdomains || 'abc',
      attribution: config.attribution
    });

    newLayer.addTo(mapInstanceRef.current);
    tileLayerRef.current = newLayer;
  }, [activeBasemap]);

  // 3. Controle de Visibilidade da Poligonal do Porto Organizado
  useEffect(() => {
    if (!mapInstanceRef.current || !apoLayerRef.current) return;

    if (showApo) {
      if (!mapInstanceRef.current.hasLayer(apoLayerRef.current)) {
        mapInstanceRef.current.addLayer(apoLayerRef.current);
      }
    } else {
      if (mapInstanceRef.current.hasLayer(apoLayerRef.current)) {
        mapInstanceRef.current.removeLayer(apoLayerRef.current);
      }
    }
  }, [showApo]);

  // 4. Atualiza marcadores de navios quando o line-up mudar
  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();

    // Disponibiliza callback global para acionar a edição se o usuário clicar no botão dentro do popup
    (window as any).__handleEditNavioFromMap = (id: number) => {
      const navio = navios.find((n) => n.id === id);
      if (navio && onSelectNavio) {
        onSelectNavio(navio);
      }
    };

    const getColorHex = (status: StatusCor) => {
      switch (status) {
        case 'VERDE':
          return '#10b981'; // Emerald
        case 'CINZA':
          return '#94a3b8'; // Slate
        case 'VERMELHO':
          return '#ef4444'; // Rose/Red
        case 'LARANJA':
          return '#f97316'; // Amber/Orange
        case 'AZUL':
          return '#3b82f6';
      }
    };

    const getStatusLabel = (status: StatusCor) => {
      switch (status) {
        case 'VERDE':
          return 'Operando no Berço';
        case 'CINZA':
          return 'Liberado Autoridades';
        case 'VERMELHO':
          return 'No Fundeio Real';
        case 'LARANJA':
          return 'Fundeio Previsto';
        case 'AZUL':
          return 'Previsão de Berço';
      }
    };

    const formatDataHora = (dataIso?: string) => {
      if (!dataIso) return '-';
      try {
        const d = new Date(dataIso);
        if (isNaN(d.getTime())) return dataIso;
        return d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch {
        return dataIso;
      }
    };

    navios.forEach((navio) => {
      const color = getColorHex(navio.status_cor);
      const isOperating = navio.status_cor === 'VERDE';

      // Ícone customizado de embarcação estilo AIS
      const shipIcon = L.divIcon({
        className: 'custom-ship-marker',
        html: `
          <div style="
            background: ${color};
            border: 2px solid #ffffff;
            color: #ffffff;
            width: ${isOperating ? '34px' : '28px'};
            height: ${isOperating ? '34px' : '28px'};
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: ${isOperating ? '14px' : '11px'};
            box-shadow: 0 0 15px ${color};
            cursor: pointer;
            transition: transform 0.2s;
          ">
            ${navio.ordem_fila}
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const marker = L.marker([navio.latitude, navio.longitude], { icon: shipIcon });

      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 12px; color: #f1f5f9; min-width: 270px; max-width: 320px; padding: 2px;">
          <!-- Cabeçalho -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 6px;">
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 14px;">🚢</span>
                <strong style="font-size: 13px; color: #38bdf8; letter-spacing: -0.01em;">${navio.nome_navio}</strong>
              </div>
              <div style="font-size: 10px; color: #94a3b8; margin-top: 1px; font-family: monospace;">
                IMO ${navio.imo} &bull; ${navio.tipo_navio || 'Carga Geral'}
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px;">
              <span style="background: ${color}22; color: ${color}; border: 1px solid ${color}66; padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 10px; white-space: nowrap;">
                ${getStatusLabel(navio.status_cor)}
              </span>
              <span style="font-size: 10px; color: #64748b; font-family: monospace;">
                Fila #${navio.ordem_fila}
              </span>
            </div>
          </div>

          <!-- Grid de Especificações Navais & Carga -->
          <div style="background: #0b1120; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; margin-bottom: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px;">
            <div>
              <div style="color: #64748b; font-size: 10px;">MERCADORIA</div>
              <strong style="color: #e2e8f0;">${navio.mercadoria}</strong>
            </div>
            <div>
              <div style="color: #64748b; font-size: 10px;">VOLUME</div>
              <strong style="color: #e2e8f0;">${navio.volume_t.toLocaleString('pt-BR')} t</strong>
            </div>
            <div>
              <div style="color: #64748b; font-size: 10px;">DIMENSÕES (LOA/DWT)</div>
              <strong style="color: #e2e8f0;">${navio.loa}m / ${navio.dwt.toLocaleString('pt-BR')}</strong>
            </div>
            <div>
              <div style="color: #64748b; font-size: 10px;">CALADO</div>
              <strong style="color: #38bdf8;">${navio.calado ? `${navio.calado} m` : '8.5 m'}</strong>
            </div>
            <div>
              <div style="color: #64748b; font-size: 10px;">LIVRE PRÁTICA</div>
              <strong style="color: ${navio.livre_pratica_ok ? '#34d399' : '#f87171'}; font-size: 10px;">
                ${navio.livre_pratica_ok ? '✓ CONCEDIDA' : '⏳ PENDENTE'}
              </strong>
            </div>
            <div>
              <div style="color: #64748b; font-size: 10px;">AGÊNCIA</div>
              <strong style="color: #e2e8f0; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${navio.agencia || 'Não informada'}">
                ${navio.agencia || '-'}
              </strong>
            </div>
          </div>

          ${navio.status_cor === 'VERDE' && navio.progresso_operacao !== undefined && navio.progresso_operacao !== null ? `
            <!-- Progresso Operacional da Escala -->
            <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; margin-bottom: 4px;">
                <span style="color: #6ee7b7; font-weight: 600;">Progresso Operação (SISPORT)</span>
                <span style="color: #34d399; font-weight: 700; font-family: monospace;">${navio.progresso_operacao.toFixed(1).replace('.', ',')}%</span>
              </div>
              <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.12); border-radius: 3px; overflow: hidden;">
                <div style="width: ${Math.min(100, Math.max(0, navio.progresso_operacao))}%; height: 100%; background: #10b981; border-radius: 3px;"></div>
              </div>
            </div>
          ` : ''}

          <!-- Janela Operacional de Berço -->
          <div style="background: #0f172a; border: 1px solid #223254; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; font-size: 11px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <span style="color: #64748b; font-size: 10px;">ETA / PREVISÃO:</span>
              <span style="color: #cbd5e1; font-family: monospace;">${formatDataHora(navio.eta_previsto || navio.chegada_fundeio)}</span>
            </div>
            ${navio.inicio_atracacao ? `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
                <span style="color: #64748b; font-size: 10px;">JANELA BERÇO:</span>
                <span style="color: #38bdf8; font-family: monospace; font-weight: 600;">
                  ${formatDataHora(navio.inicio_atracacao)} (${navio.duracao_estimada_horas || '-'}h)
                </span>
              </div>
            ` : ''}
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #64748b; font-size: 10px;">POSIÇÃO AIS:</span>
              <span style="color: #94a3b8; font-family: monospace; font-size: 10px;">
                ${navio.latitude.toFixed(4)}&deg;S, ${navio.longitude.toFixed(4)}&deg;W
              </span>
            </div>
          </div>

          <!-- Botão Opcional: Abrir Edição -->
          <button 
            type="button"
            onclick="window.__handleEditNavioFromMap && window.__handleEditNavioFromMap(${navio.id})"
            style="
              width: 100%;
              background: linear-gradient(135deg, #1e293b, #0f172a);
              border: 1px solid #334155;
              color: #38bdf8;
              padding: 6px 12px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 6px;
              transition: all 0.2s;
            "
            onmouseover="this.style.borderColor='#38bdf8'; this.style.color='#ffffff';"
            onmouseout="this.style.borderColor='#334155'; this.style.color='#38bdf8';"
          >
            <span>✏️</span>
            <span>Editar Dados da Escala</span>
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml, {
        maxWidth: 340,
        minWidth: 280,
        className: 'custom-vessel-popup'
      });

      markersLayerRef.current?.addLayer(marker);
    });
  }, [navios, onSelectNavio]);

  return (
    <div className="flex-1 flex flex-col h-full w-full bg-slate-50 dark:bg-cco-darkest relative overflow-hidden transition-colors">
      {/* Mapa Leaflet Container */}
      <div ref={mapContainerRef} className="flex-1 h-full w-full z-10" />

      {/* Controles Flutuantes no Canto Superior Direito */}
      <div className="absolute top-4 right-14 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
        {/* Toggle da Poligonal Oficial (KMZ / Portaria 501/2019) */}
        <button
          onClick={() => setShowApo(!showApo)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border backdrop-blur-md shadow-lg transition-all cursor-pointer ${
            showApo
              ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/50 shadow-blue-500/10 dark:shadow-cyan-500/20'
              : 'bg-white/90 text-slate-600 border-slate-200 hover:text-slate-900 dark:bg-cco-panel/90 dark:text-slate-400 dark:border-cco-border dark:hover:text-slate-200'
          }`}
          title="Ativar/Desativar Poligonal Oficial da Área do Porto Organizado"
        >
          <span>🏛️</span>
          <span>Poligonal APO</span>
          <span className={`w-2 h-2 rounded-full ${showApo ? 'bg-blue-600 dark:bg-cyan-400 animate-pulse' : 'bg-slate-400 dark:bg-slate-600'}`} />
        </button>

        {/* Seletor de Basemaps CARTO */}
        <div className="flex items-center bg-white/90 dark:bg-cco-panel/90 border border-slate-200 dark:border-cco-border/80 backdrop-blur-md p-1 rounded-xl shadow-lg space-x-1">
          {(Object.keys(BASEMAP_OPTIONS) as BasemapStyle[]).map((styleKey) => {
            const opt = BASEMAP_OPTIONS[styleKey];
            const isActive = activeBasemap === styleKey;
            return (
              <button
                key={opt.id}
                onClick={() => setActiveBasemap(opt.id)}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm dark:bg-cyan-500/20 dark:text-cyan-300 dark:border dark:border-cyan-500/40'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
                }`}
                title={`Alternar para ${opt.name}`}
              >
                <span>{opt.icon}</span>
                <span className="hidden sm:inline">{opt.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel Flutuante Náutico com dados do Canal & Status CCO */}
      <div className="absolute top-4 left-4 z-20 bg-white/95 dark:bg-cco-panel/95 border border-slate-200 dark:border-cco-border p-3.5 rounded-xl shadow-xl backdrop-blur-md max-w-sm text-xs pointer-events-auto transition-colors">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 dark:bg-cyan-400 animate-pulse"></span>
            <span>Canal de São Sebastião &bull; CCO</span>
          </h3>
          <span className="text-[10px] bg-blue-50 dark:bg-cyan-950 text-blue-700 dark:text-cyan-400 border border-blue-200 dark:border-cyan-800 px-1.5 py-0.5 rounded font-mono font-bold">
            CDSS v{__APP_VERSION__}
          </span>
        </div>

        <p className="text-slate-500 dark:text-slate-400 text-[11px] mb-2 leading-tight">
          Supervisão náutica e telemetria de tráfego do berço único comercial e ancoradouro externo.
        </p>

        {selectedZone && (
          <div className="bg-blue-50 dark:bg-cyan-950/40 border border-blue-200 dark:border-cyan-500/30 rounded-lg px-2.5 py-1.5 mb-2 text-[11px] text-blue-800 dark:text-cyan-200 flex items-center space-x-1.5 animate-fadeIn">
            <span>📍</span>
            <span className="font-semibold truncate">{selectedZone}</span>
          </div>
        )}

        <div className="space-y-1.5 font-mono text-[11px] text-slate-700 dark:text-slate-300 border-t border-slate-200 dark:border-cco-border pt-2">
          <div className="flex justify-between">
            <span className="text-slate-500">Coordenadas Centro:</span>
            <span>23&deg;48'16" S / 45&deg;23'49" W</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Poligonal Oficial:</span>
            <span className="text-blue-600 dark:text-cyan-400 font-bold flex items-center gap-1">
              <span>Portaria 501/2019</span>
              <span className="text-[10px] text-blue-500/80 dark:text-cyan-500/80">({apoTotalAnexos} anexos)</span>
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Berço CDSS:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">Cais Comercial (Ativo)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Navios no Canal:</span>
            <span className="text-slate-900 dark:text-white font-bold">{navios.length} Embarcações</span>
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-cco-border/60 pt-1.5 mt-1.5">
            <span className="flex items-center space-x-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-slate-500 dark:text-slate-400">Carto Basemap:</span>
            </span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
              {CARTO_KEY ? 'Chave Homologada' : 'CDN Ativo'}
              {CARTO_KEY && <span className="text-[9px] text-slate-400">({CARTO_KEY.slice(0, 6)}...)</span>}
            </span>
          </div>
        </div>

        {/* Mini Legenda Rápida da Poligonal */}
        {showApo && (
          <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-cco-border/50 grid grid-cols-2 gap-1 text-[10px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2 rounded bg-sky-400/40 border border-sky-500"></span>
              <span>Águas Portuárias</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2 rounded bg-purple-500/40 border border-purple-500"></span>
              <span>Bacia de Evolução</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2 rounded bg-cyan-400/40 border border-cyan-500 border-dashed"></span>
              <span>Fundeadouros</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2 rounded bg-amber-400/40 border border-amber-500 border-dashed"></span>
              <span>Praticagem</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
