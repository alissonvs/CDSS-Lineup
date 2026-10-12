# PCS Lineup &bull; Porto de São Sebastião (v2.0.0)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22_LTS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Praticagem-SP_Pilots-8b5cf6?style=for-the-badge&logo=anchor&logoColor=white" alt="Praticagem SP Pilots" />
  <img src="https://img.shields.io/badge/Themes-Dark_%26_Light-0ea5e9?style=for-the-badge&logo=w3c&logoColor=white" alt="Dark & Light Themes" />
  <img src="https://img.shields.io/badge/Dokploy-Supported-6366F1?style=for-the-badge&logo=linux&logoColor=white" alt="Dokploy" />
</p>

> **Sistema Web Operacional de Alta Densidade e Análise Preditiva para Centros de Controle Operacional (CCO)**  
> Desenvolvido sob medida para a **Companhia Docas de São Sebastião (CDSS)**, com motor determinístico em UTC invariante para berço comercial único, alternância ergonômica entre **Dark e Light Mode**, validação cruzada de telemetria satelital (**AIS DataDocked** vs **SISPORT Oficial**), integração em tempo real com a **Pauta de Serviços da Praticagem de São Paulo (SP Pilots)** com **Ajuste Operacional Automático (Projeção Real)**, telemetria maregráfica em tempo real (**SP Pilots** & **DHN**), análise preditiva de **Folga Abaixo da Quilha (UKC - Under Keel Clearance)** com **Duplo Calado Náutico (Entrada vs. Saída)**, acompanhamento em tempo real do **% de progresso de operação em berço (Run-Rate)**, resolução local de IMO via **Catálogo Naval (16.200+ embarcações)**, cartografia homologada **CARTO** e delimitação vetorial oficial da **Área do Porto Organizado (Portaria nº 501/2019 - MINFRA/ANTAQ)**.

---

## 📑 Sumário

