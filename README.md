# PCS Lineup &bull; Porto de São Sebastião (CDSS v2.0)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22_LTS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Themes-Dark_%26_Light-0ea5e9?style=for-the-badge&logo=w3c&logoColor=white" alt="Dark & Light Themes" />
  <img src="https://img.shields.io/badge/Dokploy-Supported-6366F1?style=for-the-badge&logo=linux&logoColor=white" alt="Dokploy" />
</p>

> **Sistema Web Operacional de Alta Densidade e Análise Preditiva para Centros de Controle Operacional (CCO)**  
> Desenvolvido sob medida para o **Porto de São Sebastião (CDSS)**, com motor determinístico em UTC invariante para berço comercial único, alternância ergonômica entre **Dark e Light Mode**, validação cruzada de telemetria satelital (**AIS DataDocked** vs **SISPORT Oficial**), telemetria maregráfica em tempo real (**SP Pilots** & **DHN**), análise preditiva de **Folga Abaixo da Quilha (UKC - Under Keel Clearance)**, acompanhamento do **% de progresso de operação em berço**, resolução local de IMO via **Catálogo Oficial de Navios (16.200+ embarcações)**, cartografia homologada **CARTO** e delimitação vetorial oficial da **Área do Porto Organizado (Portaria nº 501/2019 - MINFRA/ANTAQ)**.

---

## 📑 Sumário

