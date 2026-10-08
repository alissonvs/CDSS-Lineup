import * as cheerio from 'cheerio';
import { getDatabase } from '../database/connection.js';
import { obterStatusMareAtual } from './tideService.js';

export interface TelemetriaMare {
  alturaMetros: number;
  tendencia: 'Enchendo' | 'Vazando' | 'Estável';
  proximaPreamar?: string;
  alturaPreamar?: number;
  proximaBaixamar?: string;
  alturaBaixamar?: number;
  atualizadoEm: string;
  timestamp: number;
  fonte: 'SP_PILOTS' | 'DHN_FALLBACK';
  mensagemStatus: string;
}

interface PontoTabelaSpPilots {
  dataHoraStr: string;
  timestamp: number;
  altura: number;
}

export class SpPilotsService {
  private urlSpPilots = 'https://ssb.sppilots.com.br/popups/controls.asp?act=MAR';

  constructor() {}

  /**
   * Garante a criação da tabela de telemetria no PostgreSQL
   */
  public async initTable(): Promise<void> {
    const sql = getDatabase();
    await sql`
      CREATE TABLE IF NOT EXISTS tide_telemetry (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        water_level DOUBLE PRECISION NOT NULL,
        tendency TEXT NOT NULL,
        next_high_tide_time TEXT,
        next_high_tide_height DOUBLE PRECISION,
        next_low_tide_time TEXT,
        next_low_tide_height DOUBLE PRECISION,
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        raw_payload TEXT,
        captured_at BIGINT NOT NULL
      );
    `;
  }

  /**
   * Faz o parsing de datas no formato DD/MM/YYYY HH:mm da Praticagem considerando fuso horário de São Paulo (UTC-3)
   */
  private parseDataHoraSpPilots(str: string): number | null {
    const match = str.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);
    if (!match) return null;
    const [, dia, mes, ano, hora, minuto] = match;
    // Cria string ISO com offset UTC-3
    const isoString = `${ano}-${mes}-${dia}T${hora}:${minuto}:00-03:00`;
    const d = new Date(isoString);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  /**
   * Coleta e parseia a tábua de marés ao vivo da Praticagem de São Paulo (SP Pilots)
   */
  public async atualizarTelemetria(): Promise<TelemetriaMare> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout

