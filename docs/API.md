# PCS Lineup — Documentação Completa da API REST

> **Versão da API:** 2.0.0 · **Base URL:** `http://<host>:<port>/api` (padrão local: `http://localhost:3000/api`)  
> **Formato de Dados:** `application/json` (UTF-8) · **Padrão Temporal:** ISO 8601 UTC / BRT (`YYYY-MM-DDTHH:mm:ssZ` ou `YYYY-MM-DDTHH:mm:ss-03:00`)  
> **Última Atualização:** 2026-10-18 · **Gerado a partir do código-fonte.**

---

## Sumário

1. [Visão Geral & Padrões da API](#1-visão-geral--padrões-da-api)
2. [Healthcheck & Diagnóstico](#2-healthcheck--diagnóstico)
   - `GET /api/health`
   - `GET /api/livez`
   - `GET /api/version`
3. [Gestão de Escalas & Line-up](#3-gestão-de-escalas--line-up)
   - `GET /api/lineup`
   - `POST /api/navios`
   - `PUT /api/navios/:id`
   - `DELETE /api/navios/:id`
   - `POST /api/navios/reordenar`
   - `POST /api/navios/sync/:imo`
   - `GET /api/navios/search`
   - `GET /api/lineup/historico-previsoes`
4. [Automação & Sincronização SISPORT](#4-automação--sincronização-sisport)
   - `GET /api/sisport/config`
   - `PUT /api/sisport/config`
   - `POST /api/sisport/sync`
   - `POST /api/sisport/sync-all`
5. [Praticagem de São Paulo (SP Pilots)](#5-praticagem-de-são-paulo-sp-pilots)
   - `GET /api/praticagem/pauta`
   - `POST /api/praticagem/sync`
6. [Telemetria Náutica, Hidrografia & Clima](#6-telemetria-náutica-hidrografia--clima)
   - `GET /api/operacional/resumo`
   - `GET /api/financeiro/resumo` (Legado)
   - `GET /api/clima`
   - `GET /api/mares`
   - `GET /api/weather/tide/current`
   - `GET /api/weather/rain/forecast`
7. [Geofencing & Identificação Espacial de Berços](#7-geofencing--identificação-espacial-de-berços)
   - `GET /api/bercos/identificar`
8. [Comunicação em Tempo Real & Ausência de WebSockets](#8-comunicação-em-tempo-real--ausência-de-websockets)
9. [Tabela de Códigos de Status HTTP](#9-tabela-de-códigos-de-status-http)

---

## 1. Visão Geral & Padrões da API

A API do **PCS Lineup** opera de forma síncrona/assíncrona sobre HTTP/1.1 e HTTP/2, provendo respostas rápidas e estruturadas em JSON.

### 1.1. Autenticação e Segurança
Atualmente, as rotas operam sem exigência de cabeçalho `Authorization: Bearer <token>`, pois a aplicação foi desenhada para operação em rede local privada ou VPN corporativa do Centro de Controle Operacional (CCO) da CDSS.
- Requisições com corpo (`POST`, `PUT`) exigem o cabeçalho: `Content-Type: application/json`.

### 1.2. Estrutura Padrão de Resposta

#### Sucesso:
```json
{
  "success": true,
  "data": { ... },
  "message": "Operação realizada com sucesso"
}
```

#### Erro:
```json
{
  "success": false,
  "error": "Descrição clara da falha encontrada"
}
```

---

## 2. Healthcheck & Diagnóstico

Probes para orquestradores de contêineres (Docker, Dokploy, Kubernetes) e monitoramento de infraestrutura.

---

### `GET /api/health`
Verifica a integridade geral do backend e a conectividade com o banco de dados PostgreSQL.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L19-L37)
- **Headers:** Não exige cabeçalhos específicos.
- **Parâmetros:** Nenhum.

#### Resposta de Sucesso (`200 OK`):
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "database": "connected",
  "uptime": 3600,
  "timestamp": "2026-10-18T14:30:00.000Z"
}
```

#### Resposta de Erro (`530 / 503 Service Unavailable`):
```json
{
  "status": "unhealthy",
  "database": "disconnected",
  "error": "Connection to PostgreSQL refused at postgres:5432"
}
```

---

### `GET /api/livez`
Liveness probe simples e ultrarrápido para balanceadores de carga e contêineres.

- **Fonte:** [`src/routes/api.ts`](file:///d:/DEV/CDSS-Lineup/src/routes/api.ts#L36)
- **Headers:** Nenhum.
- **Parâmetros:** Nenhum.

#### Resposta de Sucesso (`200 OK`):
```text
OK
```

---

### `GET /api/version`
Retorna os metadados de nome e versão da aplicação ativa.

- **Fonte:** [`src/routes/api.ts`](file:///d:/DEV/CDSS-Lineup/src/routes/api.ts#L37)
- **Headers:** Nenhum.
- **Parâmetros:** Nenhum.

#### Resposta de Sucesso (`200 OK`):
```json
{
  "name": "pcs-lineup",
  "version": "2.0.0"
}
```

---

## 3. Gestão de Escalas & Line-up

Endpoints centrais para leitura, criação, edição, reordenação e auditoria do encadeamento de navios no porto.

---

### `GET /api/lineup`
Retorna a lista completa de navios do line-up com todas as projeções calculadas pelo motor determinístico, blocos temporais do Gantt, marcos náuticos e o resumo operacional consolidado.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L39-L51)
- **Headers:** `Accept: application/json`
- **Parâmetros:** Nenhum.

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "imo": "9234561",
      "nome_navio": "MADONNA",
      "tipo_navio": "Graneleiro Handymax",
      "mercadoria": "Barrilha",
      "volume_t": 18000,
      "loa": 170.0,
      "dwt": 28000,
      "calado": 9.2,
      "calado_entrada": 9.2,
      "calado_saida": 8.5,
      "agencia": "Wilson Sons Agência",
      "ordem_fila": 1,
      "ordem_sisport": 1,
      "status_cor": "VERDE",
      "status_sisport": "VERDE",
      "livre_pratica_ok": 1,
      "armazem_publico": 0,
      "eta_previsto": "2026-10-18T10:00:00Z",
      "eta_ais": "2026-10-18T09:45:00Z",
      "inicio_operacao": "2026-10-18T12:00:00Z",
      "chegada_fundeio": "2026-10-18T10:30:00Z",
      "inicio_atracacao": "2026-10-18T11:30:00Z",
      "fim_atracacao": "2026-10-21T06:00:00Z",
      "latitude": -23.8114,
      "longitude": -45.3974,
      "sinal_antena": "2026-10-18T14:20:00Z",
      "ais_sincronizado_em": "2026-10-18T14:25:00Z",
      "progresso_operacao": 35.5,
      "berco": "101",
      "duracao_estimada_horas": 66.5,
      "duracao_base_horas": 64.0,
      "horas_chuva": 2.5,
      "delta_t_manobra": 2.0,
      "origem_previsao_fim": "CALCULADO",
      "confianca_previsao": "ALTA",
      "blocos": [
        {
          "tipo": "VERDE",
          "label": "Operando no Berço 101",
          "inicioIso": "2026-10-18T11:30:00Z",
          "fimIso": "2026-10-21T06:00:00Z",
          "duracaoHoras": 66.5,
          "caladoCritico": false
        }
      ],
      "marcos": [
        { "id": "inicioOperacao", "label": "Início da Operação", "dataIso": "2026-10-18T12:00:00Z" }
      ],
      "restricao_mare": {
        "temRestricao": false,
        "calado": 9.2,
        "caladoEntrada": 9.2,
        "caladoSaida": 8.5,
        "profundidadeBercoZh": 10.0,
        "ukcMinimoExigido": 0.5,
        "mareMinimaRequerida": 0.0
      }
    }
  ],
  "operacional": {
    "taxa_ocupacao_berco": 87.5,
    "total_navios": 5,
    "navios_em_operacao": 1,
    "navios_fundeados": 2,
    "horas_ocupadas": 294.0,
    "volume_total_t": 82000
  }
}
```

---

### `POST /api/navios`
Cadastra manualmente uma nova escala de navio na fila do line-up. Se o IMO não for informado, o sistema realiza busca automática no catálogo oficial de navios com mais de 16.200 registros.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L53-L145)
- **Headers:** `Content-Type: application/json`

#### Payload da Requisição:
```json
{
  "nome_navio": "PAN DAWN",
  "mercadoria": "Trigo a Granel",
  "volume_t": 28000,
  "imo": "9642514",
  "tipo_navio": "Graneleiro Supramax",
  "loa": 189.9,
  "dwt": 58000,
  "calado": 10.5,
  "calado_entrada": 10.5,
  "calado_saida": 8.2,
  "agencia": "Oceanica Cargas",
  "eta_previsto": "2026-10-22T08:00:00Z",
  "armazem_publico": 1,
  "livre_pratica_ok": 0
}
```

#### Resposta de Sucesso (`201 Created`):
```json
{
  "success": true,
  "message": "Escala inserida com sucesso",
  "id": 14,
  "data": [ /* lista atualizada de navios */ ],
  "operacional": { /* kpis recalculados */ }
}
```

#### Respostas de Erro:
- `400 Bad Request`:
  ```json
  { "success": false, "error": "Campos obrigatórios ausentes: Nome da Embarcação, Mercadoria e Volume." }
  ```

---

### `PUT /api/navios/:id`
Atualiza os atributos de uma escala existente (dados náuticos, marcos temporais, calados de entrada/saída, ajustes de praticagem).

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L147-L257)
- **Path Parameter:** `id` (inteiro) — Identificador único da escala no banco.
- **Headers:** `Content-Type: application/json`

#### Payload da Requisição:
```json
{
  "calado_entrada": 9.8,
  "calado_saida": 8.1,
  "livre_pratica_ok": 1,
  "inicio_operacao": "2026-10-19T14:00:00Z",
  "fim_atracacao": "2026-10-22T18:00:00Z",
  "origem_previsao_fim": "MANUAL",
  "ajuste_praticagem_ativo": 1
}
```

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "message": "Escala atualizada com sucesso",
  "data": [ /* lista recalculada */ ],
  "operacional": { /* kpis */ }
}
```

#### Respostas de Erro:
- `404 Not Found`:
  ```json
  { "success": false, "error": "Escala com ID 999 não encontrada." }
  ```
- `400 Bad Request` (Conflito de IMO duplicado em outro registro):
  ```json
  { "success": false, "error": "O número IMO \"9234561\" já está cadastrado para a embarcação \"MADONNA\"." }
  ```

---

### `DELETE /api/navios/:id`
Exclui uma escala do line-up e reindexa automaticamente a prioridade sequencial (`ordem_fila`) de todas as escalas remanescentes para não deixar lacunas na fila.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L259-L286)
- **Path Parameter:** `id` (inteiro) — ID da escala a ser excluída.

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "message": "Escala excluída e fila reindexada",
  "data": [ /* lista recalculada */ ],
  "operacional": { /* kpis */ }
}
```

---

### `POST /api/navios/reordenar`
Altera a prioridade sequencial de atracação das escalas no cais comercial, reindexando o campo `ordem_fila` dentro de uma transação atômica no banco de dados.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L288-L316)
- **Headers:** `Content-Type: application/json`

#### Payload da Requisição:
```json
{
  "ids": [4, 1, 3, 2]
}
```

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "message": "Prioridades reordenadas com sucesso",
  "data": [ /* lista recalculada com nova ordem */ ],
  "operacional": { /* kpis atualizados */ }
}
```

---

### `POST /api/navios/sync/:imo`
Consulta a telemetria satelital ao vivo da embarcação via API DataDocked AIS consumindo 1 crédito de telemetria, atualizando coordenadas geográficas, ETA do transponder e calado atual.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L318-L403)
- **Path Parameter:** `imo` (string) — Número IMO do navio.
- **Query Parameter (Opcional):** `navioId` (inteiro) — ID da escala no line-up.

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "message": "Dados do DataDocked sincronizados sob demanda (1 Crédito)",
  "vessel": {
    "imo": "9345672",
    "nome_navio": "JACAMAR ARROW",
    "tipo_navio": "Graneleiro Supramax",
    "latitude": -23.8115,
    "longitude": -45.3872,
    "speed": 0.1,
    "navigationalStatus": "At anchor",
    "eta_previsto": "2026-10-19T09:00:00.000Z",
    "sincronizado_em": "2026-10-18T14:35:10.000Z"
  },
  "navios": [ /* lista com posições atualizadas */ ],
  "operacional": { /* kpis */ }
}
```

---

### `GET /api/navios/search`
Pesquisa navios no catálogo oficial local da CDSS com mais de 16.200 navios, utilizando casamento fonético e distância de edição de caracteres (Jaro-Winkler / Levenshtein).

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L468-L496)
- **Query Parameters:** `nome` ou `name` (string) — Nome aproximado do navio.

#### Exemplo de Requisição:
`GET /api/navios/search?nome=madona`

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "vessel": {
    "imo": "9234561",
    "nome": "MADONNA",
    "name": "MADONNA",
    "metodo": "JARO_WINKLER",
    "score": 0.96
  }
}
```

#### Resposta de Erro (`404 Not Found`):
```json
{
  "success": false,
  "message": "Nenhum navio localizado no catálogo oficial para \"XYZ INEXISTENTE\"."
}
```

---

### `GET /api/lineup/historico-previsoes`
Retorna os snapshots das últimas 100 escalas concluídas ou em andamento e as métricas consolidadas de acurácia preditiva do modelo (MAE - Mean Absolute Error).

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L560-L578)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "metricas": {
    "mae_atracacao_horas": 1.42,
    "mae_desatracacao_horas": 1.85,
    "taxa_acuracia_geral": 95.8,
    "total_escalas_avaliadas": 12,
    "confianca_modelo": "ALTA"
  },
  "historico": [
    {
      "id": 1,
      "imo": "9234561",
      "nome_navio": "MADONNA",
      "mercadoria": "Barrilha",
      "volume_t": 18000,
      "berco": "101",
      "duracao_prevista_horas": 72.0,
      "duracao_real_horas": 69.5,
      "desvio_duracao_horas": -2.5,
      "precisao_percentual": 96.5,
      "status_fechamento": "CONCLUIDO"
    }
  ]
}
```

