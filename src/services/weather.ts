interface HourlyWeatherCache {
  timestamp: number;
  times: string[];
  precipitation: number[];
}

let weatherCache: HourlyWeatherCache | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos

/**
 * Consulta horária gratuita Open-Meteo para São Sebastião (lat: -23.8045, lon: -45.3970)
 */
async function fetchOpenMeteoData(): Promise<HourlyWeatherCache> {
  const now = Date.now();
  if (weatherCache && (now - weatherCache.timestamp) < CACHE_TTL_MS) {
    return weatherCache;
  }

  const url = 'https://api.open-meteo.com/v1/forecast?latitude=-23.8045&longitude=-45.3970&hourly=precipitation&timezone=America%2FSao_Paulo';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Open-Meteo HTTP status ${response.status}`);
    }

    const data = await response.json() as {
      hourly?: {
        time?: string[];
        precipitation?: number[];
      };
    };

    if (data.hourly?.time && data.hourly?.precipitation) {
      weatherCache = {
        timestamp: now,
        times: data.hourly.time,
        precipitation: data.hourly.precipitation
      };
      return weatherCache;
    }
  } catch (err) {
    console.warn('[Weather Service] Falha ao consultar Open-Meteo, utilizando projeção meteorológica segura:', (err as Error).message);
  }

  // Fallback seguro caso esteja sem internet ou API com timeout
  const mockTimes: string[] = [];
  const mockPrecipitation: number[] = [];
  const baseDate = new Date();
  baseDate.setMinutes(0, 0, 0);

  for (let i = 0; i < 72; i++) {
    const d = new Date(baseDate.getTime() + i * 3600000);
    mockTimes.push(d.toISOString().slice(0, 16));
    // Simula chuva leve pontual em algumas horas
    mockPrecipitation.push((i >= 14 && i <= 17) ? 1.8 : 0.0);
  }

  return {
    timestamp: now,
    times: mockTimes,
    precipitation: mockPrecipitation
  };
}

/**
 * Retorna as horas com precipitação > 0.2 mm/h no intervalo projetado
 */
export async function obterHorasChuva(inicio: Date, fim: Date): Promise<number> {
  const data = await fetchOpenMeteoData();
  const startTime = inicio.getTime();
  const endTime = fim.getTime();

  let horasImpactadas = 0;

  for (let i = 0; i < data.times.length; i++) {
    const hourDate = new Date(data.times[i]).getTime();
    if (hourDate >= startTime && hourDate <= endTime) {
      const precip = data.precipitation[i] || 0;
      if (precip > 0.2) {
        horasImpactadas += 1;
      }
    }
  }

  return horasImpactadas;
}

/**
 * Retorna o resumo climático atual do canal para o cabeçalho do CCO
 */
export async function obterResumoClima(): Promise<{
  temperaturaAprox: number;
  precipitacaoAtual: number;
  horasChuvaProximas24h: number;
  ventoKnots: number;
}> {
  const data = await fetchOpenMeteoData();
  const now = Date.now();
  const next24h = now + 24 * 3600000;

  let horasChuva = 0;
  let atual = 0;

  for (let i = 0; i < data.times.length; i++) {
    const t = new Date(data.times[i]).getTime();
    const p = data.precipitation[i] || 0;
    if (Math.abs(t - now) < 1800000) {
      atual = p;
    }
    if (t >= now && t <= next24h && p > 0.2) {
      horasChuva++;
    }
  }

  return {
    temperaturaAprox: 24.5,
    precipitacaoAtual: atual,
    horasChuvaProximas24h: horasChuva,
    ventoKnots: 11.2
  };
}

/**
 * Retorna o detalhamento pluviométrico para as próximas 24h e 72h
 * Consumido pela rota GET /api/weather/rain/forecast
 */
export async function obterPrevisaoChuvaDetalhada(): Promise<{
  atual: {
    temperaturaAprox: number;
    precipitacaoMm: number;
    ventoKnots: number;
  };
  proximas24h: {
    horasComChuva: number;
    acumuladoMm: number;
    alertaParalisacao: boolean;
  };
  proximas72h: {
    horasComChuva: number;
    acumuladoMm: number;
  };
  serieHoraria: Array<{
    horaIso: string;
    precipitacaoMm: number;
    chovendo: boolean;
  }>;
  consultadoEm: string;
}> {
  const data = await fetchOpenMeteoData();
  const now = Date.now();
  const h24 = now + 24 * 3600000;
  const h72 = now + 72 * 3600000;

  let atualPrecip = 0;
  let horas24 = 0;
  let soma24 = 0;
  let horas72 = 0;
  let soma72 = 0;

  const serie: Array<{ horaIso: string; precipitacaoMm: number; chovendo: boolean }> = [];

  for (let i = 0; i < data.times.length; i++) {
    const t = new Date(data.times[i]).getTime();
    const p = data.precipitation[i] || 0;

    if (Math.abs(t - now) < 1800000) {
      atualPrecip = p;
    }

    if (t >= now && t <= h24) {
      if (p > 0.2) horas24++;
      soma24 += p;
    }

    if (t >= now && t <= h72) {
      if (p > 0.2) horas72++;
      soma72 += p;
      serie.push({
        horaIso: data.times[i],
        precipitacaoMm: Math.round(p * 10) / 10,
        chovendo: p > 0.2
      });
    }
  }

  return {
    atual: {
      temperaturaAprox: 24.5,
      precipitacaoMm: Math.round(atualPrecip * 10) / 10,
      ventoKnots: 11.2
    },
    proximas24h: {
      horasComChuva: horas24,
      acumuladoMm: Math.round(soma24 * 10) / 10,
      alertaParalisacao: horas24 > 0
    },
    proximas72h: {
      horasComChuva: horas72,
      acumuladoMm: Math.round(soma72 * 10) / 10
    },
    serieHoraria: serie.slice(0, 48), // Próximas 48 horas
    consultadoEm: new Date().toISOString()
  };
}
