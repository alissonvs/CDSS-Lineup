import type {
  NavioLineup,
  ResumoOperacional,
  ClimaResumo,
  DataDockedVesselResult,
  MaresResponse,
  TelemetriaMareCurrent,
  RainForecastResponse
} from '../types';

const API_BASE = '/api';

export async function fetchLineup(): Promise<{ navios: NavioLineup[]; operacional: ResumoOperacional }> {
  const res = await fetch(`${API_BASE}/lineup`);
  if (!res.ok) throw new Error(`Falha ao obter lineup: ${res.statusText}`);
  const json = await res.json();
  return { navios: json.data, operacional: json.operacional };
}

export async function createNavio(navio: Partial<NavioLineup>): Promise<{ navios: NavioLineup[]; operacional: ResumoOperacional }> {
  const res = await fetch(`${API_BASE}/navios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(navio)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Erro ao criar escala');
  }
  const json = await res.json();
  return { navios: json.data, operacional: json.operacional };
}

export async function updateNavio(id: number, navio: Partial<NavioLineup>): Promise<{ navios: NavioLineup[]; operacional: ResumoOperacional }> {
  const res = await fetch(`${API_BASE}/navios/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(navio)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Erro ao atualizar escala');
  }
  const json = await res.json();
  return { navios: json.data, operacional: json.operacional };
}

export async function deleteNavio(id: number): Promise<{ navios: NavioLineup[]; operacional: ResumoOperacional }> {
  const res = await fetch(`${API_BASE}/navios/${id}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Erro ao excluir escala');
  }
  const json = await res.json();
  return { navios: json.data, operacional: json.operacional };
}

export async function reordenarFila(ids: number[]): Promise<{ navios: NavioLineup[]; operacional: ResumoOperacional }> {
  const res = await fetch(`${API_BASE}/navios/reordenar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Erro ao reordenar fila');
  }
  const json = await res.json();
  return { navios: json.data, operacional: json.operacional };
}

export async function syncDataDocked(imo: string, navioId?: number): Promise<{
  vessel: DataDockedVesselResult;
  navios: NavioLineup[];
  operacional: ResumoOperacional;
}> {
  const url = navioId ? `${API_BASE}/navios/sync/${encodeURIComponent(imo)}?navioId=${navioId}` : `${API_BASE}/navios/sync/${encodeURIComponent(imo)}`;
  const res = await fetch(url, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Erro ao sincronizar com DataDocked');
  }
  const json = await res.json();
  return {
    vessel: json.vessel,
    navios: json.navios || json.lineup?.navios || [],
    operacional: json.operacional || json.lineup?.operacional || null
  };
}

export async function fetchClima(): Promise<ClimaResumo> {
  const res = await fetch(`${API_BASE}/clima`);
  if (!res.ok) throw new Error('Erro ao obter clima');
  const json = await res.json();
  return json.data;
}

export async function syncSisport(): Promise<{ message: string; total: number; navios: NavioLineup[]; operacional: ResumoOperacional }> {
  const res = await fetch(`${API_BASE}/sisport/sync`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao sincronizar com o portal SISPORT');
  }
  const json = await res.json();
  return {
    message: json.message,
    total: json.total,
    navios: json.data,
    operacional: json.operacional
  };
}

export interface SyncAllStats {
  totalSisport: number;
  catalogoIdentificados?: number;
  dataDockedAtualizados: number;
  tempoDecorridoMs: number;
}

export interface SyncAllResponse {
  success: boolean;
  message: string;
  total: number;
  stats: SyncAllStats;
  navios: NavioLineup[];
  operacional: ResumoOperacional;
}

export async function syncAllCdss(): Promise<SyncAllResponse> {
  const res = await fetch(`${API_BASE}/sisport/sync-all`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao realizar a sincronização completa');
  }
  const json = await res.json();
  return {
    success: json.success,
    message: json.message,
    total: json.total,
    stats: json.stats,
    navios: json.data,
    operacional: json.operacional
  };
}

export interface NavioCatalogoSearchResult {
  imo: string;
  nome: string;
  name?: string;
  metodo?: string;
  score?: number;
  tipo_cdss?: string;
  vessel_type?: string;
  loa?: number;
  dwt?: number;
  calado?: number;
}

export async function searchNavioCatalogo(nome: string): Promise<NavioCatalogoSearchResult> {
  const res = await fetch(`${API_BASE}/navios/search?nome=${encodeURIComponent(nome)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || 'Navio não localizado no catálogo oficial');
  }
  const json = await res.json();
  return json.vessel;
}

export async function fetchMares(escalaDias: number = 14): Promise<MaresResponse> {
  const res = await fetch(`${API_BASE}/mares?escalaDias=${escalaDias}`);
  if (!res.ok) throw new Error(`Falha ao obter dados de maré da DHN: ${res.statusText}`);
  const json = await res.json();
  return json;
}

export async function fetchCurrentTide(): Promise<TelemetriaMareCurrent> {
  const res = await fetch(`${API_BASE}/weather/tide/current`);
  if (!res.ok) throw new Error(`Falha ao obter telemetria da maré: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}

export async function fetchRainForecast(): Promise<RainForecastResponse> {
  const res = await fetch(`${API_BASE}/weather/rain/forecast`);
  if (!res.ok) throw new Error(`Falha ao obter previsão de chuva: ${res.statusText}`);
  const json = await res.json();
  return json.data;
}