---

## 4. Automação & Sincronização SISPORT

Controles em tempo de execução para o worker em segundo plano que raspa a programação de navios do portal oficial da CDSS (`portoss.sp.gov.br`).

---

### `GET /api/sisport/config`
Consulta o estado operacional, telemetria e agendamento do worker periódico do SISPORT.

- **Fonte:** [`src/controllers/sisportConfigController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/sisportConfigController.ts#L8-L19)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "config": {
    "ativo": true,
    "intervaloMinutos": 15,
    "modoSync": "SISPORT_ONLY",
    "emExecucao": false,
    "ultimaExecucao": "2026-10-18T14:15:00.000Z",
    "proximaExecucao": "2026-10-18T14:30:00.000Z",
    "tempoRestanteSegundos": 485,
    "ultimoStatus": "SUCESSO",
    "ultimoErro": null,
    "totalEscalasUltimoSync": 6
  }
}
```

---

### `PUT /api/sisport/config`
Reconfigura em tempo real os parâmetros do worker (pausar/ativar, mudar frequência de minutos ou modo de sincronização).

- **Fonte:** [`src/controllers/sisportConfigController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/sisportConfigController.ts#L24-L43)
- **Headers:** `Content-Type: application/json`

#### Payload da Requisição:
```json
{
  "ativo": true,
  "intervaloMinutos": 30,
  "modoSync": "FULL_SYNC"
}
```

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "message": "Parâmetros de sincronização do SISPORT atualizados com sucesso.",
  "config": {
    "ativo": true,
    "intervaloMinutos": 30,
    "modoSync": "FULL_SYNC",
    "emExecucao": false,
    "ultimoStatus": "SUCESSO"
  }
}
```

---

### `POST /api/sisport/sync`
Dispara manualmente e sob demanda uma sincronização com o SISPORT, protegida por Mutex contra concorrência simultânea.

- **Fonte:** [`src/controllers/sisportConfigController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/sisportConfigController.ts#L48-L80)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "message": "Sincronização manual concluída! 6 escalas importadas da CDSS.",
  "total": 6,
  "data": [ /* lista de navios atualizada */ ],
  "operacional": { /* kpis */ }
}
```

#### Resposta de Erro de Concorrência (`409 Conflict`):
```json
{
  "success": false,
  "error": "Já existe uma sincronização com o SISPORT em andamento. Aguarde alguns instantes."
}
```

---

### `POST /api/sisport/sync-all`
Dispara a sincronização total e irrestrita: importa o SISPORT, resolve IMOs desconhecidos via catálogo e atualiza telemetria AIS para todos os navios em aproximação.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L449-L466)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "message": "Sincronização completa realizada com sucesso em 2.45s",
  "total": 6,
  "stats": {
    "totalSisport": 6,
    "catalogoIdentificados": 2,
    "dataDockedAtualizados": 4,
    "tempoDecorridoMs": 2450
  },
  "data": [ /* navios */ ],
  "operacional": { /* kpis */ }
}
```

---

## 5. Praticagem de São Paulo (SP Pilots)

Endpoints para consulta e sincronização da Pauta de Serviços e Manobras da Praticagem (`ssb.sppilots.com.br`).

---

### `GET /api/praticagem/pauta`
Retorna a pauta de manobras categorizadas e o tráfego do porto (aguardados, fundeados e atracados).

- **Fonte:** [`src/controllers/praticagemController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L4-L15)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "manobras": {
    "encerradas": [],
    "emAndamento": [],
    "confirmadas": [
      {
        "id": 102,
        "spManobraId": 85412,
        "categoria": "CONFIRMADAS",
        "categoriaLabel": "Manobras Confirmadas",
        "corFundo": "#c8e6c9",
        "nomeNavio": "MADONNA",
        "imo": "9234561",
        "tipoManobra": "S",
        "localOrigem": "CAIS PUBLICO",
        "localDestino": "BARRA",
        "horarioStr": "21/10 06:00",
        "horarioIso": "2026-10-21T06:00:00-03:00",
        "indicadores": ["Prático a Bordo", "Rebocador Confirmado"],
        "agente": "Wilson Sons",
        "calado": 8.5,
        "vinculoLineupImo": "9234561"
      }
    ],
    "confirmadasAgente": [],
    "solicitadas": []
  },
  "resumoPorto": {
    "aguardados": [],
    "fundeados": [
      { "tipo": "FUNDEADOS", "navio": "JACAMAR ARROW", "berco": "FUNDEIO 2", "dataHoraStr": "18/10 10:30" }
    ],
    "atracados": [
      { "tipo": "ATRACADOS", "navio": "MADONNA", "berco": "101", "dataHoraStr": "18/10 11:30" }
    ]
  },
  "syncStatus": {
    "ultimaSincronizacao": "2026-10-18T14:30:00.000Z",
    "status": "SUCESSO",
    "totalManobras": 8,
    "totalAguardados": 1,
    "totalFundeados": 2,
    "totalAtracados": 1
  }
}
```

---

### `POST /api/praticagem/sync`
Força a raspagem autenticada imediata do portal da Praticagem e recalcula a projeção real no line-up.

- **Fonte:** [`src/controllers/praticagemController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L17-L33)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "totalManobras": 8,
  "data": { /* pauta de praticagem atualizada */ }
}
```

---

## 6. Telemetria Náutica, Hidrografia & Clima

---

### `GET /api/operacional/resumo` (e `GET /api/financeiro/resumo`)
Retorna os indicadores consolidados de ocupação do cais e métricas de acurácia.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L405-L416)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "data": {
    "taxa_ocupacao_berco": 87.5,
    "total_navios": 5,
    "navios_em_operacao": 1,
    "navios_fundeados": 2,
    "horas_ocupadas": 294.0,
    "volume_total_t": 82000,
    "metricas_acuracia": {
      "mae_atracacao_horas": 1.42,
      "mae_desatracacao_horas": 1.85,
      "taxa_acuracia_geral": 95.8,
      "total_escalas_avaliadas": 12,
      "confianca_modelo": "ALTA"
    }
  }
}
```