      const response = await fetch(this.urlSpPilots, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SP Pilots HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const pontos: PontoTabelaSpPilots[] = [];

      // Itera por todas as linhas de tabela contendo pares Data/Hora e Altura
      $('table tr').each((_, el) => {
        const tds = $(el).find('td');
        if (tds.length >= 2) {
          const dataHoraText = $(tds[0]).text().trim();
          const alturaText = $(tds[1]).text().trim();

          const ts = this.parseDataHoraSpPilots(dataHoraText);
          const alt = parseFloat(alturaText.replace(',', '.'));

          if (ts !== null && !isNaN(alt)) {
            pontos.push({
              dataHoraStr: dataHoraText,
              timestamp: ts,
              altura: Math.round(alt * 100) / 100
            });
          }
        }
      });

      if (pontos.length === 0) {
        console.warn('⚠️ [SpPilotsService] Nenhuma linha tabular de maré encontrada no HTML da SP Pilots.');
        return await this.obterUltimaLeituraOuFallback();
      }

      // Ordena cronologicamente
      pontos.sort((a, b) => a.timestamp - b.timestamp);

      const agora = Date.now();

      // Encontra o ponto mais próximo do horário atual
      let idxMaisProximo = 0;
      let menorDif = Math.abs(pontos[0].timestamp - agora);

      for (let i = 1; i < pontos.length; i++) {
        const dif = Math.abs(pontos[i].timestamp - agora);
        if (dif < menorDif) {
          menorDif = dif;
          idxMaisProximo = i;
        }
      }

      const pontoAtual = pontos[idxMaisProximo];
      const alturaAtual = pontoAtual.altura;

      // Determina a tendência a partir da derivada com o ponto imediatamente seguinte
      let tendencia: 'Enchendo' | 'Vazando' | 'Estável' = 'Estável';
      if (idxMaisProximo < pontos.length - 1) {
        const prox = pontos[idxMaisProximo + 1];
        if (prox.altura > alturaAtual + 0.01) {
          tendencia = 'Enchendo';
        } else if (prox.altura < alturaAtual - 0.01) {
          tendencia = 'Vazando';
        }
      } else if (idxMaisProximo > 0) {
        const ant = pontos[idxMaisProximo - 1];
        if (alturaAtual > ant.altura + 0.01) {
          tendencia = 'Enchendo';
        } else if (alturaAtual < ant.altura - 0.01) {
          tendencia = 'Vazando';
        }
      }

      // Identifica o próximo pico de Preamar e Baixa-mar no restante da série
      let proximaPreamarStr: string | undefined;
      let alturaPreamar: number | undefined;
      let proximaBaixamarStr: string | undefined;
      let alturaBaixamar: number | undefined;

      for (let i = idxMaisProximo + 1; i < pontos.length - 1; i++) {
        const prev = pontos[i - 1].altura;
        const curr = pontos[i].altura;
        const next = pontos[i + 1].altura;

        // Preamar: ponto de máximo local
        if (!proximaPreamarStr && curr >= prev && curr >= next && curr >= 0.8) {
          proximaPreamarStr = pontos[i].dataHoraStr;
          alturaPreamar = curr;
        }

        // Baixa-mar: ponto de mínimo local
        if (!proximaBaixamarStr && curr <= prev && curr <= next && curr <= 0.7) {
          proximaBaixamarStr = pontos[i].dataHoraStr;
          alturaBaixamar = curr;
        }

        if (proximaPreamarStr && proximaBaixamarStr) break;
      }

      const agoraStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      // Upsert garantindo ID = 1 para acesso O(1) em PostgreSQL
      const sql = getDatabase();
      await sql`
        INSERT INTO tide_telemetry (
          id, water_level, tendency,
          next_high_tide_time, next_high_tide_height,
          next_low_tide_time, next_low_tide_height,
          source, updated_at, raw_payload, captured_at
        ) VALUES (
          1, ${alturaAtual}, ${tendencia},
          ${proximaPreamarStr || null}, ${alturaPreamar || null},
          ${proximaBaixamarStr || null}, ${alturaBaixamar || null},
          'SP_PILOTS', ${agoraStr}, ${JSON.stringify(pontos.slice(0, 10))}, ${agora}
        )
        ON CONFLICT(id) DO UPDATE SET
          water_level = EXCLUDED.water_level,
          tendency = EXCLUDED.tendency,
          next_high_tide_time = EXCLUDED.next_high_tide_time,
          next_high_tide_height = EXCLUDED.next_high_tide_height,
          next_low_tide_time = EXCLUDED.next_low_tide_time,
          next_low_tide_height = EXCLUDED.next_low_tide_height,
          source = EXCLUDED.source,
          updated_at = EXCLUDED.updated_at,
          raw_payload = EXCLUDED.raw_payload,
          captured_at = EXCLUDED.captured_at
      `;

      return {
        alturaMetros: alturaAtual,
        tendencia,
        proximaPreamar: proximaPreamarStr ? `${proximaPreamarStr.slice(11)} (${alturaPreamar?.toFixed(2)}m)` : undefined,
        alturaPreamar,
        proximaBaixamar: proximaBaixamarStr ? `${proximaBaixamarStr.slice(11)} (${alturaBaixamar?.toFixed(2)}m)` : undefined,
        alturaBaixamar,
        atualizadoEm: agoraStr,
        timestamp: agora,
        fonte: 'SP_PILOTS',
        mensagemStatus: `Telemetria Praticagem de SP ao vivo • Canal de São Sebastião (${pontoAtual.dataHoraStr})`
      };

    } catch (error: any) {
      console.warn('⚠️ [SpPilotsService] Falha ao coletar dados da SP Pilots:', error.message);
      return await this.obterUltimaLeituraOuFallback();
    }
  }

  /**
   * Obtém a última leitura salva no PostgreSQL ou aciona fallback para o modelo harmônico DHN
   */
  public async obterUltimaLeituraOuFallback(): Promise<TelemetriaMare> {
    try {
      const sql = getDatabase();
      const rows = await sql`SELECT * FROM tide_telemetry WHERE id = 1`;

      if (rows.length > 0) {
        const row = rows[0];
        return {
          alturaMetros: Number(row.water_level),
          tendencia: row.tendency as any,
          proximaPreamar: row.next_high_tide_time ? `${row.next_high_tide_time.slice(11)} (${Number(row.next_high_tide_height)?.toFixed(2)}m)` : undefined,
          alturaPreamar: row.next_high_tide_height ? Number(row.next_high_tide_height) : undefined,
          proximaBaixamar: row.next_low_tide_time ? `${row.next_low_tide_time.slice(11)} (${Number(row.next_low_tide_height)?.toFixed(2)}m)` : undefined,
          alturaBaixamar: row.next_low_tide_height ? Number(row.next_low_tide_height) : undefined,
          atualizadoEm: row.updated_at,
          timestamp: Number(row.captured_at),
          fonte: row.source === 'SP_PILOTS' ? 'SP_PILOTS' : 'DHN_FALLBACK',
          mensagemStatus: row.source === 'SP_PILOTS'
            ? `Última telemetria SP Pilots em cache (${row.updated_at})`
            : 'Previsão astronômica oficial (DHN/Marinha do Brasil)'
        };
      }
    } catch (err) {
      console.error('[SpPilotsService] Erro ao ler PostgreSQL:', err);
    }

    // Fallback gracioso para o modelo harmônico DHN
    const statusDhn = obterStatusMareAtual();
    const agoraStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tendenciaFormatada: 'Enchendo' | 'Vazando' = statusDhn.tendencia === 'SUBINDO' ? 'Enchendo' : 'Vazando';

    return {
      alturaMetros: statusDhn.altura_m,
      tendencia: tendenciaFormatada,
      proximaPreamar: statusDhn.proximoExtremo.tipo === 'PREAMAR' ? statusDhn.proximoExtremo.label : undefined,
      alturaPreamar: statusDhn.proximoExtremo.tipo === 'PREAMAR' ? statusDhn.proximoExtremo.altura_m : undefined,
      proximaBaixamar: statusDhn.proximoExtremo.tipo === 'BAIXA_MAR' ? statusDhn.proximoExtremo.label : undefined,
      alturaBaixamar: statusDhn.proximoExtremo.tipo === 'BAIXA_MAR' ? statusDhn.proximoExtremo.altura_m : undefined,
      atualizadoEm: agoraStr,
      timestamp: Date.now(),
      fonte: 'DHN_FALLBACK',
      mensagemStatus: 'Modelo astronômico harmônico DHN • Canal de São Sebastião'
    };
  }
}

// Instância singleton para uso nas rotas e background worker
export const spPilotsService = new SpPilotsService();
