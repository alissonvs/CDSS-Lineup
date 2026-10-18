# PCS Lineup — Documentação Técnica & Arquitetura

> **Versão:** 2.0.0 · **Última atualização:** 2026-10-18 · **Gerado a partir da análise rigorosa do código-fonte.**

---

## Sumário
1. [Visão Geral Técnica](#1-visão-geral-técnica)
2. [Stack Tecnológica & Dependências](#2-stack-tecnológica--dependências)
3. [Estrutura de Diretórios](#3-estrutura-de-diretórios)
4. [Variáveis de Ambiente & Configurações](#4-variáveis-de-ambiente--configurações)
5. [Diagrama de Arquitetura do Sistema](#5-diagrama-de-arquitetura-do-sistema)
6. [Diagrama de Sequência — Fluxo Operacional Crítico](#6-diagrama-de-sequência--fluxo-operacional-crítico)
7. [Modelo de Dados (PostgreSQL)](#7-modelo-de-dados-postgresql)
8. [Motor Algorítmico Preditivo & Inteligência Náutica](#8-motor-algorítmico-preditivo--inteligência-náutica)
9. [Guia de Inicialização & Ambiente Local](#9-guia-de-inicialização--ambiente-local)
10. [Deploy em Produção (Docker & Dokploy)](#10-deploy-em-produção-docker--dokploy)
11. [Pontos de Atenção & Inconsistências Identificadas](#11-pontos-de-atenção--inconsistências-identificadas)

---

## 1. Visão Geral Técnica

O **PCS Lineup** é um sistema web operacional de missão crítica, alta densidade informacional e análise preditiva desenvolvido para o **Centro de Controle Operacional (CCO)** da **Companhia Docas de São Sebastião (CDSS)**.

A aplicação gerencia a programação de atracação de navios (*line-up* comercial e de cabotagem), orquestrando em tempo real:
- A ocupação do **Cais Comercial Único (Berço 101)** e dos **Berços Internos de Apoio (201 a 204)**.
- O cálculo determinístico da duração de operação baseado em pranchas mínimas regulamentares e históricas por tipo de carga.
- A dedução preditiva de paralisações por precipitação para granéis sensíveis (chuva horária).
- A análise hidrodinâmica de **Folga Abaixo da Quilha (UKC - Under Keel Clearance)** considerando maré astronômica (DHN), telemetria ao vivo da maré e duplo calado náutico (Entrada vs. Saída).
- A sincronização automatizada com o **SISPORT Oficial** da CDSS e a reconciliação inteligente com a **Pauta de Manobras da Praticagem de São Paulo (SP Pilots)**.
- Telemetria de posicionamento satelital via transponder **AIS (DataDocked)** e geofencing de berço.

A arquitetura é dividida em dois blocos principais:
- **Backend:** API REST monolítica construída em Node.js (TypeScript) com Express e driver assíncrono `postgres`.
- **Frontend:** SPA (Single Page Application) moderna em React 19 + TypeScript + Vite + Tailwind CSS v4, com suporte a temas Dark/Light, gráfico Gantt SVG/HTML customizado, cartografia Leaflet/CARTO e painéis de telemetria.

---

## 2. Stack Tecnológica & Dependências

### 2.1. Tabela de Tecnologias

| Camada | Tecnologia | Versão | Propósito / Papel Arquitetural |
|---|---|---|---|
| **Runtime** | Node.js | `>=20.0.0` (LTS 22 recomendada) | Ambiente de execução JavaScript/TypeScript do backend e build de assets. |
| **Linguagem (Backend)** | TypeScript | `^5.7.3` | Tipagem estática rigorosa (`strict mode`), interfaces compartilhadas de domínio marítimo. |
| **Framework HTTP** | Express | `^4.21.2` | Roteamento REST, middlewares de CORS, JSON parsing e graceful shutdown. |
| **Driver de Banco** | `postgres` (porsager) | `^3.4.9` | Driver nativo TypeScript para PostgreSQL com tagged template literals e connection pooling. |
| **Banco de Dados** | PostgreSQL | `16-alpine` / `18` | Banco relacional com suporte a tipos nativos, índices parciais e JSONB. |
| **Web Scraping & HTML**| Cheerio | `^1.2.0` | Parsing e extração resiliente de dados de páginas legadas do SISPORT e Praticagem. |
| **Testes Automatizados** | Vitest | `^5.0.5` | Suíte de testes unitários determinísticos (39 testes cobrindo engine, math, geofence e parsers). |
| **Frontend Framework** | React | `^19.2.8` | Biblioteca de componentes declarativos para interface de alta densidade do CCO. |
| **Build Tool (Frontend)** | Vite | `^8.3.0` | Bundler ESM ultrarrápido para desenvolvimento e empacotamento de produção. |
| **Estilização** | Tailwind CSS (v4) | `^4.3.3` | Utility-first CSS com `@tailwindcss/postcss`, tokens corporativos e suporte a temas Dark/Light. |
| **Cartografia & GIS** | Leaflet | `^1.9.4` | Renderização do mapa do Canal de São Sebastião, boias, berços e poligonais da ANTAQ. |
| **Tiles de Mapa** | CARTO Basemaps | API v1 | Mapas base náuticos de alta precisão (Positron, Dark Matter, Voyager, Satellite). |
| **Ícones** | Lucide React | `^1.47.0` | Ícones SVG consistentes para o cockpit do CCO. |
| **Linter Frontend** | Oxlint | `^1.81.0` | Linter estático de alta velocidade em Rust para JavaScript/TypeScript. |
| **Contêineres** | Docker & Compose | Multi-stage (Node 22) | Padronização de build (`builder` e `runner`) e orquestração de microsserviços. |

### 2.2. Serviços Externos e Provedores de Dados

```mermaid
flowchart LR
    CDSS["PCS Lineup Backend"]
    
    CDSS -->|"HTML Scraping (Cheerio)"| SIS["SISPORT Oficial (portoss.sp.gov.br)"]
    CDSS -->|"Sessão & HTML Scraping"| SPP["Praticagem SP Pilots (ssb.sppilots.com.br)"]
    CDSS -->|"REST API / x-api-key"| DD["DataDocked AIS API (datadocked.com)"]
    CDSS -->|"REST API (HTTP GET)"| METEO["Open-Meteo Weather API (open-meteo.com)"]
    CDSS -->|"Constantes Harmônicas"| DHN["Marinha do Brasil / DHN (CHM)"]
    FE["Frontend (Navegador)"] -->|"Raster Map Tiles"| CARTO["CARTO Basemaps CDN (cartocdn.com)"]
```

1. **SISPORT Oficial (`portoss.sp.gov.br`):**
   - Fonte primária oficial de escalas comerciais da CDSS.
   - Extrai: IMO, nome do navio, tipo, mercadoria, volume, calado, armazém, previsão de chegada, início de atracação, fim de atracação e % de progresso da operação no berço.
2. **Praticagem de São Paulo — SP Pilots (`ssb.sppilots.com.br`):**
   - Coleta a **Pauta de Manobras e Serviços** (manobras de Entrada `E`, Saída `S` e Mudança `M`, categorias: Encerradas, Em Andamento, Confirmadas, Confirmadas Agente e Solicitadas).
   - Coleta a **Telemetria de Maré ao Vivo** (nível da água em metros, tendência e próximos extremos).
3. **DataDocked AIS Telemetria Satelital (`datadocked.com`):**
   - Coleta a posição satelital em tempo real (latitude, longitude, SOG, COG, status de navegação, sinal de antena) e o ETA transmitido pelo transponder da embarcação.
4. **Open-Meteo Forecast API (`api.open-meteo.com`):**
   - Fornece previsão horária de precipitação (`precipitation` em mm/h) para as coordenadas do Porto de São Sebastião (`lat=-23.8045, lon=-45.3970`), alimentando o cálculo de paralisação por chuva.
5. **Diretoria de Hidrografia e Navegação — DHN / CHM:**
   - Tábua astronômica oficial de extremos de preamar e baixa-mar do Canal de São Sebastião, persistida na tabela `tabua_mares`.
6. **CARTO Basemaps (`carto.com`):**
   - Provedor de tiles vetoriais/raster em alta definição para renderização cartográfica via Leaflet.

---

## 3. Estrutura de Diretórios

Abaixo está o mapeamento dos componentes de código-fonte da aplicação:

```
d:\DEV\CDSS-Lineup\
├── .env.example                  # Modelo de variáveis de ambiente do projeto
├── Dockerfile                    # Multi-stage build Docker (builder + runner enxuto)
├── docker-compose.yml            # Orquestração local de PostgreSQL 16 + App Express
├── package.json                  # Manifest do backend, scripts npm e dependências Node
├── tsconfig.json                 # Configurações do compilador TypeScript para backend
│
├── src/                          # CÓDIGO-FONTE DO BACKEND (Node.js + Express)
│   ├── server.ts                 # Ponto de entrada, middlewares, inicialização e graceful shutdown
│   ├── version.ts                # Definição e exportação da versão ativa (APP_VERSION)
│   ├── database/
│   │   ├── connection.ts         # Pool de conexões PostgreSQL com driver 'postgres'
│   │   └── init.ts               # DDL de criação de tabelas, índices e migrações defensivas
│   ├── routes/
│   │   └── api.ts                # Mapeamento centralizado de todas as rotas REST (/api/*)
│   ├── controllers/
│   │   ├── lineupController.ts   # Handlers para lineup, navios, clima, marés e histórico
│   │   ├── praticagemController.ts # Handlers para pauta e sincronização da Praticagem
│   │   └── sisportConfigController.ts # Handlers para agendador/worker do SISPORT
│   ├── services/
│   │   ├── engine.ts             # Motor matemático: duração, cascata, PMD, folgas e acurácia
│   │   ├── bercoGeoService.ts    # Geofencing espacial: identificação de berço por coordenadas
│   │   ├── tideService.ts        # Modelagem náutica: UKC, duplo calado e interpolação harmônica
│   │   ├── praticagemService.ts  # Scraper e parser da Pauta de Manobras da SP Pilots
│   │   ├── spPilotsService.ts    # Scraper e parser da telemetria de maré ao vivo da SP Pilots
│   │   ├── sisportSync.ts        # Scraper e normalizador de escalas do SISPORT Oficial
│   │   ├── sisportSchedulerService.ts # Worker periódico em background com Mutex lock
│   │   ├── syncAllService.ts     # Orquestrador de sincronização completa (SISPORT + Praticagem + AIS)
│   │   ├── navioMatcherService.ts # Resolução de IMO via casamento difuso de nomes
│   │   ├── datadocked.ts         # Integração com API satelital AIS DataDocked + mock local
│   │   └── weather.ts            # Integração com Open-Meteo e cálculo de horas de chuva
│   ├── scripts/
│   │   ├── importNavios.ts       # Script de carga inicial do catálogo naval (Navios.csv)
│   │   └── syncSisport.ts        # Script CLI avulso para sincronização do SISPORT
│   └── types/
│       └── index.ts              # Tipos TypeScript, interfaces de domínio e modelos de resposta
│
├── client/                       # CÓDIGO-FONTE DO FRONTEND (React 19 + Vite)
│   ├── package.json              # Dependências do cliente web
│   ├── vite.config.ts            # Configurações do Vite, proxy reverso e build
│   ├── index.html                # Ponto de entrada HTML do SPA
│   └── src/
│       ├── main.tsx              # Bootstrap do React 19
│       ├── App.tsx               # Orquestrador de estado global, abas e polling periódico
│       ├── index.css             # Estilos globais Tailwind CSS v4 e temas Dark/Light
│       ├── context/
│       │   └── ThemeContext.tsx   # Provedor de contexto para alternância Dark/Light
│       ├── components/
│       │   ├── Header.tsx        # Barra superior com KPIs de ocupação, clima e controles de sincronização
│       │   ├── GanttChart.tsx    # Gráfico Gantt CCO com fitas de berços, modos Essencial/Detalhado e curva DHN
│       │   ├── GanttShipDetailsModal.tsx # Prontuário náutico flutuante completo da embarcação
│       │   ├── NavioModal.tsx    # Modal de criação e edição completa de escalas de navios
│       │   ├── CanalMap.tsx      # Mapa Leaflet náutico interativo do Canal e Porto
│       │   ├── AdminQueue.tsx    # Painel de gestão de fila, prioridades e reordenação
│       │   ├── PraticagemView.tsx# Painel dedicado à Pauta de Manobras e Tráfego do Porto
│       │   ├── ConfirmDeleteModal.tsx # Modal de confirmação segura para exclusão de escalas
│       │   └── TideWaveTrack.tsx # Componente de renderização da esteira de maré
│       ├── services/
│       │   └── api.ts            # Camada de comunicação HTTP do cliente com o backend
│       └── types/
│           └── index.ts          # Interfaces e contratos do frontend
│
├── docs/                         # DOCUMENTAÇÃO DO PROJETO & ASSETS DE DADOS
│   ├── ARQUITETURA.md            # Este documento (Documentação Técnica & Arquitetura)
│   ├── API.md                    # Mapeamento completo de contratos e endpoints HTTP da API
│   ├── DESIGN.md                 # Design System, paleta de cores e tipografia corporativa CCO
│   ├── Navios.csv                # Catálogo naval oficial com mais de 16.200 navios e IMOs
│   └── Área do Porto Organizado de São Sebastião.kmz # Poligonal oficial ANTAQ
│
└── tests/
    └── engine.test.ts            # Suíte de 39 testes com Vitest (regras matemáticas e determinísticas)
```

---

## 4. Variáveis de Ambiente & Configurações

O sistema lê suas configurações a partir de arquivos `.env` na raiz do projeto (gerenciado por `dotenv`).

### 4.1. Tabela de Variáveis

| Variável | Obrigatória | Padrão / Fallback | Propósito / Descrição | Exemplo Válido |
|---|---|---|---|---|
| `PORT` | Não | `3000` | Porta TCP em que o servidor Express escuta conexões HTTP. | `3000` |
| `HOST` | Não | `0.0.0.0` | Interface de rede para vinculação do servidor HTTP. | `0.0.0.0` |
| `NODE_ENV` | Não | `development` | Ambiente de execução (`development`, `production`, `test`). | `production` |
| `CLIENT_PORT` | Não | `5173` | Porta local utilizada pelo Vite em desenvolvimento. | `5173` |
| `DATABASE_URL` | **Sim** (Opção A) | _Nenhum_ | URL completa de conexão ao PostgreSQL (preferida em produção e Dokploy). | `postgresql://usr:pwd@host:5432/cdss` |
| `POSTGRES_USER` | **Sim** (Opção B) | `cdsslineup` | Usuário do banco caso `DATABASE_URL` não seja informada. | `cdsslineup` |
| `POSTGRES_PASSWORD` | **Sim** (Opção B) | `cdsslineup_secret` | Senha do banco caso `DATABASE_URL` não seja informada. | `sua_senha_segura` |
| `POSTGRES_DB` | **Sim** (Opção B) | `cdsslineup` | Nome da base de dados PostgreSQL. | `cdsslineup` |
| `POSTGRES_PORT` | Não | `5432` | Porta TCP do serviço PostgreSQL. | `5432` |
| `POSTGRES_HOST` | Não | `postgres` / `localhost` | Hostname do contêiner ou servidor PostgreSQL. | `postgres` ou `localhost` |
| `SP_PILOTS_USER` | Não | `docasssb` | Usuário para autenticação no portal da Praticagem de SP. | `docasssb` |
| `SP_PILOTS_PASS` | Não | _Confidencial_ | Senha para autenticação no portal da Praticagem de SP. | `sua_senha_praticagem` |
| `SP_PILOTS_URL` | Não | `https://ssb.sppilots.com.br` | URL base do portal da Praticagem de São Sebastião. | `https://ssb.sppilots.com.br` |
| `DATADOCKED_API_KEY` | Não | _Nenhum (usa mock)_ | Chave da API DataDocked para telemetria satelital AIS sob demanda. | `dd_live_abcdef123456` |
| `VITE_CARTO_API_KEY` | Não | _Nenhum (tiles std)_ | Chave do CARTO para tiles de mapa em alta definição. | `carto_apikey_xyz789` |
| `SISPORT_AUTO_SYNC_ENABLED` | Não | `true` | Habilita o worker periódico em background do SISPORT (`true`/`false`). | `true` |
| `SISPORT_SYNC_INTERVAL_MINUTES` | Não | `15` | Intervalo em minutos entre coletas automáticas do SISPORT (mín: 2, máx: 1440). | `15` |
| `SISPORT_SYNC_MODE` | Não | `SISPORT_ONLY` | Modo padrão do worker: `SISPORT_ONLY` ou `FULL_SYNC` (porto + AIS). | `SISPORT_ONLY` |

### 4.2. Variáveis de Compatibilidade e Avisos

> ⚠️ **Inconsistências identificadas no código vs. `.env.example`:**
> 1. `src/database/connection.ts` aceita chaves alternativas para o banco: `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` e `DB_NAME`. Recomenda-se padronizar no uso de `DATABASE_URL` ou prefixo `POSTGRES_*`.
> 2. `client/vite.config.ts` aceita `CARTO_API_KEY` como fallback para `VITE_CARTO_API_KEY`.
> 3. `client/vite.config.ts` injeta a versão da aplicação via variável `VITE_APP_VERSION` (lida de `package.json`).

---

## 5. Diagrama de Arquitetura do Sistema

O diagrama a seguir mapeia todos os componentes ativos da solução, detalhando o tráfego de dados e integrações:

```mermaid
graph TD
    subgraph CLIENTE["Camada Cliente — CCO Cockpit (React 19 + Vite)"]
        UI["Interface de Alta Densidade (SPA)"]
        GANTT["Gantt CCO v2.0 (Fitas Multi-Berço + Curva DHN)"]
        MAPA["Cartografia Náutica Leaflet (Tiles CARTO)"]
        PRAT_VIEW["Painel de Manobras da Praticagem"]
        ADMIN["Gestão de Fila & Reordenação de Escalas"]
        UI --> GANTT
        UI --> MAPA
        UI --> PRAT_VIEW
        UI --> ADMIN
    end

    subgraph BACKEND["Camada Servidora — Express 4 + Node.js 22"]
        SERVER["src/server.ts (HTTP Server & Lifecycle)"]
        ROUTER["src/routes/api.ts (Roteador REST)"]
        
        subgraph CONTROLLERS["Controladores"]
            CTRL_LINEUP["lineupController.ts"]
            CTRL_PRAT["praticagemController.ts"]
            CTRL_SIS["sisportConfigController.ts"]
        end

        subgraph WORKERS["Workers em Background"]
            SCHED_SIS["sisportSchedulerService.ts (Worker Periódico SISPORT)"]
            INTERVAL_PRAT["Praticagem & Telemetria Poller (5 min)"]
        end

        subgraph CORE_SERVICES["Serviços de Domínio & Engenharia Náutica"]
            ENGINE["engine.ts (Motor de Encadeamento & Waterfall)"]
            TIDE_SVC["tideService.ts (UKC, Marés DHN & Duplo Calado)"]
            GEO_SVC["bercoGeoService.ts (Geofencing de Berços)"]
            MATCH_SVC["navioMatcherService.ts (Fuzzy Matcher Jaro-Winkler)"]
            WEATHER_SVC["weather.ts (Previsão de Chuva Open-Meteo)"]
            SYNC_ALL["syncAllService.ts (Orquestrador de Sincronização)"]
            SP_PILOTS_SVC["spPilotsService.ts (Scraper Telemetria Maré)"]
            PRAT_SVC["praticagemService.ts (Scraper Pauta Manobras)"]
            SIS_SYNC["sisportSync.ts (Scraper Oficial CDSS)"]
            AIS_SVC["datadocked.ts (Telemetria Satelital AIS)"]
        end

        SERVER --> ROUTER
        ROUTER --> CTRL_LINEUP
        ROUTER --> CTRL_PRAT
        ROUTER --> CTRL_SIS

        CTRL_LINEUP --> ENGINE
        CTRL_LINEUP --> TIDE_SVC
        CTRL_LINEUP --> GEO_SVC
        CTRL_LINEUP --> WEATHER_SVC
        CTRL_LINEUP --> AIS_SVC

        CTRL_PRAT --> PRAT_SVC
        CTRL_SIS --> SCHED_SIS
        
        SCHED_SIS --> SIS_SYNC
        SCHED_SIS --> SYNC_ALL
        INTERVAL_PRAT --> SP_PILOTS_SVC
        INTERVAL_PRAT --> PRAT_SVC

        SIS_SYNC --> MATCH_SVC
        SYNC_ALL --> SIS_SYNC
        SYNC_ALL --> AIS_SVC
        ENGINE --> TIDE_SVC
        ENGINE --> GEO_SVC
        ENGINE --> WEATHER_SVC
    end

    subgraph STORAGE["Camada de Persistência — PostgreSQL 16+"]
        POOL["Driver 'postgres' (Pool assíncrono de conexões)"]
        DB[("PostgreSQL Database")]
        
        POOL --> DB
    end

    subgraph EXTERNAL["Fontes de Dados & Provedores Externos"]
        EXT_SIS["SISPORT (portoss.sp.gov.br)"]
        EXT_PRAT["Praticagem SP Pilots (ssb.sppilots.com.br)"]
        EXT_AIS["DataDocked AIS API"]
        EXT_METEO["Open-Meteo API"]
        EXT_CARTO["CARTO CDN"]
    end

    %% Conexões de rede
    UI -->|"HTTP / REST API (JSON)"| SERVER
    MAPA -->|"HTTPS Raster Tiles"| EXT_CARTO

    SIS_SYNC -->|"HTTPS Scraping"| EXT_SIS
    PRAT_SVC -->|"HTTPS Scraping (Auth)"| EXT_PRAT
    SP_PILOTS_SVC -->|"HTTPS Scraping"| EXT_PRAT
    AIS_SVC -->|"HTTPS REST (x-api-key)"| EXT_AIS
    WEATHER_SVC -->|"HTTPS REST JSON"| EXT_METEO

    CORE_SERVICES --> POOL
    CONTROLLERS --> POOL
    SCHED_SIS --> POOL
```

---

## 6. Diagrama de Sequência — Fluxo Operacional Crítico

O fluxo a seguir ilustra o ciclo de uma sincronização com o SISPORT, resolução fonética de IMO, enriquecimento por telemetria, encadeamento em cascata no motor determinístico e atualização da interface:

```mermaid
sequenceDiagram
    autonumber
    actor CCO as Operador CCO (Frontend)
    participant API as Express Router (/api)
    participant SIS_CTRL as SisportConfigController
    participant SCHED as SisportSchedulerService
    participant SYNC as SisportSync
    participant MATCHER as NavioMatcherService
    participant MOTOR as Engine (engine.ts)
    participant TIDE as TideService
    participant DB as PostgreSQL (lineup_navios)

    CCO->>API: POST /api/sisport/sync (ou Worker Periódico)
    API->>SIS_CTRL: triggerSisportSyncHandler()
    SIS_CTRL->>SCHED: executarSincronizacao('MANUAL')
    
    alt Já existe execução em andamento
        SCHED-->>SIS_CTRL: 409 Conflict (JA_EM_EXECUCAO)
        SIS_CTRL-->>CCO: Alerta de concorrência
    else Concorrência liberada
        SCHED->>SYNC: sincronizarComSisportOficial()
        SYNC->>SYNC: HTTP GET na programação oficial portoss.sp.gov.br
        SYNC->>SYNC: Parse HTML das escalas via Cheerio
        
        loop Para cada escala raspada
            opt Navio sem IMO cadastrado
                SYNC->>MATCHER: buscarImoNoCatalogo(nomeNavio)
                MATCHER->>DB: Busca fonética / Jaro-Winkler em 'navios'
                DB-->>MATCHER: IMO oficial resolvido
                MATCHER-->>SYNC: IMO identificado
            end
            SYNC->>DB: UPSERT escala em lineup_navios
        end

        SYNC->>MOTOR: recalcularLineupComMotor(true)
        MOTOR->>TIDE: analisarRestricaoMareNavio(calado, volume, datas)
        TIDE-->>MOTOR: Limites de UKC, risco de manobra e preamares
        MOTOR->>MOTOR: Algoritmo de Cascata (Waterfall Scheduling + Chuva)
        MOTOR->>DB: Atualiza marcos calculados e status
        MOTOR-->>SCHED: Lineup consolidado recalculado
        SCHED-->>SIS_CTRL: Sucesso (total sincronizados)
        SIS_CTRL-->>CCO: 200 OK + Payload de Navios e Resumo Operacional
        CCO->>CCO: Re-renderiza Gantt, Ficha Técnica e Linha 'AGORA'
    end
```

---

## 7. Modelo de Dados (PostgreSQL)

O banco de dados é inicializado automaticamente pelo script `src/database/init.ts` na subida do backend, garantindo que todas as tabelas, índices e migrações incrementais estejam aplicadas.

### 7.1. Diagrama ERD (Entity-Relationship)

```mermaid
erDiagram
    LINEUP_NAVIOS {
        int id PK
        string imo UK "IMO único da embarcação"
        string nome_navio "Nome da embarcação"
        string tipo_navio "Graneleiro, Carga Geral, etc."
        string mercadoria "Barrilha, Trigo, Malte, etc."
        float volume_t "Volume de carga em toneladas"
        float loa "Comprimento total em metros"
        float dwt "Porte bruto / TPB em toneladas"
        float calado "Calado operacional geral em metros"
        float calado_entrada "Calado na atracação (m)"
        float calado_saida "Calado na desatracação (m)"
        string agencia "Agência de navegação"
        int ordem_fila "Prioridade sequencial no berço (1, 2...)"
        int ordem_sisport "Ordem oficial vinda do SISPORT"
        string status_cor "LARANJA, VERMELHO, CINZA, VERDE, AZUL"
        string status_sisport "Status oficial vindo do SISPORT"
        int livre_pratica_ok "0: Pendente, 1: Concedida"
        int armazem_publico "0: Direta, 1: Armazém Público CDSS"
        string eta_previsto "Previsão Oficial de Chegada (ISO)"
        string eta_ais "Previsão informada pelo AIS Transponder"
        string inicio_operacao "Início da Operação (Previsão / Real)"
        string chegada_fundeio "Entrada física na barra"
        string inicio_atracacao "Início do berço (Real ou Projetado)"
        string fim_atracacao "Término do berço (Real ou Projetado)"
        float latitude "Latitude da posição AIS"
        float longitude "Longitude da posição AIS"
        string sinal_antena "Timestamp do sinal AIS recebido"
        string ais_sincronizado_em "Momento da sincronização AIS"
        float progresso_operacao "% de descarga no berço (SISPORT)"
        string berco "Berço designado (101, 201..)"
        string origem_previsao_fim "CALCULADO, PRATICAGEM ou MANUAL"
        int manobra_praticagem_id "FK lógica para praticagem_manobras"
        string manobra_praticagem_str "Horário oficial da manobra na Praticagem"
        int ajuste_praticagem_ativo "1: Permite ajuste automático, 0: Bloqueia"
        string ultima_atualizacao "Timestamp da última modificação"
    }

    PRANCHAS_PRODUTIVIDADE {
        string mercadoria PK "Nome oficial da mercadoria"
        float prancha_minima_dia "Produtividade regulamentar CDSS (t/dia)"
        float pmd_historica "Média histórica observada (t/dia)"
        int sensivel_chuva "1: Interrompe na chuva, 0: Não interrompe"
    }

    TABUA_MARES {
        int id PK
        string estacao "Estação maregráfica (SAO_SEBASTIAO)"
        string data_hora "Data/hora ISO 8601 UTC"
        string tipo "PREAMAR ou BAIXA_MAR"
        float altura_m "Altura em metros sobre o Zero Hidrográfico"
    }

    TIDE_TELEMETRY {
        int id PK "Singleton (id = 1)"
        float water_level "Nível da água em metros"
        string tendency "Enchendo, Vazando ou Estável"
        string next_high_tide_time "Horário da próxima preamar"
        float next_high_tide_height "Altura da próxima preamar (m)"
        string next_low_tide_time "Horário da próxima baixa-mar"
        float next_low_tide_height "Altura da próxima baixa-mar (m)"
        string source "SP_PILOTS ou DHN_FALLBACK"
        string updated_at "Timestamp da atualização"
        string raw_payload "Conteúdo HTML bruto capturado"
        bigint captured_at "Timestamp epoch da captura"
    }

    NAVIOS {
        int id PK
        string nome "Nome cadastrado da embarcação"
        string imo "Número IMO oficial (7 dígitos)"
        timestamp criado_em "Data de inserção no catálogo"
    }

    PRATICAGEM_MANOBRAS {
        int id PK
        int sp_manobra_id "ID interno da manobra no SP Pilots"
        string categoria "ENCERRADAS, EM_ANDAMENTO, CONFIRMADAS..."
        string categoria_label "Rótulo legível da categoria"
        string cor_fundo "Hexadecimal de fundo original"
        string nome_navio "Nome do navio constante na pauta"
        string imo "IMO da embarcação se identificado"
        string tipo_manobra "E: Entrada, S: Saída, M: Mudança"
        string local_origem "Berço/Fundeio de partida"
        string local_destino "Berço/Fundeio de destino"
        string horario_str "String original (DD/MM HH:mm)"
        string horario_iso "String ISO normalizada com offset BRT"
        jsonb indicadores "Lista de ícones/badges da manobra"
        string agente "Agência de navegação"
        float calado "Calado informado na manobra (m)"
        string bordo "Bordo de atracação (BE, BB)"
        string rebocador "Quantidade/especificação de rebocadores"
        string observacoes "Notas operacionais da Praticagem"
        jsonb detalhes_navio "Metadados complementares em chave-valor"
        string vinculo_lineup_imo "IMO correspondente no Lineup CDSS"
        timestamp atualizado_em "Data de atualização"
    }

    PRATICAGEM_RESUMO_PORTO {
        int id PK
        string tipo "AGUARDADOS, FUNDEADOS, ATRACADOS"
        string navio "Nome da embarcação"
        string berco "Berço ou cais ocupado"
        string data_hora_str "Data/hora formatada"
        string data_hora_iso "Data/hora ISO normalizada"
        int ordem "Posição na listagem"
        string vinculo_lineup_imo "IMO vinculado no Line-up"
        timestamp atualizado_em "Data de atualização"
    }

    PRATICAGEM_SYNC_STATUS {
        int id PK "Singleton (id = 1)"
        timestamp ultima_sincronizacao "Momento da última raspagem"
        string status "SUCESSO ou ERRO"
        int total_manobras "Quantidade total de manobras"
        int total_aguardados "Contador de navios aguardados"
        int total_fundeados "Contador de navios fundeados"
        int total_atracados "Contador de navios atracados"
        string mensagem_erro "Detalhe de falha se houver"
    }

    SISPORT_SYNC_CONFIG {
        int id PK "Singleton (id = 1)"
        boolean ativo "Habilita ou pausa o worker em background"
        int intervalo_minutos "Periodicidade de execução em minutos"
        string modo_sync "SISPORT_ONLY ou FULL_SYNC"
        timestamp ultima_execucao "Data/hora do último disparo"
        timestamp proxima_execucao "Previsão do próximo disparo"
        boolean em_execucao "Flag de Mutex (impede concorrência)"
        string ultimo_status "SUCESSO, ERRO, EM_ANDAMENTO, PAUSADO"
        string ultimo_erro "Log da última falha"
        int total_escalas_ultimo_sync "Escalas processadas no último ciclo"
        timestamp atualizado_em "Data de alteração dos parâmetros"
    }

    LINEUP_HISTORICO_PREVISOES {
        int id PK
        int lineup_id "ID original da escala em lineup_navios"
        string imo "IMO da embarcação"
        string nome_navio "Nome da embarcação"
        string mercadoria "Mercadoria movimentada"
        float volume_t "Volume em toneladas"
        string berco "Berço ocupado"
        string eta_previsto "ETA previsto original"
        string inicio_atracacao_previsto "Início previsto pelo motor"
        string fim_atracacao_previsto "Desatracação prevista pelo motor"
        float duracao_prevista_horas "Duração estimada de berço"
        string chegada_fundeio_real "Horário real de entrada na barra"
        string inicio_atracacao_real "Horário real de início da atracação"
        string fim_atracacao_real "Horário real de desatracação"
        float duracao_real_horas "Duração efetiva de berço"
        float desvio_eta_horas "Erro absoluto do ETA (horas)"
        float desvio_atracacao_horas "Erro absoluto da atracação (horas)"
        float desvio_desatracacao_horas "Erro absoluto do término (horas)"
        float desvio_duracao_horas "Erro da janela operacional"
        string confianca_estimada "ALTA, MEDIA ou BAIXA"
        float precisao_percentual "Score de acurácia (0 a 100%)"
        string status_fechamento "EM_ANDAMENTO ou CONCLUIDO"
        timestamp registrado_em "Data de abertura do snapshot"
        timestamp finalizado_em "Data de encerramento da escala"
    }

    LINEUP_NAVIOS }o--|| PRANCHAS_PRODUTIVIDADE : "calibra produtividade por mercadoria"
    LINEUP_NAVIOS ||--o| PRATICAGEM_MANOBRAS : "vincula manobra oficial via vinculo_lineup_imo"
    LINEUP_NAVIOS ||--o{ LINEUP_HISTORICO_PREVISOES : "gera snapshots de acurácia"
    NAVIOS ||--o{ LINEUP_NAVIOS : "resolve IMO de escala sem identificador"
```

### 7.2. Descrição das Entidades e Regras de Integridade

1. **`lineup_navios`:** Tabela mestra do line-up do porto. A coluna `imo` possui restrição `UNIQUE`. O status operacional segue a máquina de estados:
   - `LARANJA` (*Previsto em Trânsito*): Navio ainda em aproximação, sem entrada na barra.
   - `VERMELHO` (*Fundeado Aguardando*): Navio com `chegada_fundeio` informada, sem livre prática.
   - `CINZA` (*Pronto para Atracar*): `livre_pratica_ok = 1`, aguardando desocupação de berço.
   - `VERDE` (*Em Operação Real*): Navio atracado fisicamente no berço.
   - `AZUL` (*Previsão de Atracação*): Janela projetada de berço pelo motor determinístico.
2. **`pranchas_produtividade`:** Cadastro regulamentar CDSS. Chave primária em `mercadoria`. Permite diferenciar cargas que paralisam com chuva (`sensivel_chuva = 1`) e estabelece a produtividade mínima diária regulamentar e a média histórica observada.
3. **`tabua_mares`:** Armazena os picos de maré astronômica oficial da Marinha do Brasil (DHN) com chave composta única `(estacao, data_hora)`.
4. **`tide_telemetry`:** Tabela *singleton* (`id = 1`) que preserva a última leitura de nível d'água capturada dos sensores da Praticagem de SP.
5. **`navios`:** Catálogo de 16.200+ embarcações construído a partir de `docs/Navios.csv`. Possui índices `idx_navios_nome` (com `UPPER(nome)`) e `idx_navios_imo` para buscas ultrarrápidas (<1ms) durante a raspagem.
6. **`praticagem_manobras`:** Espelho da pauta oficial do SP Pilots com índices por `categoria`, `nome_navio` e `imo`.
7. **`sisport_sync_config`:** Tabela *singleton* (`id = 1`) que mantém o estado reconfigurável do worker automático em background, registrando `em_execucao` para evitar *race conditions*.
8. **`lineup_historico_previsoes`:** Repositório analítico de histórico de escalas para cálculo de MAE (*Mean Absolute Error*) e confiabilidade estatística do motor de agendamento.

---

## 8. Motor Algorítmico Preditivo & Inteligência Náutica

> ℹ️ **Nota de Engenharia:** Esta aplicação **não utiliza LLMs ou modelos de inteligência artificial generativa baseados em prompts** (como OpenAI GPT, Claude ou Gemini). No lugar disso, ela implementa um **Motor Algorítmico Preditivo e de Simulação Marítima Determinístico** (`src/services/engine.ts`), combinando cálculos de engenharia de tráfego aquaviário, resolução fonética de entidades e geofencing espacial.

### 8.1. Módulos de Inteligência Determinística

```mermaid
flowchart TD
    subgraph INPUTS["Parâmetros de Entrada da Escala"]
        ESC["Dados da Escala (SISPORT / CCO)<br/>Volume, Mercadoria, Calados E/S, LOA, DWT"]
        MET["Previsão Meteorológica Open-Meteo<br/>Precipitação Horária (mm/h)"]
        MARE["Tábua Astronômica DHN & Telemetria SP Pilots<br/>Nível ZH e Extremos de Preamar"]
        PRAT["Pauta de Manobras da Praticagem<br/>Janelas Confirmadas de Desatracação"]
        AIS["Posição Satelital AIS DataDocked<br/>Latitude, Longitude, SOG"]
    end

    subgraph ENGINE["Motor de Simulação Náutica (engine.ts)"]
        M1["1. Resolução Fonética de IMO<br/>Jaro-Winkler em 3 Estágios"]
        M2["2. Identificação Espacial de Berço<br/>Geofencing Point-to-Line"]
        M3["3. Produtividade & Paralisação por Chuva<br/>PMD Adotada vs Horas Chuva"]
        M4["4. Engenharia Náutica de UKC<br/>Folga Mínima 0.50m & Duplo Calado"]
        M5["5. Encadeamento em Cascata (Waterfall)<br/>Sequenciamento Contínuo + 2h Manobra"]
        M6["6. Reconciliação com Praticagem<br/>Ajuste Antecipado (Projeção Real)"]
        M7["7. Métrica de Acurácia & Confiabilidade<br/>Cálculo Dinâmico de MAE e Confiança"]
    end

    subgraph OUTPUTS["Saída Operacional Projetada"]
        GANTT_OUT["Janelas de Berço Gantt (Verde / Azul)"]
        ALERTA_UKC["Alertas Náuticos de Calado Crítico"]
        KPIS["Taxa de Ocupação & Término Real da Fila"]
    end

    ESC --> M1
    AIS --> M2
    MET --> M3
    MARE --> M4
    ESC --> M3
    M2 --> M5
    M3 --> M5
    M4 --> M5
    PRAT --> M6
    M6 --> M5
    M5 --> M7

    M5 --> GANTT_OUT
    M4 --> ALERTA_UKC
    M5 --> KPIS
```

### 8.2. Fórmulas e Regras Matemáticas Implementadas

#### 1. Duração Base de Operação e Prancha Mínima
A produtividade horária é determinada pelo maior valor entre a prancha histórica observada e a mínima regulamentar CDSS:
$$\text{PMD}_{\text{adotada}} = \max\left(\text{PMD}_{\text{histórica}},\, \text{Prancha Mínima CDSS}\right) \quad [\text{t/dia}]$$
$$\text{Ritmo Horário Base } (R_h) = \frac{\text{PMD}_{\text{adotada}}}{24} \quad [\text{t/h}]$$
$$\text{Duração Base } (D_{\text{base}}) = \frac{\text{Volume Total } (V)}{R_h} \quad [\text{horas}]$$

#### 2. Fator de Paralisação por Chuva (Granéis Sensíveis)
Para mercadorias com `sensivel_chuva = 1` (ex.: Barrilha, Trigo, Malte, Cevada, Fertilizantes), o motor consulta a previsão horária do Open-Meteo. Cada hora com precipitação $> 0.2\,\text{mm/h}$ dentro da janela operacional acrescenta exatamente $1.0\,\text{hora}$ de interrupção:
$$D_{\text{operacional}} = D_{\text{base}} + \Delta T_{\text{chuva}} \quad [\text{horas}]$$

#### 3. Progresso em Berço, Ritmo Efetivo e Tempo Restante (Run-Rate)
Para navios em operação ativa (`VERDE`), o motor analisa o percentual de descarga reportado pelo SISPORT ($P_{\%}$):
$$\text{Volume Restante } (V_{\text{restante}}) = V \times \left(1 - \frac{P_{\%}}{100}\right) \quad [\text{toneladas}]$$
$$\text{Tempo Restante } (T_{\text{restante}}) = \frac{V_{\text{restante}}}{R_h} + \Delta T_{\text{chuva residual}} \quad [\text{horas}]$$

#### 4. Engenharia Náutica de Marés e Folga Abaixo da Quilha (UKC)
O calado máximo admissível no Cais Comercial (Berço 101) depende da cota sobre o Zero Hidrográfico ($\text{ZH} = 10.0\,\text{m}$) e da maré instantânea $h_{\text{maré}}(t)$:
$$\text{Profundidade Total } (P_{\text{total}}) = 10{,}0\,\text{m} + h_{\text{maré}}(t)$$
$$\text{UKC}(t) = P_{\text{total}} - \text{Calado}_{\text{operacional}}$$
- Se $\text{UKC} \ge 0{,}50\,\text{m}$: Operação **Segura** (Verde).
- Se $0{,}30\,\text{m} \le \text{UKC} < 0{,}50\,\text{m}$: **Atenção Náutica** (Amarelo).
- Se $\text{UKC} < 0{,}30\,\text{m}$: **Calado Crítico / Restrição** (Vermelho).
O sistema avalia de forma independente o **Calado de Entrada** (na atracação) e o **Calado de Saída** (na desatracação), indicando janelas ideais de preamar quando o calado ultrapassa o limiar de segurança de $8{,}5\,\text{m}$.

#### 5. Encadeamento em Cascata (Waterfall Scheduling)
O berço comercial 101 aceita apenas uma embarcação comercial por vez. Entre a desatracação de um navio e a atracação do próximo na fila, o motor aplica a constante regulamentar de manobra:
$$\Delta T_{\text{manobra}} = 2{,}0\,\text{horas}$$
$$\text{Início Atracação}_{n} = \max\left(\text{ETA}_{n},\, \text{Fim Atracação}_{n-1} + 2{,}0\,\text{h}\right)$$

#### 6. Reconciliação com a Praticagem (Projeção Real vs. Calculada)
Se a Praticagem de SP publicar uma manobra oficial de Saída (`S`) ou Entrada (`E`) confirmada para o navio, e o campo `ajuste_praticagem_ativo = 1`, o motor substitui a projeção matemática calculada pelo horário exato confirmado pelos práticos, propagando o impacto em cascata para todos os navios subsequentes da fila.

---

## 9. Guia de Inicialização & Ambiente Local

### 9.1. Pré-requisitos
- **Node.js:** Versão 20.x ou 22.x LTS instalada.
- **npm:** Versão 10.x ou superior.
- **PostgreSQL:** Instância local ou contêiner Docker rodando na porta 5432.
- **Docker & Docker Compose** (opcional, para execução totalmente conteinerizada).

### 9.2. Instalação e Execução Passo a Passo

```bash
# 1. Clonar o repositório
git clone https://github.com/alissonvs/CDSS-Lineup.git
cd CDSS-Lineup

# 2. Instalar dependências da raiz e do cliente React (acionado via postinstall)
npm install

# 3. Criar e configurar o arquivo de ambiente
cp .env.example .env
# Edite o .env configurando DATABASE_URL ou as variáveis POSTGRES_*

# 4. Iniciar o banco de dados via Docker Compose (caso não possua PostgreSQL local)
docker compose up -d postgres

# 5. Executar a suíte de testes unitários para validar a integridade matemática
npm run test

# 6. Iniciar o ambiente de desenvolvimento integrado (Backend + Frontend em paralelo)
npm run dev
```

O comando `npm run dev` utiliza `concurrently` para subir simultaneamente:
- **Backend:** `tsx watch src/server.ts` escutando em `http://localhost:3000`.
- **Frontend:** Vite dev server rodando em `http://localhost:5173`.

> 💡 **Nota de Inicialização do Banco:** O script `initializeDatabase()` roda automaticamente na primeira inicialização, criando todas as tabelas, aplicando migrações defensivas e populando o catálogo com 16.200+ embarcações a partir de `docs/Navios.csv` caso a tabela `navios` esteja vazia.

### 9.3. Scripts Úteis do `package.json`

| Script | Comando | Finalidade |
|---|---|---|
| `npm run dev` | `concurrently ...` | Executa servidor Express e Vite dev server em paralelo com hot reload. |
| `npm run dev:server` | `tsx watch src/server.ts` | Executa apenas o backend com reinicialização automática em alterações. |
| `npm run dev:client` | `npm --prefix client run dev` | Executa apenas o frontend Vite em modo desenvolvimento. |
| `npm run test` | `vitest run` | Executa todos os 39 testes unitários determinísticos de motor e parsers. |
| `npm run build` | `npm run build:server && npm run build:client` | Compila o backend TypeScript (`dist/`) e o frontend Vite (`client/dist/`). |
| `npm run start` | `node dist/server.js` | Executa o servidor de produção compilado. |
| `npm run sync:sisport` | `tsx src/scripts/syncSisport.ts` | Dispara manualmente o scraper do SISPORT via linha de comando. |
| `npm run import:navios` | `tsx src/scripts/importNavios.ts` | Força a importação do catálogo `docs/Navios.csv` para a tabela `navios`. |

---

## 10. Deploy em Produção (Docker & Dokploy)

A aplicação foi projetada para deploy simplificado em provedores modernos como **Dokploy**, **CapRover**, **Railway** ou instâncias **VPS Docker**.

### 10.1. Build Multi-Stage com Dockerfile

O [Dockerfile](file:///d:/DEV/CDSS-Lineup/Dockerfile) utiliza arquitetura multi-stage em dois estágios:
1. **Estágio `builder` (`node:22-alpine`):** Instala dependências de desenvolvimento, compila o servidor TypeScript para `dist/` e executa o bundle do Vite para `client/dist/`.
2. **Estágio `runner` (`node:22-alpine`):** Imagem final enxuta contendo apenas dependências de produção (`npm ci --omit=dev`), rodando com o usuário não-root `node` para segurança máxima.

### 10.2. Subida com Docker Compose

Para subir toda a infraestrutura em produção local ou VPS com um único comando:

```bash
docker compose up -d --build
```

O contêiner da aplicação aguarda a saúde do banco de dados através da instrução `depends_on` vinculada ao healthcheck `pg_isready`:

```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-cdsslineup} -d ${POSTGRES_DB:-cdsslineup}"]
  interval: 5s
  timeout: 5s
  retries: 5
```

### 10.3. Configuração de Deploy no Dokploy

1. **Repositório:** Conecte o repositório Git no painel do Dokploy.
2. **Build Type:** Selecione `Dockerfile`.
3. **Porta do Serviço:** Configure para a porta interna `3000`.
4. **Variáveis de Ambiente:** Cole o bloco de variáveis no Dokploy:
   ```env
   NODE_ENV=production
   PORT=3000
   HOST=0.0.0.0
   DATABASE_URL=postgresql://usuario:senha@host-do-banco:5432/nome_do_banco
   SISPORT_AUTO_SYNC_ENABLED=true
   SISPORT_SYNC_INTERVAL_MINUTES=15
   SISPORT_SYNC_MODE=SISPORT_ONLY
   VITE_CARTO_API_KEY=sua_chave_carto
   DATADOCKED_API_KEY=sua_chave_datadocked
   ```
5. **Healthcheck Probe:** O contêiner expõe a rota nativa de diagnóstico:
   - Endpoint: `http://127.0.0.1:3000/api/health`
   - Retorno esperado: HTTP 200 com status `healthy`.

---

## 11. Pontos de Atenção & Inconsistências Identificadas

Durante a análise técnica aprofundada da base de código, foram identificados os seguintes itens que merecem atenção por parte da equipe de engenharia:

1. **Variáveis de Ambiente Alternativas vs. `.env.example`:**
   - O arquivo `src/database/connection.ts` aceita `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT` e `DB_NAME`, porém o `.env.example` lista apenas as variantes `POSTGRES_*` e `DATABASE_URL`. Recomenda-se unificar as orientações.
2. **Dependência Externa de Chave CARTO em Build Time:**
   - O `Dockerfile` possui o argumento `ARG VITE_CARTO_API_KEY`. Como o Vite embute variáveis prefixadas com `VITE_` em tempo de compilação estática (`client/dist`), alterar a chave do CARTO exige um novo build do contêiner, não sendo suficiente apenas alterar a variável de ambiente do contêiner em runtime.
3. **Tratamento de Rate-Limiting em Raspagem HTML:**
   - As integrações com o SISPORT e Praticagem realizam requisições periódicas a servidores governamentais e de serviços marítimos. Recomenda-se manter o intervalo mínimo configurado em $\ge 15\,\text{minutos}$ para evitar bloqueios temporários de IP (*WAF/firewall* das entidades).
4. **Reserva de Memória no Parsing do `Navios.csv`:**
   - O arquivo `docs/Navios.csv` contém mais de 16.200 linhas (350+ KB). A carga inicial lê e insere esses registros no banco. Em ambientes com memória muito restrita (<512MB RAM), a carga em lote deve ser monitorada.
5. **Conexões HTTP sem Autenticação de Borda:**
   - A API REST atualmente não exige tokens JWT ou cabeçalhos de autorização em rotas de mutação (`POST /api/navios`, `PUT /api/navios/:id`, `DELETE /api/navios/:id`), operando sob a premissa de rede local fechada / VPN do CCO. Para exposição pública na internet, recomenda-se adicionar um middleware de autenticação ou proteger a aplicação atrás de um Reverse Proxy com autenticação básica ou OAuth2/SSO.