---

### `GET /api/clima`
Retorna as condições meteorológicas em tempo real do Canal de São Sebastião.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L418-L429)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "data": {
    "temperaturaAprox": 24.5,
    "precipitacaoAtual": 0.0,
    "horasChuvaProximas24h": 3,
    "condicaoDescricao": "Parcialmente Nublado",
    "ventoAproxKmH": 14.2
  }
}
```

---

### `GET /api/weather/tide/current`
Retorna o nível d'água instantâneo e a tendência de maré capturada dos sensores maregráficos do SP Pilots.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L534-L545)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "data": {
    "alturaMetros": 1.28,
    "tendencia": "Enchendo",
    "proximaPreamar": "18/10 16:45",
    "alturaPreamar": 1.42,
    "proximaBaixamar": "18/10 22:15",
    "alturaBaixamar": 0.35,
    "atualizadoEm": "2026-10-18T14:32:00.000Z",
    "fonte": "SP_PILOTS",
    "mensagemStatus": "Maré Enchendo (1.28m)"
  }
}
```

---

### `GET /api/weather/rain/forecast`
Retorna a grade horária de probabilidade e intensidade de precipitação para as próximas 72 horas.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L547-L558)

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "data": {
    "times": ["2026-10-18T14:00", "2026-10-18T15:00", "2026-10-18T16:00"],
    "precipitation": [0.0, 1.8, 2.4],
    "unidade": "mm/h"
  }
}
```

---

### `GET /api/mares`
Retorna a interpolação harmônica contínua de maré da DHN, pontos extremos (preamares e baixa-mares) e os parâmetros náuticos de referência do porto.

- **Fonte:** [`src/controllers/lineupController.ts`](file:///d:/DEV/CDSS-Lineup/src/controllers/lineupController.ts#L498-L532)
- **Query Parameter (Opcional):** `escalaDias` (inteiro, padrão: `14`, mín: 3, máx: 60) — Horizonte de tempo para projeção da curva.

#### Exemplo de Requisição:
`GET /api/mares?escalaDias=14`

#### Resposta de Sucesso (`200 OK`):
```json
{
  "success": true,
  "statusAtual": {
    "dataHoraIso": "2026-10-18T14:30:00Z",
    "altura_m": 1.18,
    "tendencia": "SUBINDO",
    "estacao": "Porto de São Sebastião (DHN)",
    "proximoExtremo": {
      "dataHoraIso": "2026-10-18T16:45:00Z",
      "altura_m": 1.42,
      "tipo": "PREAMAR",
      "label": "Preamar 1.42m"
    },
    "marareCorrenteDescricao": "Maré Enchendo (1.18m)"
  },
  "curva": [
    { "dataHoraIso": "2026-10-18T00:00:00Z", "altura_m": 0.45, "tendencia": "SUBINDO" }
  ],
  "extremos": [
    { "dataHoraIso": "2026-10-18T16:45:00Z", "altura_m": 1.42, "tipo": "PREAMAR", "label": "Preamar 1.42m" },
    { "dataHoraIso": "2026-10-18T22:15:00Z", "altura_m": 0.35, "tipo": "BAIXA_MAR", "label": "Baixa-mar 0.35m" }
  ],
  "telemetriaSpPilots": {
    "alturaMetros": 1.28,
    "tendencia": "Enchendo",
    "fonte": "SP_PILOTS"
  },
  "parametrosPorto": {
    "profundidadeBercoZh": 10.0,
    "ukcMinimo": 0.5,
    "caladoCriticoLimiar": 8.5,
    "estacaoNome": "Porto de São Sebastião (DHN - Canal de São Sebastião)"
  }
}
```

---

## 7. Geofencing & Identificação Espacial de Berços

---

### `GET /api/bercos/identificar`
Determina matematicamente se um par de coordenadas geográficas de transponder AIS pertence à linha de acostagem física de um dos berços da CDSS (101 comercial ou 201 a 204 internos), calculando a distância euclidiana/ortodrômica perpendicular em metros.

- **Fonte:** [`src/routes/api.ts`](file:///d:/DEV/CDSS-Lineup/src/routes/api.ts#L68-L78) · [`src/services/bercoGeoService.ts`](file:///d:/DEV/CDSS-Lineup/src/services/bercoGeoService.ts)
- **Query Parameters:**
  - `lat` (número, obrigatório): Latitude WGS84 (ex.: `-23.8114`).
  - `lon` (número, obrigatório): Longitude WGS84 (ex.: `-45.3974`).
  - `sog` (número, opcional): Velocidade sobre o fundo (*Speed Over Ground*) em nós.

#### Exemplo de Requisição:
`GET /api/bercos/identificar?lat=-23.8114&lon=-45.3974&sog=0.1`

#### Resposta de Sucesso (`200 OK` — Dentro da tolerância do Berço 101):
```json
{
  "success": true,
  "data": {
    "berco": "101",
    "nomeBerco": "Cais Comercial (Berço 101)",
    "tipo": "comercial",
    "distanciaMetros": 12.4,
    "confianca": "ALTA",
    "dentroTolerancia": true
  }
}
```

#### Resposta de Sucesso (`200 OK` — Fora de qualquer berço, em alto-mar ou fundeio):
```json
{
  "success": true,
  "data": null
}
```

#### Resposta de Erro (`400 Bad Request`):
```json
{
  "success": false,
  "error": "Parâmetros lat e lon são obrigatórios."
}
```

---

## 8. Comunicação em Tempo Real & Ausência de WebSockets

> ℹ️ **Decisão de Arquitetura de Comunicação:**  
> A aplicação **não implementa WebSockets nativos (`ws://` / `wss://`) nem SSE (*Server-Sent Events*)**.