1. [Visão Geral & Arquitetura](#1-visão-geral--arquitetura)
2. [Fluxo de Dados e Integrações](#2-fluxo-de-dados-e-integrações)
3. [Modelagem Matemática e Fórmulas Operacionais](#3-modelagem-matemática-e-fórmulas-operacionais)
   - 3.1. [Duração Base de Operação e Pranchas Mínimas CDSS](#31-duração-base-de-operação-e-pranchas-mínimas-cdss)
   - 3.2. [Fator de Paralisação por Chuva (Granéis Sensíveis)](#32-fator-de-paralisação-por-chuva-granéis-sensíveis)
   - 3.3. [Duração Total da Janela de Berço e Intervalo de Manobra](#33-duração-total-da-janela-de-berço-e-intervalo-de-manobra)
   - 3.4. [Progresso em Berço, Ritmo Efetivo e Tempo Restante (Run-Rate)](#34-progresso-em-berço-ritmo-efetivo-e-tempo-restante-run-rate)
   - 3.5. [Engenharia Náutica de Marés e Folga Abaixo da Quilha (UKC)](#35-engenharia-náutica-de-marés-e-folga-abaixo-da-quilha-ukc)
   - 3.6. [Duplo Calado Náutico Operacional (Entrada vs. Saída)](#36-duplo-calado-náutico-operacional-entrada-vs-saída)
   - 3.7. [Interpolação Harmônica Sinusoidal de Maré (Curva Contínua)](#37-interpolação-harmônica-sinusoidal-de-maré-curva-contínua)
   - 3.8. [Auditoria de Divergência Temporal de ETA (SISPORT vs. AIS)](#38-auditoria-de-divergência-temporal-de-eta-sisport-vs-ais)
   - 3.9. [Algoritmo de Encadeamento em Cascata (Waterfall Scheduling)](#39-algoritmo-de-encadeamento-em-cascata-waterfall-scheduling)
   - 3.10. [Taxa de Ocupação do Berço e Backlog de Carteira](#310-taxa-de-ocupação-do-berço-e-backlog-de-carteira)
   - 3.11. [Algoritmo de Resolução de IMO (Jaro-Winkler)](#311-algoritmo-de-resolução-de-imo-jaro-winkler)
4. [Inovações e Ergonomia Visual do Gantt CCO (v2.0)](#4-inovações-e-ergonomia-visual-do-gantt-cco-v20)
5. [Integração com a Praticagem (SP Pilots) & Projeção Real](#5-integração-com-a-praticagem-sp-pilots--projeção-real)
6. [Canal de São Sebastião & Cartografia ANTAQ](#6-canal-de-são-sebastião--cartografia-antaq)
7. [Endpoints REST da API](#7-endpoints-rest-da-api)
8. [Configuração do Ambiente (.env)](#8-configuração-do-ambiente-env)
9. [Instruções de Execução Local](#9-instruções-de-execução-local)
10. [Deploy com Docker e Dokploy](#10-deploy-com-docker-e-dokploy)
11. [Licença & Uso](#11-licença--uso)

---

## 1. Visão Geral & Arquitetura

O sistema adota uma arquitetura full-stack moderna, modular e fortemente tipada:

* **Runtime:** Node.js (v20+ / v22+ LTS) em TypeScript (*strict mode*).
* **Backend:** Express estruturado em camadas de alta coesão:
  * `controllers/`: Gerenciamento e sanitização de requisições HTTP.
  * `services/engine.ts`: Motor determinístico de cálculo de fila contínua e encadeamento em cascata.
  * `services/tideService.ts`: Módulo maregráfico, cálculo dinâmico de UKC e análise independente de calado (Entrada vs. Saída).
  * `services/sisportSync.ts`: Scraper resiliente da programação oficial de navios e progresso de descarga (`portoss.sp.gov.br`).
  * `services/sisportSchedulerService.ts`: Worker de agendamento em segundo plano com Mutex lock e intervalo parametrizável via `.env`, banco ou API.
  * `services/spPilotsService.ts`: Scraper autenticado da Pauta de Manobras e tráfego de navios da Praticagem (`ssb.sppilots.com.br`).
  * `services/weather.ts`: Telemetria de maré em tempo real e previsão horária de chuva via Open-Meteo.
  * `services/navioMatcherService.ts`: Algoritmo fonético/ortográfico de resolução de IMO em 3 níveis.
* **Banco de Dados:** **PostgreSQL** conectado via driver de alta performance [`postgres`](https://github.com/porsager/postgres) (*Tagged Template Literals*, pooling assíncrono, zero dependências nativas C++ e suporte a `DATABASE_URL`).
* **Frontend:** SPA moderna desenvolvida com **React 19 + Vite + TypeScript + Tailwind CSS (v4) + Lucide Icons**, com suporte nativo a temas **Dark e Light**.
* **Cartografia Náutica:** **Leaflet.js** integrado aos tiles de alta fidelidade do **CARTO** (Positron, Dark Matter, Voyager e Satellite), com renderização de zonas portuárias da ANTAQ via GeoJSON e localização geográfica exata do Berço 101.

---

## 2. Fluxo de Dados e Integrações

```mermaid
flowchart TD
    subgraph Fontes Externas
        SIS[SISPORT Oficial<br/>portoss.sp.gov.br]
        AIS[DataDocked AIS<br/>Telemetria Satelital]
        PRAT[Praticagem SP Pilots<br/>Pauta de Serviço & Manobras]
        SPP[SP Pilots<br/>Telemetria de Maré ao Vivo]
        DHN[DHN / CHM<br/>Tábua Astronômica Oficial]
        METEO[Open-Meteo<br/>Previsão de Chuva Horária]
    end

    subgraph Backend CDSS [Node.js 22 + Express + TypeScript]
        SYNC[Serviço de Sincronização<br/>sisportSync & syncAllService]
        PRAT_SVC[Serviço da Praticagem<br/>spPilotsService.ts]
        MATCH[Resolução Naval de IMO<br/>navioMatcherService.ts]
        TIDE[Engenharia Náutica & UKC<br/>tideService.ts]
        MOTOR[Motor de Encadeamento CCO<br/>engine.ts]
        API[API REST /api/*]
    end

    subgraph Persistência [PostgreSQL]
        PG[(lineup_navios<br/>praticagem_manobras<br/>navios catálogo 16k+<br/>pranchas_produtividade<br/>tabua_mares)]
    end

    subgraph Frontend CCO [React 19 + Vite]
        GANTT[Gantt CCO v2.0<br/>Linha Mestre + Mini-Curva DHN]
        PRAT_VIEW[Aba Praticagem<br/>Pauta de Manobras & Tráfego]
        MAPA[Canal & Mapa<br/>Berço 101 + Poligonal ANTAQ]
        MODAIS[Ficha da Escala & Duplo Calado]
    end

    SIS -->|Raspagem Programação Oficial e % Progresso| SYNC
    PG -->|Consulta Inteligente de IMO| MATCH
    MATCH -->|IMO Resolvido em <1ms| SYNC
    AIS -->|Posição e ETA Transponder| SYNC
    PRAT -->|Pauta Autenticada de Manobras| PRAT_SVC
    PRAT_SVC -->|Persiste Manobras & Resumo Porto| PG
    PRAT_SVC -->|Aciona Recálculo| MOTOR
    SPP -->|Nível de Água Tempo Real| TIDE
    DHN -->|Série Harmônica de Extremos| TIDE
    METEO -->|Previsão Precipitação| MOTOR

    SYNC --> PG
    TIDE --> PG
    PG --> MOTOR
    MOTOR --> API
    API --> GANTT
    API --> PRAT_VIEW
    API --> MAPA
    API --> MODAIS
```

---

## 3. Modelagem Matemática e Fórmulas Operacionais

Esta seção detalha todas as equações, algoritmos e limites de tolerância implementados no motor determinístico do sistema.

### 3.1. Duração Base de Operação e Pranchas Mínimas CDSS

A produtividade de movimentação de carga no Cais Comercial Único do Porto de São Sebastião é balizada pela **Prancha Mínima Homologada** por mercadoria versus a produtividade histórica observada:

$$\text{PMD}_{\text{adotada}} = \max\left(\text{PMD}_{\text{histórica}},\, \text{Prancha Mínima CDSS}\right) \quad [\text{t/dia ou cabeças/dia}]$$

#### Tabela Oficial de Pranchas Mínimas CDSS:

| Mercadoria | Unidade | Prancha Mínima ($\text{dia}$) | Ritmo Equivalente ($\text{hora}$) | Sensível à Chuva? |
|---|---|---|---|:---:|
| **Barrilha** (*Soda Ash*) | Toneladas | $1.800\,\text{t/dia}$ | $75{,}00\,\text{t/h}$ | Sim |
| **Trigo a Granel** | Toneladas | $3.400\,\text{t/dia}$ | $141{,}67\,\text{t/h}$ | Sim |
| **Malte / Cevada a Granel** | Toneladas | $2.800\,\text{t/dia}$ | $116{,}67\,\text{t/h}$ | Sim |
| **Carga Geral / Alumina** | Toneladas | $1.200\,\text{t/dia}$ | $50{,}00\,\text{t/h}$ | Sim |
| **Carga Viva (Bois)** | Cabeças | $2.500\,\text{animais/dia}$ | $104{,}17\,\text{un/h}$ | Não |

A **Duração Base de Operação** ($D_{\text{base}}$, em horas) é calculada por:

$$D_{\text{base}} = \frac{V_{\text{total}}}{\frac{\text{PMD}_{\text{adotada}}}{24}} = \frac{24 \times V_{\text{total}}}{\text{PMD}_{\text{adotada}}}$$

Onde:
* $V_{\text{total}}$: Volume total manifestado da carga (toneladas métricas ou número de cabeças).

---

### 3.2. Fator de Paralisação por Chuva (Granéis Sensíveis)

Operações de granéis sólidos vegetais e químicos no Porto de São Sebastião são interrompidas sob precipitação pluviométrica para fechamento dos porões e proteção fitossanitária da carga.

* **Critério de Sensibilidade:** Uma carga é sensível se a mercadoria contiver em sua descrição os termos: `barrilha`, `barilha`, `trigo`, `cevada`, `malte`, `alumina`, `fertilizante`, `adubo` ou `açúcar`.
* **Gatilho de Chuva:** O modelo meteorológico (Open-Meteo) avalia a precipitação horária prevista $P(t)$ no Canal de São Sebastião (Lat: `-23.82`, Lon: `-45.40`).
* **Horas de Paralisação ($\Delta t_{\text{chuva}}$):**

$$\Delta t_{\text{chuva}} = \sum_{t = t_{\text{inicio}}}^{t_{\text{fim}}} \mathbb{I}\left(P(t) > 0{,}20\,\text{mm/h}\right) \times 1{,}0\,\text{hora}$$

Onde $\mathbb{I}(\cdot)$ é a função indicadora binária ($1$ se chover mais de $0{,}2\,\text{mm/h}$, $0$ caso contrário).

---

### 3.3. Duração Total da Janela de Berço e Intervalo de Manobra

O tempo total de ocupação do berço comercial ($D_{\text{total}}$) adiciona a margem náutica regulamentar de manobra portuária:

$$D_{\text{total}} = D_{\text{base}} + \Delta t_{\text{chuva}} + \Delta t_{\text{manobra}}$$

* $\Delta t_{\text{manobra}} = 2{,}0\,\text{horas}$: Intervalo padrão entre a largada dos cabos (desatracação) do navio anterior e a passagem do primeiro cabo (atracação e amarração nos cabeços) do próximo navio da fila.

---

### 3.4. Progresso em Berço, Ritmo Efetivo e Tempo Restante (Run-Rate)

Para a embarcação que está fisicamente atracada operando no berço comercial (`status_cor = VERDE`), o sistema não utiliza uma estimativa estática, mas sim um motor adaptativo de **Run-Rate Efetivo**:

1. **Volume Já Movimentado ($V_{\text{realizado}}$):**
   $$V_{\text{realizado}} = V_{\text{total}} \times \left(\frac{P_{\text{operacao}}}{100}\right) \quad [\text{t}]$$
   Onde $P_{\text{operacao}} \in [0, 100]$ é o percentual de carga movimentada lido do SISPORT ou ajustado no turno.

2. **Volume Restante a Movimentar ($V_{\text{restante}}$):**
   $$V_{\text{restante}} = V_{\text{total}} - V_{\text{realizado}} = V_{\text{total}} \times \left(1 - \frac{P_{\text{operacao}}}{100}\right) \quad [\text{t}]$$

3. **Tempo Efetivo Decorrido de Cais ($t_{\text{decorrido}}$):**
   $$t_{\text{decorrido}} = \max\left(0{,}50\,\text{h},\, \frac{\text{Momento Atual (Agora)} - t_{\text{inicio\_operacao}}}{3600 \times 1000}\right) \quad [\text{h}]$$

4. **Taxa Efetiva de Produção ($\text{Taxa}_{\text{efetiva}}$):**
   $$\text{Taxa}_{\text{efetiva}} = \frac{V_{\text{realizado}}}{t_{\text{decorrido}}} \quad [\text{t/h}]$$
   $$\text{Ritmo Diário Equivalente} = \text{Taxa}_{\text{efetiva}} \times 24 \quad [\text{t/dia}]$$

5. **Tempo Restante Estimado de Desatracação ($t_{\text{restante}}$):**
   $$t_{\text{restante}} = \begin{cases} 
   \frac{V_{\text{restante}}}{\text{Taxa}_{\text{efetiva}}} + \Delta t_{\text{manobra}}, & \text{se } P_{\text{operacao}} \ge 5\% \text{ e } \text{Taxa}_{\text{efetiva}} > 0 \\
   D_{\text{base}} \times \left(1 - \frac{P_{\text{operacao}}}{100}\right) + \Delta t_{\text{manobra}}, & \text{caso contrário (fallback de prancha nominal)}
   \end{cases}$$

6. **Término Previsto da Operação:**
   $$t_{\text{fim\_atracacao}} = \text{Agora} + t_{\text{restante}}$$

---

### 3.5. Engenharia Náutica de Marés e Folga Abaixo da Quilha (UKC)

A navegação no Canal de São Sebastião e a manobra no Berço 101 são condicionadas pelas profundidades mínimas de segurança estabelecidas pela Autoridade Marítima (Marinha do Brasil / Capitania dos Portos):

* **Profundidade de Projeto do Berço 101 ($h_{\text{berço}}$):** Fixada em $10{,}00\,\text{m}$ em relação ao Zero Hidrográfico (ZH).
* **Margem Regulamentar Mínima ($\text{UKC}_{\text{mínimo}}$):** Exigência de **$0{,}50\,\text{m}$** (50 cm de folga líquida de água sob a quilha).
* **Calado Crítico Limiar:** Navios com calado $\ge 9{,}50\,\text{m}$ dependem obrigatoriamente de maré positiva para atracação segura ($10{,}00\,\text{m} - 0{,}50\,\text{m} = 9{,}50\,\text{m}$).

#### Fórmulas de Lâmina d'Água e UKC:

$$\text{Profundidade Disponível}(t) = h_{\text{berço}} + M(t) = 10{,}00 + M(t) \quad [\text{m}]$$

$$\text{UKC}(t) = \text{Profundidade Disponível}(t) - C_{\text{manobra}} = 10{,}00 + M(t) - C_{\text{manobra}} \quad [\text{m}]$$

Onde $M(t)$ é a altura da maré instantânea em relação ao ZH e $C_{\text{manobra}}$ é o calado específico daquela manobra.

#### Maré Mínima Requerida ($M_{\text{requerida}}$):

$$M_{\text{requerida}} = C_{\text{manobra}} + \text{UKC}_{\text{mínimo}} - h_{\text{berço}} = C_{\text{manobra}} + 0{,}50 - 10{,}00 = C_{\text{manobra}} - 9{,}50 \quad [\text{m}]$$

#### Classificação de Risco Náutico da Manobra:

$$\text{Nível de Risco} = \begin{cases}
\textbf{CRÍTICO} & \iff \text{UKC} < 0{,}00\,\text{m} \quad (\text{Risco iminente de tocar o fundo / encalhe}) \\
\textbf{ATENÇÃO} & \iff 0{,}00\,\text{m} \le \text{UKC} < 0{,}50\,\text{m} \quad (\text{UKC abaixo da margem regulamentar da Marinha}) \\
\textbf{SEGURO} & \iff \text{UKC} \ge 0{,}50\,\text{m} \quad (\text{Conformidade náutica plena})
\end{cases}$$

---

### 3.6. Duplo Calado Náutico Operacional (Entrada vs. Saída)

> [!IMPORTANT]
> **Eliminação de Falsos Alarmes de Encalhe na Desatracação:**  
> Navios graneleiros chegam a São Sebastião carregados no calado máximo ($8{,}50 - 11{,}50\,\text{m}$), mas desatracam em **lastro** ($5{,}80 - 6{,}80\,\text{m}$) após a descarga. Modelos anteriores que utilizavam um calado único geravam falsos alertas de encalhe na desatracação.

O sistema implementa o desacoplamento integral do cálculo:

1. **Atracação:** Avaliada estritamente contra o **Calado de Entrada ($C_{\text{entrada}}$)**.
2. **Desatracação:** Avaliada estritamente contra o **Calado de Saída ($C_{\text{saída}}$)**.

#### Regras de Dedução Operacional Automática:

* **Graneis de Descarga / Importação (Barrilha, Trigo, Cevada, Malte, Alumina):**
  $$C_{\text{entrada}} = \text{Calado Informado (Carregado)}$$
  $$C_{\text{saída}} = \max\left(5{,}80\,\text{m},\, \min\left(6{,}80\,\text{m},\, C_{\text{entrada}} - 3{,}40\,\text{m}\right)\right) \quad (\text{Condição de Lastro})$$
  *Exemplo:* Navio *AFRICAN GROUSE* entra com $11{,}20\,\text{m}$ (requer preamar de $1{,}70\,\text{m}$) e sai em lastro com $6{,}50\,\text{m}$ ($\text{UKC} = 10{,}00 + 1{,}23 - 6{,}50 = +4{,}73\,\text{m}$, manobra 100% segura).

* **Exportação de Carga Viva (Animais Vivos):**
  $$C_{\text{entrada}} = \max\left(6{,}00\,\text{m},\, C_{\text{saída}} - 0{,}90\,\text{m}\right) \quad (\text{Chegada em Lastro})$$
  $$C_{\text{saída}} = \text{Calado Informado (Carregado)}$$

* **Integração com a Praticagem de SP (`praticagem_manobras`):**
  Se a Pauta Oficial da Praticagem possuir calados registrados para a manobra (`E` para entrada ou `S` para saída), os valores declarados pelos práticos têm precedência sobre qualquer cálculo teórico.

---

### 3.7. Interpolação Harmônica Sinusoidal de Maré (Curva Contínua)

A Tábua da DHN/CHM fornece os extremos discretos astronômicos (Preamar e Baixamar). Para calcular a maré em qualquer minuto intermediário $t \in [t_1, t_2]$ entre dois extremos sucessivos $(t_1, y_1)$ e $(t_2, y_2)$, o sistema resolve a curva harmônica sinusoidal contínua:

$$M(t) = \frac{y_1 + y_2}{2} + \frac{y_1 - y_2}{2} \cdot \cos\left(\pi \cdot \frac{t - t_1}{t_2 - t_1}\right)$$

Propriedades físicas garantidas:
* $M(t_1) = y_1$ e $M(t_2) = y_2$.
* Derivada $\frac{dM}{dt} = 0$ em $t = t_1$ e $t = t_2$ (estofo de maré sem descontinuidade).
* Curvatura física realista de transição enchente/vazante.

---

### 3.8. Auditoria de Divergência Temporal de ETA (SISPORT vs. AIS)

Para cada escala, o sistema confronta o horário programado oficial com a telemetria satelital de bordo em tempo real:

$$\Delta \text{ETA} = \frac{t_{\text{eta\_ais}} - t_{\text{eta\_previsto}}}{3600 \times 1000} \quad [\text{horas}]$$

#### Faixas de Auditoria CCO:

| Intervalo | Status | Classificação CCO | Ação Operacional |
|---|---|---|---|
| $|\Delta \text{ETA}| \le 2{,}0\,\text{h}$ | **Conforme** | Tolerância Normal | Nenhuma intervenção necessária |
| $2{,}0\,\text{h} < \Delta \text{ETA} \le 24{,}0\,\text{h}$ | **Atraso Moderado** | ⚠️ `Atraso AIS: +Xh` | Monitorar evolução da velocidade de cruzeiro |
| $\Delta \text{ETA} > 24{,}0\,\text{h}$ | **Atraso Crítico** | ⚠️ `Atraso Severo: +Xd` | Alertar CCO para possível reordenação de berço |
| $-24{,}0\,\text{h} \le \Delta \text{ETA} < -2{,}0\,\text{h}$ | **Adiantado** | ⚡ `Adiantado: -Xh` | Planejar prontidão de berço antecipada |
| $\Delta \text{ETA} < -24{,}0\,\text{h}$ | **Super Adiantado** | ⚡ `Adiantado: -Xd` | Avaliar disponibilidade de fundeio na barra |

---

### 3.9. Algoritmo de Encadeamento em Cascata (Waterfall Scheduling)

O Porto de São Sebastião opera sob a restrição física de **berço comercial único** (Berço 101). O motor de agendamento em cascata (*Waterfall*) executa as seguintes etapas:

```mermaid
flowchart TD
    A[Início do Motor] --> B{Navio no Berço<br/>status_cor == VERDE?}
    B -- Sim --> C[Calcula Fim do Berço:<br/>Praticagem ou Run-Rate]
    B -- Não --> D[Término Berço Anterior = AGORA]
    C --> E[Loop nos Navios da Fila: i = 1 .. N]
    D --> E
    E --> F[Identifica Prontidão do Navio i:<br/>t_prontidao = Fundeio Real ou ETA]
    F --> G["t_inicio(i) = max(t_prontidao(i), t_fim(i-1) + 2.0h)"]
    G --> H["Calcula Duração: D_total = D_base + Chuva + 2.0h"]
    H --> I["t_fim(i) = t_inicio(i) + D_total"]
    I --> J[Avalia Restrições de Maré: UKC Entrada e Saída]
    J --> K[Gera Blocos da Linha do Tempo e Marcos ▲]
    K --> L{Mais navios na fila?}
    L -- Sim --> E
    L -- Não --> M[Retorna Lineup Atualizado & KPIs]
```

1. **Navio 1 (No Berço):**
   * Início: Ancorado no horário real de início da atracação.
   * Término: Definido pela Praticagem (se agendado) ou pelo Run-Rate efetivo da carga.
2. **Navios Subsequentes ($i = 2, \dots, N$):**
   $$t_{\text{atracacao}}(i) = \max\left(t_{\text{prontidao}}(i),\, t_{\text{desatracacao}}(i-1) + \Delta t_{\text{manobra}}\right)$$
   $$t_{\text{desatracacao}}(i) = t_{\text{atracacao}}(i) + D_{\text{total}}(i)$$
   Onde $t_{\text{prontidao}}(i) = t_{\text{chegada\_fundeio}} \text{ (se fundeado) ou } t_{\text{inicio\_operacao}} \text{ ou } t_{\text{eta\_previsto}}$.

---

### 3.10. Taxa de Ocupação do Berço e Backlog de Carteira

O cálculo de ocupação do berço é dissociado em dois indicadores para evitar distorções estatísticas:

1. **Taxa de Ocupação Nominal (Janela Mensal de 30 Dias = 720 Horas):**
   $$\text{Taxa Ocupação (30D)} = \min\left(100\%,\, \frac{\min(H_{\text{janela}}, 720)}{720} \times 100\%\right)$$
   Onde $H_{\text{janela}}$ é a soma das horas de ocupação de cais que recaem estritamente dentro dos próximos 30 dias a partir do `AGORA`.

2. **Demanda Total em Carteira (Backlog Acumulado):**
   $$\text{Demanda Total (\%)} = \frac{\sum_{i=1}^{N} D_{\text{total}}(i)}{720} \times 100\%$$
   $$\text{Dias de Cais Necessários} = \frac{\sum_{i=1}^{N} D_{\text{total}}(i)}{24} \quad [\text{dias}]$$
   *Exemplo Real:* Ocupação da janela $100\%$ | Backlog: $2.709{,}9\,\text{h}$ ($376{,}4\%$ de demanda acumulada, correspondendo a $\approx 113$ dias de cais).

---

### 3.11. Algoritmo de Resolução de IMO (Jaro-Winkler)

Para evitar dependência de APIs lentas ou indisponíveis, a associação do nome de uma embarcação ao seu IMO oficial (indexado em base local de 16.200+ registros) utiliza uma estratégia em 3 níveis:

* **Nível 1 (Exato):** Correspondência direta por string normalizada em maiúsculas:
  $$\text{trim}(\text{upper}(S_{\text{busca}})) == \text{trim}(\text{upper}(S_{\text{banco}}))$$
* **Nível 2 (Canônico):** Remoção de prefixos marítimos (`MV`, `MT`, `SS`), numerais romanos (`II`, `III`, `IV`) e caracteres especiais.
* **Nível 3 (Distância de Jaro-Winkler):**
  A similaridade de Jaro entre duas sequências $s_1$ e $s_2$ é dada por:
  $$d_j = \begin{cases}
  0, & \text{se } m = 0 \\
  \frac{1}{3}\left(\frac{m}{|s_1|} + \frac{m}{|s_2|} + \frac{m - t}{m}\right), & \text{caso contrário}
  \end{cases}$$
  Onde $m$ é a quantidade de caracteres coincidentes dentro da janela $\lfloor \frac{\max(|s_1|, |s_2|)}{2} \rfloor - 1$, e $t$ é o número de transposições dividido por 2.

  A métrica de Winkler adiciona peso ao prefixo coincidente inicial de comprimento $\ell \le 4$ com fator $p = 0{,}10$:
  $$d_w = d_j + \ell \cdot p \cdot (1 - d_j)$$

  * **Critério de Validação:** Aceita correspondência automática se $d_w \ge 0{,}85$. O tempo médio de resolução local no PostgreSQL é inferior a **$1{,}0\,\text{ms}$**.

---

## 4. Inovações e Ergonomia Visual do Gantt CCO (v2.0)

O diagrama de Gantt foi construído para visualização ininterrupta em centros de controle operacional de videowall:

1. **Cabeçalho Empilhado Fixo (*Sticky Stack*):**
   * **Linha 1 (`top-0`, 24px):** Linha guia do momento presente (`AGORA ▼`) com agulha vertical contínua que desce por toda a grade.
   * **Linha 2 (`top-24px`, 44px):** Régua dos dias do mês com destaque cromático nos finais de semana.
   * **Linha 3 (`top-68px`, 50px):** Sparkline vetorial SVG da curva harmônica de maré da DHN (azul ciano preamar `▲`, âmbar baixamar `▼`).
   * **Linha 4 (`top-118px`, 48px):** Fita contínua de ocupação do Berço 101 comercial.
2. **Barras Operacionais Limpas:** Identificação da etapa mantida no topo e nos tooltips sob demanda (*hover*), com visual limpo e sem poluição visual.
3. **Escalas Temporais Rápidas:** Alternador no topo para janelas de **7 Dias** (visão tática), **14 Dias** (visão quinzenal) e **28 Dias** (visão mensal de planejamento).
4. **Semântica de Cores Oficial CDSS:**
   * 🟢 **Verde:** Operando fisicamente no berço comercial único.
   * 🔵 **Azul:** Previsão de berço futura encadeada pelo motor.
   * 🔴 **Vermelho:** Fundeado na barra em espera confirmada.
   * 🟠 **Laranja:** Espera prevista (aguardando chegada do navio).
5. **Dark & Light Mode:** Paleta noturna profunda de alta densidade (`#070d18`) ou modo diurno de alto contraste (`#f8fafc`), com alternância instantânea.

---

## 5. Integração com a Praticagem (SP Pilots) & Projeção Real

O módulo conecta-se ao portal oficial da Praticagem de São Sebastião (`ssb.sppilots.com.br`):

* **Categorias de Manobra Capturadas:**
  * `PTA6` &bull; **Encerradas**
  * `PTA5` &bull; **Em Andamento**
  * `PTA4` &bull; **Confirmadas**
  * `PTA3` &bull; **Confirmadas pelo Agente**
  * `PTA1` &bull; **Solicitadas**
* **Projeção Real no Motor:** Quando a Praticagem agenda uma manobra de desatracação (`S`) para o navio em cais, o motor substitui a estimativa teórica pelo horário exato confirmado pelo prático (`origem_previsao_fim = 'PRATICAGEM'`).
* **Sincronização Híbrida:** Automática a cada 5 minutos no backend e botão manual de atualização sob demanda.

---

## 6. Canal de São Sebastião & Cartografia ANTAQ

A aba **Canal & Mapa** reúne a cartografia náutica oficial:

* **Face de Acostagem do Cais Comercial (Berço 101):** Extensão oficial de 210 metros representada no alinhamento exato de cais:
  - **Extensão:** $210\,\text{m}$ (face de acostagem entre `[-23.81165, -45.39767]` e `[-23.81071, -45.39661]`).
  - **Integração com a Poligonal:** Integrado à delimitação oficial da Área 1 (Anexo IX), com tooltip e popup interativo com especificações técnicas do cais.
* **Poligonal do Porto Organizado:** Camada GeoJSON vetorial com os vértices oficiais definidos pela **Portaria nº 501/2019 - MINFRA/ANTAQ**.
* **Basemaps CARTO:** Alternância entre mapas *Dark Matter*, *Positron*, *Voyager* e *Satélite*.

---

## 7. Endpoints REST da API

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/api/health` | **Healthcheck probe:** Retorna saúde do container e conectividade ativa com PostgreSQL |
| `GET` | `/api/livez` | **Liveness probe:** Endpoint ultraleve para Dokploy / Kubernetes |
| `GET` | `/api/version` | Versão atual da aplicação (`v2.0.0`) |
| `GET` | `/api/lineup` | Retorna o line-up com blocos discretos, marcos temporais, duplo calado, restrições de maré e KPIs |
| `POST` | `/api/navios` | Cadastro manual de escala com resolução de IMO e campos de duplo calado |
| `PUT` | `/api/navios/:id` | Atualização cadastral, alteração de status operacional, livre prática ou calados de entrada/saída |
| `DELETE` | `/api/navios/:id` | Exclusão de escala com reindexação atômica da fila sequencial |
| `POST` | `/api/navios/reordenar` | Reordenação em lote da fila de prioridade (`{ ids: number[] }`) |
| `POST` | `/api/navios/sync/:imo` | Sincroniza telemetria satelital AIS (DataDocked) e atualiza `eta_ais` |
| `POST` | `/api/sisport/sync` | Sincronização em tempo real com a programação oficial da CDSS (`portoss.sp.gov.br`) |
| `POST` | `/api/sisport/sync-all` | **Sincronização 3 em 1:** SISPORT &rarr; Praticagem SP Pilots &rarr; DataDocked AIS |
| `GET` | `/api/sisport/config` | Consulta parâmetros ativos, contagem regressiva, status e telemetria do agendador automático |
| `PUT` | `/api/sisport/config` | Parametrização em tempo de execução: `{ ativo, intervaloMinutos, modoSync }` sem reiniciar o Node.js |
| `GET` | `/api/praticagem/pauta` | Pauta completa da Praticagem (5 categorias, calados declarados, resumo do porto) |
| `POST` | `/api/praticagem/sync` | Força a sincronização imediata com a Praticagem de São Sebastião |
| `GET` | `/api/navios/search` | Consulta inteligente no Catálogo de 16.200+ navios por nome ou IMO |
| `GET` | `/api/operacional/resumo` | Retorna KPIs da central (Taxa de Ocupação, Horas Ocupadas, Volume Total) |
| `GET` | `/api/clima` | Resumo meteorológico horário do canal de São Sebastião |
| `GET` | `/api/mares` | Extremos astronômicos diários da tábua de marés da DHN/CHM |
| `GET` | `/api/weather/tide/current` | Telemetria maregráfica em tempo real (SP Pilots com fallback harmônico DHN) |
| `GET` | `/api/weather/rain/forecast` | Previsão horária de precipitação atmosférica |

---

## 8. Configuração do Ambiente (`.env`)

Crie o arquivo `.env` na raiz do projeto com base no modelo [.env.example](file:///d:/DEV/CDSS-Lineup/.env.example):

```env
PORT=3000
CLIENT_PORT=5173
NODE_ENV=development

# Conexão PostgreSQL
DATABASE_URL=postgresql://usuario:senha@host:porta/banco

# Credenciais de Acesso à Praticagem de São Sebastião (SP Pilots)
SP_PILOTS_USER=docasssb
SP_PILOTS_PASS="Docas#2019"
SP_PILOTS_URL=https://ssb.sppilots.com.br

# Sincronização Periódica e Parametrizada do SISPORT (Melhoria 8)
SISPORT_AUTO_SYNC_ENABLED=true
SISPORT_SYNC_INTERVAL_MINUTES=15
SISPORT_SYNC_MODE=SISPORT_ONLY

# Chave da API DataDocked para telemetria AIS satelital (opcional)
DATADOCKED_API_KEY=sua_chave_datadocked_aqui

# Chave de API do CARTO para tiles de mapas náuticos
VITE_CARTO_API_KEY=sua_chave_carto_aqui
```

---

## 9. Instruções de Execução Local

### Pré-requisitos
* **Node.js** v20+ ou v22 LTS instalado.
* Instância do **PostgreSQL** ativa (ou string `DATABASE_URL` configurada).

### 1. Instalação
```bash
npm install
```

### 2. Execução em Modo de Desenvolvimento
```bash
npm run dev
```
* **Frontend Web:** [`http://localhost:5173`](http://localhost:5173)
* **Backend API:** [`http://localhost:3000/api/lineup`](http://localhost:3000/api/lineup)

### 3. Build de Produção
```bash
npm run build
npm start
```

---

## 10. Deploy com Docker e Dokploy

O projeto conta com `Dockerfile` multi-stage altamente otimizado para deploy autônomo no Dokploy:

```bash
# Execução local via Docker Compose
docker compose up -d --build
```

### Configuração no Dokploy:
1. Conecte o repositório Git na branch `main`.
2. Configure **Build Type** como `Dockerfile`.
3. Defina a porta como `3000`.
4. Configure o Healthcheck como `/api/health`.
5. Preencha as variáveis de ambiente (`DATABASE_URL`, `SP_PILOTS_USER`, etc.).
6. Clique em **Deploy**. O container executa automaticamente a auto-migração de tabelas e indexação dos 16.200 navios no primeiro boot.

---

## 11. Licença & Uso

Propriedade do projeto **PCS Lineup &bull; v2.0.0**.  
Desenvolvido para apoio à tomada de decisão operacional, supervisão portuária e segurança da navegação na **Companhia Docas de São Sebastião (CDSS)**.