1. [Visão Geral & Arquitetura](#1-visão-geral--arquitetura)
2. [Fluxo e Integrações do Sistema](#2-fluxo-e-integrações-do-sistema)
3. [Inovações e Ergonomia Visual do Gantt CCO (v2.0)](#3-inovações-e-ergonomia-visual-do-gantt-cco-v20)
4. [Segurança da Navegação & Análise Náutica de Maré (UKC)](#4-segurança-da-navegação--análise-náutica-de-maré-ukc)
5. [Validação Cruzada: SISPORT Oficial vs. AIS Satelital](#5-validação-cruzada-sisport-oficial-vs-ais-satelital)
6. [Regras de Negócio e Algoritmo de Encadeamento](#6-regras-de-negócio-e-algoritmo-de-encadeamento)
7. [Endpoints REST da API](#7-endpoints-rest-da-api)
8. [Configuração do Ambiente (.env)](#8-configuração-do-ambiente-env)
9. [Instruções de Execução Local](#9-instruções-de-execução-local)
10. [Deploy com Docker e Dokploy](#10-deploy-com-docker-e-dokploy)
11. [Licença & Uso](#11-licença--uso)

---

## 1. Visão Geral & Arquitetura

O sistema adota uma arquitetura full-stack moderna, modular e fortemente tipada:

* **Runtime:** Node.js (v20+ / v22+ LTS) em TypeScript (*strict mode*).
* **Backend:** Express estruturado em camadas (rotas, controladores, serviços náuticos e motor determinístico).
* **Banco de Dados:** **PostgreSQL** conectado via driver de alta performance [`postgres`](https://github.com/porsager/postgres) (*Tagged Template Literals*, pooling assíncrono, zero dependências nativas C++ e suporte a `DATABASE_URL`).
* **Frontend:** SPA moderna desenvolvida com **React 19 + Vite + TypeScript + Tailwind CSS (v4) + Lucide Icons**, com suporte nativo a temas **Dark e Light**.
* **Cartografia Náutica:** **Leaflet.js** integrado aos tiles de alta fidelidade do **CARTO** (Positron, Dark Matter, Voyager e Satellite), com renderização de zonas portuárias da ANTAQ via GeoJSON.
* **Telemetria de Maré ao Vivo:** Coleta em background a cada 5 minutos da Praticagem de São Paulo (**SP Pilots**), com fallback matemático harmônico oficial da **DHN/CHM**.
* **Previsão de Chuva:** Integração meteorológica desacoplada (**Open-Meteo**) para acréscimo dinâmico de horas de paralisação em granéis sensíveis (Barrilha, Trigo, Cevada, etc.).
* **Catálogo Naval Local:** Indexação de mais de 16.200 embarcações no banco local, permitindo resolução instantânea de IMO por algoritmo *fuzzy* sem depender de APIs externas.

---

## 2. Fluxo e Integrações do Sistema

```mermaid
flowchart TD
    subgraph Fontes Externas
        SIS[SISPORT Oficial<br/>portoss.sp.gov.br]
        AIS[DataDocked AIS<br/>Telemetria Satelital]
        SPP[SP Pilots<br/>Telemetria de Maré ao Vivo]
        DHN[DHN / CHM<br/>Modelo Harmônico Astronômico]
        METEO[Open-Meteo<br/>Previsão de Chuva]
    end

    subgraph Backend CDSS [Node.js 22 + Express + TypeScript]
        SYNC[Serviço de Sincronização<br/>sisportSync & syncAllService]
        MATCH[Motor de Casamento de Navios<br/>navioMatcherService]
        TIDE[Serviço Maregráfico & UKC<br/>tideService & spPilotsService]
        MOTOR[Motor de Encadeamento CCO<br/>engine.ts]
        API[API REST /api/lineup]
    end

    subgraph Persistência
        PG[(PostgreSQL Database<br/>lineup_navios, navios, pranchas, tabua_mares)]
        CSV[docs/Navios.csv<br/>16.200+ Navios Indexados]
    end

    subgraph Frontend CCO [React 19 + Vite]
        THEME[Alternância Dark & Light Mode<br/>Tailwind CSS v4 + Context]
        GANTT[Gantt CCO v2.0<br/>Progresso % + Linha Mestre + Mini-Curva Maré]
        MAPA[Mapa Náutico Interativo<br/>CARTO + Poligonal ANTAQ]
        MODAIS[Ficha do Navio & Auditoria AIS]
    end

    SIS -->|Raspagem Programação Oficial e % Progresso| SYNC
    CSV -->|Auto-Seed no Boot| PG
    PG -->|Consulta Inteligente de IMO| MATCH
    MATCH -->|IMO Resolvido em <1ms| SYNC
    AIS -->|Posição e ETA Transponder| SYNC
    SPP -->|Nível de Água Tempo Real| TIDE
    DHN -->|Série Harmônica de Extremos| TIDE
    METEO -->|Previsão Precipitação| MOTOR

    SYNC --> PG
    TIDE --> PG
    PG --> MOTOR
    MOTOR --> API
    API --> GANTT
    API --> MAPA
    API --> MODAIS
```

---

## 3. Inovações e Ergonomia Visual do Gantt CCO (v2.0)

### 3.1. Cabeçalho Empilhado Fixo (*Sticky Header Stack*)
Para garantir que operadores do CCO nunca percam referências temporais ao analisar filas extensas, o Gantt implementa um cabeçalho fixo empilhado em 4 camadas via CSS `sticky`:

1. **Linha de Marcador Temporal CCO (`sticky top-0 z-30`, 24px):**
   * Contém a legenda operacional de referência em tempo real.
   * **Cápsula "AGORA" Elevada:** Posicionada exclusivamente na faixa superior (`AGORA ▼`), eliminando sobreposição com números de dias ou marés.
   * **Agulha Vertical Contínua:** Linha vermelha guia de alta precisão que atravessa toda a grade sem bloquear cliques (`pointer-events-none`).
2. **Régua de Dias do Mês (`sticky top-[24px] z-30`, 44px):**
   * Grade diária com destaque visual de fins de semana (Sáb/Dom) em azul marinho com contraste escuro.
3. **Mini-Curva Contínua de Marés DHN (`sticky top-[68px] z-30`, 50px):**
   * Sparkline vetorial SVG contínuo com preenchimento em gradiente e linha tracejada de cota segura (`Ref 1.00m`).
4. **Linha 0 - Berço Comercial CDSS (`sticky top-[118px] z-30`, 48px):**
   * Fita contínua mestre de ocupação do cais comercial único (Verde real + Azuis em série sem sobreposição temporal), permanentemente ancorada no topo.

> [!TIP]
> **Performance a 60 FPS:** Cada linha do Gantt integra o card lateral esquerdo (`w-[26.5rem]`) e a raia de barras em um único contêiner flexível sob um único scrollbar vertical (`overflow-y-auto`). Isso descarta listeners manuais de scroll em JavaScript e garante sincronização perfeita via GPU.

### 3.2. Mini-Curva Contínua de Marés (SVG Sparkline Sinusoidal)
* **Interpolação Harmônica Contínua:** Síntese suave calculada a partir dos pontos discretos da DHN, com pontos intermediários por meio-período cosseno.
* **Ocultação Inteligente por Escala:**
  * **Escala 7D (Tática):** Exibe as cotas em fonte monoespaçada com setas indicativas: `▲1.25m` (ciano `#38bdf8`) e `▼0.33m` (âmbar `#f59e0b`).
  * **Escalas 14D e 28D (Estratégicas):** Oculta os rótulos textuais de cota para evitar adensamento visual, preservando a curva gráfica e os círculos de ápice.
* **Halo Protetor de Contraste:** Rótulos e círculos utilizam contorno escuro nativo (`paint-order: stroke fill; stroke: #070d18; stroke-width: 3.5px`), garantindo legibilidade mesmo quando a agulha vermelha do `AGORA` cruza o número.

### 3.3. Reposicionamento Ergonômico do Popover da Embarcação
* **Ancoragem Lateral Externa:** Abre à direita do card (`left: 100%`, `ml-3`), projetando-se sobre a área de histórico consumido.
* **Zero Oclusão da Fila:** A lista completa de navios adjacentes permanece 100% visível para comparação imediata.
* **Inversão Vertical Inteligente:** Navios posicionados no terço inferior da tela têm o popover ancorado para crescer de baixo para cima (`bottom-0`), impedindo corte na tela.

### 3.4. Indicadores de Ocupação e Backlog
* **Ocupação do Berço (Janela 30D):** Cálculo rigoroso sobre a janela contratual de 720 horas mensais:
  $$\text{Taxa Ocupação} = \frac{\min(\text{Horas no Mês}, 720)}{720} \times 100\%$$
* **Backlog em Carteira:** Demonstra a demanda reprimida em fila contínua (ex.: *Fila Total: 2.166,7h • Demanda: 300,9% ~90 dias de cais*).

### 3.5. Alternância Dinâmica de Tema (Dark & Light Mode)
Projetado sob medida para a diversidade de luminosidade dos Centros de Controle Operacional (CCO):
* **Dark Mode (Padrão CCO):** Paleta noturna profunda de alta densidade (`#070d18`, `#0c1527`, bordas ciano/ardósia), minimizando fadiga ocular e eliminando reflexos em videowalls de monitoramento contínuo.
* **Light Mode (Ergonomia Diurna):** Interface nítida e limpa orientada pela especificação de design (`#f8fafc`, painéis brancos puros, textos com contraste reforçado em cinza ardósia e azul corporativo).
* **Seletor Rápido & Persistência:** Alternador instantâneo no cabeçalho com sincronização automática em `localStorage` e detecção inteligente de preferências do sistema (`prefers-color-scheme`).

### 3.6. Acompanhamento de Progresso da Operação (% SISPORT)
Integração direta com os dados de produtividade e execução física da programação oficial:
* **Indicador de Status:** O navio que está operando no berço comercial exibe um badge em destaque com percentual atualizado (`⚡ 21,1%`).
* **Card da Embarcação:** Logo abaixo do produto e peso da carga (`BARRILHA / 27.000 t`), exibe o rótulo numérico e uma barra de progresso visual proporcional estilizada em verde esmeralda.
* **Visibilidade Multissistema:** O progresso é refletido em sincronia na barra da Linha do Tempo (`OPERANDO • 21,1% • Xh`), no popover da escala, na tela de Gestão de Fila e nos popups do Mapa Náutico.

---

## 4. Segurança da Navegação & Análise Náutica de Maré (UKC)

Para assegurar manobras de atracação e desatracação sem risco de encalhe no canal:

* **Batimetria Homologada:** Profundidade de projeto do berço comercial CDSS fixada em **$10{,}00\text{ m}$ sobre o Zero Hidrográfico (ZH)**.
* **Calado Crítico:** Embarcações com calado superior a **$9{,}50\text{ m}$** recebem automaticamente o status `temRestricao = true`.
* **Cálculo Dinâmico da Folga Abaixo da Quilha (Under Keel Clearance - UKC):**
  $$\text{Profundidade Disponível} = \text{Profundidade Berço (ZH)} + \text{Altura da Maré}$$
  $$\text{UKC} = \text{Profundidade Disponível} - \text{Calado Operacional}$$
* **Margem Regulamentar da Marinha:** UKC mínimo obrigatório de **$0{,}50\text{ m}$**.
* **Sinalização Visual:** Barras operacionais de navios restritos recebem padrão listrado de advertência e recomendação no tooltip da próxima **Preamar Segura**.

---

## 5. Validação Cruzada: SISPORT Oficial vs. AIS Satelital

O sistema mantém preservadas duas fontes temporais independentes:

1. **`eta_previsto` (SISPORT Oficial):** Data oficial programada pela Autoridade Portuária no portal `portoss.sp.gov.br`. Nunca é sobrescrita pela telemetria.
2. **`eta_ais` (Telemetria Satelital):** Previsão calculada pelos sensores de bordo e transmitida pelo transponder AIS.
3. **Auditoria em Tempo Real:**
   * Diferenças $\le 2\text{h}$: Consideradas em conformidade operacional.
   * Diferenças $> 2\text{h}$: Exibição de alertas automáticos:
     * `⚠️ Atraso AIS: +X.Xh`
     * `⚡ Adiantado AIS: -X.Xh`

---

## 6. Regras de Negócio e Algoritmo de Encadeamento

### 6.1. Semântica de Cores CDSS
* 🟢 **Verde (Operando Real):** Navio fisicamente no berço comercial único. Bipartido: o tempo transcorrido no passado ancora na atracação real e estende-se até o instante `AGORA`.
* 🔵 **Azul (Previsão de Operação):** Tempo restante de cais projetado a partir do `AGORA` (para o navio verde) ou janela futura encadeada (para os navios da fila).
* 🔴 **Vermelho (No Fundeio Real):** Navio ancorado fisicamente na barra aguardando liberação.
* 🟠 **Laranja (Fundeio Previsto / Espera):** Tempo de espera projetado desde a prontidão/ETA até o momento da atracação.
* ⚪ **Cinza (Liberado Autoridades):** Navio com Livre Prática deferida (`livre_pratica_ok = 1`).

### 6.2. Duração da Janela de Berço
$$\text{Tempo Total (h)} = \text{Duração Base (h)} + \Delta t_{\text{chuva}} + \Delta t_{\text{manobra}}$$

* **Duração Base:** $\text{Volume (t)} \div \left( \frac{\max(\text{PMD Histórica}, \text{Prancha Mínima CDSS})}{24} \right)$
* $\Delta t_{\text{manobra}} = 2{,}0\text{ horas}$ (folga regulamentar de desatracação e amarração entre escalas).
* $\Delta t_{\text{chuva}}$: para cargas sensíveis (`sensivel_chuva = 1`), soma $1{,}0\text{h}$ para cada hora com precipitação prevista $> 0{,}2\text{ mm/h}$.

### 6.3. Catálogo Oficial de Navios & Resolução Determinística de IMO
Elimina completamente a latência, quotas e falhas de serviços externos de dados navais:
* **Base de Dados Dedicada:** Tabela `navios` no PostgreSQL contendo mais de **16.200 embarcações** indexadas por nome e código IMO oficial.
* **Algoritmo de Correspondência em 3 Níveis:**
  1. **Nível 1 (Exato):** Correspondência direta por string sanitizada e normalizada.
  2. **Nível 2 (Canônico):** Remoção de ruídos operacionais, prefixos e sufixos de numerais romanos (ex.: `II`, `III`, `MV`, `MT`, pontuações).
  3. **Nível 3 (Fuzzy Jaro-Winkler):** Busca por aproximação fonética/ortográfica com índice de similaridade $\ge 0{,}85$.
* **Performance:** Resolução executada localmente no banco em menos de **$1\text{ ms}$**, garantindo 100% de taxa de identificação de IMOs no Line-Up ativo.
* **Carga de Dados:** Script dedicado para importação e reprocessamento a partir de `docs/Navios.csv` (`npm run import:navios`).

---

## 7. Endpoints REST da API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/health` | **Healthcheck probe:** Retorna status de saúde do container e conectividade ativa com o PostgreSQL |
| `GET` | `/api/livez` | **Liveness probe:** Endpoint ultraleve para orquestradores (Docker, Dokploy, Kubernetes) |
| `GET` | `/api/lineup` | Retorna o line-up com blocos discretos (`TimelineBlock[]`), restrições de maré, % de progresso da operação (`progresso_operacao`) e KPIs |
| `POST` | `/api/navios` | Cadastro manual de escala com resolução de IMO via Catálogo Oficial |
| `PUT` | `/api/navios/:id` | Atualização cadastral, alteração de status operacional ou livre prática |
| `DELETE` | `/api/navios/:id` | Exclusão de escala com reindexação atômica da fila sequencial |
| `POST` | `/api/navios/reordenar` | Reordenação em lote da fila de prioridade (`{ ids: number[] }`) |
| `POST` | `/api/navios/sync/:imo` | Sincroniza telemetria satelital AIS (DataDocked) e atualiza `eta_ais` |
| `POST` | `/api/sisport/sync` | Sincronização em tempo real com a programação oficial da CDSS (`portoss.sp.gov.br`) |
| `POST` | `/api/sisport/sync-all` | **Sincronização 2 em 1:** SISPORT &rarr; Catálogo Navios &rarr; DataDocked AIS em lote com controle de concorrência |
| `GET` | `/api/navios/search` | Consulta inteligente de navios no Catálogo Oficial por nome ou IMO com score e método fuzzy |
| `GET` | `/api/operacional/resumo` | Retorna KPIs da central (Taxa de Ocupação, Horas Ocupadas, Volume Total) |
| `GET` | `/api/clima` | Resumo meteorológico horário do canal de São Sebastião |
| `GET` | `/api/mares` | Extremos astronômicos diários da tábua de marés da DHN/CHM para São Sebastião |
| `GET` | `/api/weather/tide/current` | Telemetria maregráfica em tempo real da Praticagem de SP com fallback harmônico DHN |
| `GET` | `/api/weather/rain/forecast` | Previsão horária de precipitação atmosférica desacoplada dos dados de maré |

---

## 8. Configuração do Ambiente (`.env`)

Crie ou configure o arquivo `.env` na raiz do projeto com base no modelo [.env.example](file:///c:/DEV/CDSS-Line-Up-v2/.env.example):

```env
PORT=3000
CLIENT_PORT=5173
NODE_ENV=development

# Conexão PostgreSQL (Produção / Dokploy / Remoto)
DATABASE_URL=postgresql://usuario:senha@host:porta/banco

# Chave da API DataDocked para telemetria AIS satelital (opcional)
DATADOCKED_API_KEY=sua_chave_datadocked_aqui

# Chave de API do CARTO para tiles de mapas náuticos (https://carto.com/basemaps/apikey)
VITE_CARTO_API_KEY=sua_chave_carto_aqui
```

---

## 9. Instruções de Execução Local

### Pré-requisitos
* **Node.js** v20+ ou v22 LTS instalado.
* Instância do **PostgreSQL** ativa (ou string `DATABASE_URL` configurada).

### 1. Instalação das Dependências
```bash
# Instala as dependências da raiz e automaticamente do cliente (via postinstall)
npm install
```

### 2. Execução em Desenvolvimento
```bash
# Inicia simultaneamente o servidor backend Express e o cliente Vite com HMR
npm run dev
```
* **Frontend Web:** [`http://localhost:5173`](http://localhost:5173)
* **Backend API:** [`http://localhost:3000/api/lineup`](http://localhost:3000/api/lineup)

### 3. Carga do Catálogo de Navios (Opcional)
```bash
# Popula a tabela 'navios' com mais de 16.200 registros a partir de docs/Navios.csv
# (Nota: o servidor executa essa carga automaticamente no boot caso a tabela esteja vazia)
npm run import:navios
```

### 4. Sincronização SISPORT via CLI
```bash
npm run sync:sisport
```

### 5. Build de Produção Local
```bash
# Compila backend (TypeScript) e frontend (Vite)
npm run build

# Inicia o servidor Express em modo de produção servindo os assets estáticos
npm start
```

---

## 10. Deploy com Docker e Dokploy

O projeto está totalmente configurado para deploy em produção via **Docker** e **Dokploy** através de uma imagem multi-stage ultra-otimizada:

### 10.1. Execução via Docker Compose
```bash
# Constrói a imagem e inicia o container em segundo plano
docker compose up -d --build

# Acompanhar logs em tempo real
docker compose logs -f

# Encerrar container
docker compose down
```

### 10.2. Configuração no Painel do Dokploy

1. **Criar Aplicação:** No Dokploy, crie uma nova aplicação a partir do repositório Git `https://github.com/alissonvs/CDSS-Line-Up-v2.git`.
2. **Configuração de Branch:** Na aba **General** (card Git), defina a branch como **`main`** e clique em **Save**.
3. **Build Type:** Na aba **General** (card Build Type), selecione **`Dockerfile`**:
   * **Docker File:** `Dockerfile` (ou deixe em branco para o padrão).
   * **Docker Context Path:** `.`
   * **Docker Build Stage:** deixe em branco (utiliza o estágio final `runner`).
   * Clique em **Save**.
4. **Porta da Aplicação:** Configure a porta interna como **`3000`**.
5. **Healthcheck Probe:** Configure o caminho de verificação como **`/api/health`**.
6. **Variáveis de Ambiente (Aba Environment):**
   ```env
   NODE_ENV=production
   PORT=3000
   DATABASE_URL=postgresql://usuario:senha@host:porta/banco
   DATADOCKED_API_KEY=sua_chave_datadocked_aqui
   VITE_CARTO_API_KEY=sua_chave_carto_aqui
   ```
7. **Disparar Deploy:** Clique em **Deploy**. Acompanhe o build na aba **Deployments** e os logs operacionais na aba **Logs**.

### 10.3. Provisionamento e Auto-Migração no Boot
* **Inclusão do Catálogo no Container:** O `Dockerfile` multi-stage copia o arquivo `docs/Navios.csv` tanto no build quanto na imagem final (`runner`).
* **Auto-Seed e DDL:** Durante o boot do container, o script `initializeDatabase()` roda antes de abrir o tráfego HTTP:
  1. Cria as tabelas `navios`, `lineup_navios`, `pranchas_produtividade` e `tabua_mares` (se não existirem).
  2. Popula automaticamente os **16.237 navios** caso a tabela `navios` esteja vazia.
  3. Aplica migrações defensivas no esquema existente (ex.: `ALTER TABLE lineup_navios ADD COLUMN IF NOT EXISTS progresso_operacao DOUBLE PRECISION`).
* **Zero intervenção manual:** O deploy no Dokploy é 100% autônomo e auto-configurável.

---

## 11. Licença & Uso

Propriedade do projeto **PCS Lineup &bull; CDSS v2.0**.  
Desenvolvido para apoio à tomada de decisão operacional, supervisão portuária e segurança da navegação no **Porto de São Sebastião (CDSS)**.