### Motivações Técnicas:
1. **Conformidade com Redes Corporativas Portuárias:** As estações de trabalho de Centros de Controle Operacional frequentemente operam atrás de firewalls estritos, proxies inspecionadores e balanceadores de carga com políticas agressivas de timeout TCP que encerram conexões persistentes de WebSocket de longa duração.
2. **Polling Reativo Inteligente:** O cliente web implementa polling periódico via requisições HTTP REST padronizadas:
   - Polling de **Telemetria de Maré ao Vivo:** A cada 60 segundos (`/api/weather/tide/current`).
   - Polling de **Telemetria do Worker SISPORT:** A cada 10 segundos (`/api/sisport/config`), recarregando o line-up completo apenas quando detecta que `ultimaExecucao` foi alterada.
3. **Idempotência e Cache:** As consultas REST são idempotentes, leves e se beneficiam do pool de conexões do driver `postgres`, garantindo latência de resposta $< 15\,\text{ms}$.

---

## 9. Tabela de Códigos de Status HTTP

| Código | Nome | Quando é retornado |
|---|---|---|
| `200` | OK | Requisições de consulta (`GET`) ou mutações executadas com sucesso (`PUT`, `DELETE`). |
| `201` | Created | Criação bem-sucedida de nova escala de navio (`POST /api/navios`). |
| `400` | Bad Request | Dados de entrada inválidos, campos obrigatórios ausentes ou conflito de IMO. |
| `404` | Not Found | Navio não encontrado no catálogo ou ID de escala inexistente no banco. |
| `409` | Conflict | Disparo manual de sincronização do SISPORT enquanto outro ciclo já está rodando. |
| `500` | Internal Server Error | Falha inesperada durante o processamento interno ou recálculo do motor. |
| `503` | Service Unavailable | Healthcheck probe quando o banco de dados PostgreSQL está inacessível. |
