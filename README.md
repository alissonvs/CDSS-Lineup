# PCS Lineup &bull; Porto de São Sebastião (v2.0.0)

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-22_LTS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Vitest-39_Passed-22c55e?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest 39 Tests" />
  <img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Gantt_Density-Essencial_%26_Detalhado-3b82f6?style=for-the-badge&logo=blueprint&logoColor=white" alt="Modos Essencial e Detalhado" />
  <img src="https://img.shields.io/badge/Berços-101_&_201--204-10b981?style=for-the-badge&logo=port&logoColor=white" alt="Alocação Multi-Berço" />
  <img src="https://img.shields.io/badge/Praticagem-SP_Pilots-8b5cf6?style=for-the-badge&logo=anchor&logoColor=white" alt="Praticagem SP Pilots" />
  <img src="https://img.shields.io/badge/Themes-Dark_%26_Light-0ea5e9?style=for-the-badge&logo=w3c&logoColor=white" alt="Dark & Light Themes" />
  <img src="https://img.shields.io/badge/Dokploy-Supported-6366F1?style=for-the-badge&logo=linux&logoColor=white" alt="Dokploy" />
</p>

> **Sistema Web Operacional de Alta Densidade e Análise Preditiva para Centros de Controle Operacional (CCO)**  
> Desenvolvido sob medida para a **Companhia Docas de São Sebastião (CDSS)**, com motor determinístico em UTC invariante para berço comercial único e berços de apoio/cabotagem, modos de densidade no Gantt (**Essencial** de 2 linhas arejadas sem sobrecarga visual vs. **Detalhado** com especificações náuticas completas) persistidos em `localStorage`, **Ficha Técnica Flutuante** (prontuário náutico no hover), alternância ergonômica entre **Dark e Light Mode**, escalas temporais reativas (**7D**, **14D** e **28D**), validação cruzada de telemetria satelital (**AIS DataDocked** vs **SISPORT Oficial**), integração em tempo real com a **Pauta de Serviços da Praticagem de São Paulo (SP Pilots)** com **Ajuste Operacional Automático (Projeção Real)**, telemetria maregráfica em tempo real (**SP Pilots** & **DHN**), análise preditiva de **Folga Abaixo da Quilha (UKC - Under Keel Clearance)** com **Duplo Calado Náutico (Entrada vs. Saída)**, acompanhamento em tempo real do **% de progresso de operação em berço (Run-Rate)**, métricas de **Acurácia Preditiva e Confiabilidade do Modelo**, cálculo dinâmico de **Ocupação da Janela e Término Real da Fila**, resolução local de IMO via **Catálogo Naval (16.200+ embarcações)**, cartografia homologada **CARTO** e delimitação vetorial oficial da **Área do Porto Organizado (Portaria nº 501/2019 - MINFRA/ANTAQ)**.

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
   - 3.10. [Taxa de Ocupação da Janela e Término Real da Fila](#310-taxa-de-ocupação-da-janela-e-término-real-da-fila)
   - 3.11. [Acurácia do Modelo Preditivo e Níveis de Confiabilidade](#311-acurácia-do-modelo-preditivo-e-níveis-de-confiabilidade)
   - 3.12. [Alocação Dinâmica Multi-Berço (Berço 101 vs. Cais Interno 201–204)](#312-alocação-dinâmica-multi-berço-berço-101-vs-cais-interno-201204)
   - 3.13. [Algoritmo de Resolução de IMO (Jaro-Winkler)](#313-algoritmo-de-resolução-de-imo-jaro-winkler)
   - 3.14. [Preservação de Estados Operacionais e Fundeio Real](#314-preservação-de-estados-operacionais-e-fundeio-real)
4. [Inovações e Ergonomia Visual do Gantt CCO (v2.0)](#4-inovações-e-ergonomia-visual-do-gantt-cco-v20)
   - 4.1. [Modos de Densidade Operacional (Essencial vs. Detalhado)](#41-modos-de-densidade-operacional-essencial-vs-detalhado)
   - 4.2. [Ficha Técnica Flutuante (Prontuário Náutico no Hover)](#42-ficha-técnica-flutuante-prontuário-náutico-no-hover)
   - 4.3. [Escala Temporal Reativa Selecionável (7D, 14D e 28D)](#43-escala-temporal-reativa-selecionável-7d-14d-e-28d)
   - 4.4. [Cabeçalho Empilhado Fixo (Sticky Stack) & Linha Dourada "AGORA"](#44-cabeçalho-empilhado-fixo-sticky-stack--linha-dourada-agora)
   - 4.5. [Fitas Contínuas de Ocupação Multi-Berço](#45-fitas-contínuas-de-ocupação-multi-berço)
   - 4.6. [Barra Inferior de KPIs Operacionais & Widget de Acurácia](#46-barra-inferior-de-kpis-operacionais--widget-de-acurácia)
5. [Integração com a Praticagem (SP Pilots) & Projeção Real](#5-integração-com-a-praticagem-sp-pilots--projeção-real)
6. [Canal de São Sebastião & Cartografia ANTAQ](#6-canal-de-são-sebastião--cartografia-antaq)
7. [Endpoints REST da API](#7-endpoints-rest-da-api)
8. [Configuração do Ambiente (.env)](#8-configuração-do-ambiente-env)
9. [Instruções de Execução Local & Testes](#9-instruções-de-execução-local--testes)
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

### 3.10. Taxa de Ocupação da Janela e Término Real da Fila

O cálculo de capacidade e ocupação do berço é dissociado em indicadores complementares para refletir fielmente a dinâmica da infraestrutura portuária:

1. **Carga Total Programada ($V_{\text{carteira}}$):**
   $$V_{\text{carteira}} = \sum_{i=1}^{N} V_{\text{total}}(i) \quad [\text{t}]$$
   Somatório aritmético contínuo do volume manifestado de todas as $N$ embarcações ativas na fila oficial (ex: $209.294{,}4\,\text{t}$ distribuídas entre alumina, barrilha, malte, trigo, carga geral e carga viva).

2. **Taxa de Ocupação na Janela Visível ($W_{\text{janela}} \in \{7\text{D}, 14\text{D}, 28\text{D}\}$):**
   Ao invés de uma métrica estática de 30 dias que não reflete a escala do operador, o sistema calcula a taxa de ocupação física efetiva da janela selecionada:
   $$\text{Ocupação}_{\text{janela}} = \min\left(100\%,\, \frac{\sum_{i=1}^N \Delta t_{\text{visivel}}(i, W_{\text{janela}})}{W_{\text{horas}}} \times 100\%\right)$$
   Onde $\Delta t_{\text{visivel}}(i, W_{\text{janela}})$ é a fração de tempo em que a embarcação $i$ ocupa o cais dentro da janela temporal, e $W_{\text{horas}} = 7 \times 24 = 168\,\text{h}$ (7D), $14 \times 24 = 336\,\text{h}$ (14D) ou $28 \times 24 = 672\,\text{h}$ (28D).

3. **Término Real da Fila e Horizonte de Atendimento ($t_{\text{fim\_fila}}$):**
   $$t_{\text{fim\_fila}} = \max_{i=1 \dots N}(t_{\text{desatracacao}}(i))$$
   $$\text{Tempo Restante de Fila} = \frac{t_{\text{fim\_fila}} - \text{Agora}}{3600 \times 1000} \quad [\text{horas}]$$
   $$\text{Dias Corridos Estimados} = \frac{\text{Tempo Restante de Fila}}{24} \quad [\text{dias}]$$
   *Exemplo Real da Central:* Ocupação da janela visível $80\%$ | Fila Total: $1.536{,}1\,\text{h}$ com término previsto para $18/12/2026$ ($\approx 64$ dias contínuos de operação ininterrupta).

---

### 3.11. Acurácia do Modelo Preditivo e Níveis de Confiabilidade

O motor determinístico atribui índices objetivos de confiabilidade a cada estimativa de escala, sumarizados em um indicador global de acurácia no rodapé da aplicação:

1. **Níveis de Confiabilidade por Embarcação:**
   * **ALTA ($\ge 90\%$ de precisão esperada):** Navio em berço com manobra de saída confirmada pela Praticagem (`PTA4` / `PTA6`) ou com run-rate consolidado ($P_{\text{operacao}} \ge 5\%$), ou navio na fila com fundeio real confirmado e ETA alinhado com AIS satelital.
   * **MÉDIA ($75\% - 89\%$ de precisão esperada):** Navio com previsão de atracação em cascata dentro da primeira semana de atendimento, sem divergências críticas de maré ou calado.
   * **BAIXA ($< 75\%$ de precisão esperada):** Escalas distantes no horizonte de planejamento ($> 14$ dias) sujeitas a redistribuição na esteira ou navios com divergência severa de ETA entre SISPORT e AIS ($|\Delta \text{ETA}| > 24\,\text{h}$).

2. **Acurácia Média Ponderada da Central ($\text{Acc}_{\text{modelo}}$):**
   $$\text{Acc}_{\text{modelo}} = \frac{1}{N} \sum_{i=1}^N \text{Precisão Estimada}(i)$$
   *Exemplo Operacional:* **$96{,}2\%$ ALTA**, com widget interativo no rodapé que expande a contagem de navios por faixa de confiança (`15 Alta`, `3 Média`, `1 Baixa`) ao passar o mouse.

---

### 3.12. Alocação Dinâmica Multi-Berço (Berço 101 vs. Cais Interno 201–204)

O sistema suporta a segregação de tráfego entre diferentes infraestruturas de atracação do complexo portuário:

* **Berço 101 (Cais Comercial Principal):** Extensão de $210\,\text{m}$, calado de até $10{,}00\,\text{m}$ ao ZH, dedicado aos granéis sólidos de importação/exportação e carga viva internacional. Opera sob regra estrita de fila contínua exclusiva (apenas 1 navio atracado por vez).
* **Berço 201 a 204 (Cais Interno, Cabotagem e Apoio Marítimo):** Embarcações de apoio offshore, cabotagem e serviços portuários (ex: navio *ATLANTIS* no Berço 202).
* **Concorrência Operacional Respeitada:** O motor identifica navios alocados nos berços internos e permite sua operação simultânea sem bloquear ou interferir na esteira de atracação do Berço 101 comercial.
* **Fitas de Ocupação no Gantt:** O cabeçalho exibe fitas horizontais independentes para `BERÇO 101 • CAIS COMERCIAL` e `BERÇO 202 • CAIS INTERNO`, eliminando qualquer ambiguidade visual.

---

### 3.13. Algoritmo de Resolução de IMO (Jaro-Winkler)

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

### 3.14. Preservação de Estados Operacionais e Fundeio Real

Durante as sincronizações contínuas com a programação oficial da CDSS (`portoss.sp.gov.br`), o sistema aplica regras estritas de não-regressão de dados:

1. **Preservação de Chegada ao Fundeio ($t_{\text{fundeio}}$):**  
   Quando uma escala é catalogada como `PROGRAMADO` na planilha externa, o sincronizador verifica se a embarcação já possui carimbo de chegada ao fundeio salvo no banco de dados (inserido manualmente pelo operador ou calculado). Esse valor é mantido permanentemente e **nunca** sobrescrito com `null`.
2. **Preservação de Status Conquistado:**  
   Se uma embarcação já foi classificada pelo CCO como na barra (`VERMELHO`) ou com livre prática concedida (`CINZA`), atualizações externas que tragam `PROGRAMADO` preservam o status operacional real da escala.
3. **Resolução Cronológica de Fallback no Motor:**  
   Se um navio consta como fundeado na Praticagem mas sem horário registrado, o motor de cálculo primeiro avalia se o `eta_previsto` ou `eta_ais` já transcorreram no passado antes de recorrer a estimativas sintéticas, impedindo que navios distintos recebam carimbos temporais artificiais idênticos.

---

## 4. Inovações e Ergonomia Visual do Gantt CCO (v2.0)

O diagrama de Gantt foi construído para visualização ininterrupta em centros de controle operacional de videowall, incorporando avanços de ergonomia visual, controle de densidade e prontuário flutuante:

### 4.1. Modos de Densidade Operacional (Essencial vs. Detalhado)

Para atender tanto à visualização rápida e limpa em videowalls quanto à inspeção analítica profunda pelos operadores de turno, o sistema implementa um seletor de densidade no cabeçalho do Y-axis ([GanttChart.tsx](file:///d:/DEV/CDSS-Lineup/client/src/components/GanttChart.tsx)):

* **Modo Essencial (Padrão Ativo):**
  - **Altura Fixa Preservada (`h-24` = 96px):** Alinhamento horizontal perfeito com as barras e marcos da linha do tempo.
  - **Organização em 2 Linhas Arejadas:**
    - **Linha 1 (Superior):** Indicador de status em ponto pulsante (esmeralda para operando ou neutro para fila) + Nome completo do navio sem cortes (capacidade de até 23 caracteres, acomodando nomes extensos como `LIZZY CONFIDENCE` e `ADVENTURE HERO` sem reticências) + Badge de Berço Oficial (`B-101`, `B-202`) + Carga, ícone de chuva (`🌧️`) e Volume formatado (`7.000 t`).
    - **Linha 2 (Inferior):** Barra de progresso horizontal slim única com gradiente esmeralda e percentual integrado (`⚡ 38,9%` ou `⚡ 88,9%`), sem qualquer duplicação na raia lateral + Data/hora prevista de início para a fila (`Início: 18/10 20:00`) + Pílulas compactas de alerta crítico (`🌊 Maré Restrita`, `⚓ Praticagem`, `⚠️ AIS Adiantado/Atraso`, `🎯 Confiabilidade`) + Data de desatracação prevista (`Saída: 18/10 18:00`) ou duração estimada de cais (`Cais: ~18.8h`).
* **Modo Detalhado (Toggle Global):**
  - Acionado pelo botão `[ ☷ Detalhado ]` no topo da coluna lateral e memorizado no navegador via `localStorage` (`cdss_gantt_modo_exibicao`).
  - Renderiza na raia as especificações náuticas completas: LOA (m), Calados de Entrada e Saída (m), registro IMO, categoria da Praticagem e badges expandidos de telemetria.

### 4.2. Ficha Técnica Flutuante (Prontuário Náutico no Hover)

Ao posicionar o cursor sobre qualquer cartão de navio na coluna lateral, o sistema projeta um popover inteligente à direita sobre a área de histórico decorrido, atuando como prontuário náutico integral:
* **Dimensões Náuticas:** Comprimento Total (LOA) e Porte Bruto (DWT em toneladas).
* **Berço Oficial & Agência:** Berço designado (`B-101` ou `B-202`) e agência marítima responsável.
* **Calados Operacionais:** Entrada e Saída desacoplados com análise de lâmina d'água.
* **Manobra da Praticagem:** Categoria (`PTA1` a `PTA6`), status da ordem de manobra e confiança.
* **Recomendação de Maré:** Preamar astronômica recomendada pela DHN e altura requerida.
* **Status do Transponder AIS:** Data e hora exata da última sincronização com a telemetria satelital.

### 4.3. Escala Temporal Reativa Selecionável (7D, 14D e 28D)

O seletor no cabeçalho superior do CCO permite redimensionar dinamicamente o horizonte temporal do gráfico:
* **7 Dias (7D):** Foco tático de curto prazo (2 dias no passado + 5 dias no futuro).
* **14 Dias (14D):** Planejamento quinzenal de berço (3 dias no passado + 11 dias no futuro).
* **28 Dias (28D):** Visão estratégica mensal completa (3 dias no passado + 25 dias no futuro).
* **Micro-Labels Inteligentes:** A largura dos blocos e textos na linha do tempo adapta-se automaticamente à largura da tela via `ResizeObserver`, suprimindo labels em blocos estreitos para evitar sobreposição de texto.

### 4.4. Cabeçalho Empilhado Fixo (Sticky Stack) & Linha Dourada "AGORA"

1. **Cabeçalho Empilhado Fixo (*Sticky Stack*):**
   * **Linha 1 (`top-0`, 24px):** Linha de referência presente (**`AGORA ▼`**) com agulha vertical luminosa contínua que desce por toda a grade.
   * **Linha 2 (`top-24px`, 44px):** Régua dos dias do mês com destaque cromático no dia de hoje e nos finais de semana, contendo o seletor `[ 👁️ Essencial | ☷ Detalhado ]`.
   * **Linha 3 (`top-68px`, 50px):** Sparkline vetorial SVG da curva harmônica contínua de maré da DHN (azul ciano preamar `▲`, âmbar baixamar `▼`).
   * **Linha 4 (`top-118px`, 48px):** Fitas contínuas de ocupação dos berços comerciais e de apoio.
2. **Linha Guia "AGORA" em Amarelo Dourado (*Golden Radar*):**
   * Cursor temporal, badge `AGORA ▼` e linha vertical luminosa em tom **Amarelo Dourado** (`amber-400` / `#FBBF24`), garantindo alto contraste e zero interferência com alertas vermelhos de navios fundeados.
   * Carimbo temporal com horário oficial de Brasília (BRT) sincronizado com UTC invariante.

### 4.5. Fitas Contínuas de Ocupação Multi-Berço

Visualização da esteira de berço separada por cais:
* **`BERÇO 101 • CAIS COMERCIAL` (Fila Contínua):** Mostra o navio atualmente atracado e a sequência imediata das próximas escalas na fila única.
* **`BERÇO 202 • CAIS INTERNO` (Apoio / Simultâneo):** Exibe a operação concomitante de embarcações de apoio ou cabotagem sem poluir a esteira do Cais Comercial.

### 4.6. Barra Inferior de KPIs Operacionais & Widget de Acurácia

No rodapé da página, os indicadores operacionais atualizam-se em tempo real:
* **Total no Line-up:** Escalas ativas cadastradas (`19 navios`).
* **Operando no Berço:** Embarcações atracadas em atividade (`2 ativos` entre Cais Comercial e Interno).
* **Fundeio / Espera:** Navios aguardando atendimento na barra (`17 aguardando`).
* **Carga Total Programada:** Volume consolidado da carteira ($209.294{,}4\,\text{t}$).
* **Acurácia do Modelo Preditivo:** Percentual de confiabilidade média do encadeamento (**$96{,}2\%$ ALTA**), com popover no hover detalhando a distribuição de confiança.
* **Ocupação do Berço na Janela:** Medição precisa da janela ativa (**$80\%$** na janela 7D), com total de horas da fila ($1.536{,}1\,\text{h}$) e término estimado do atendimento ($\approx 64$ dias).

### 4.7. Menu Unificado de Sincronização CDSS no Header
* Disparo manual do SISPORT Oficial.
* Sincronização integrada 3 em 1 (SISPORT + Praticagem + AIS).
* Parametrização em tempo de execução da frequência do worker (5, 10, 15, 30 ou 60 minutos, ou pausado).
* Telemetria da última varredura e contagem regressiva para o próximo ciclo.

### 4.8. Semântica de Cores Oficial CDSS & Dark/Light Mode
* 🟢 **Verde:** Operando fisicamente no berço.
* 🔵 **Azul:** Previsão de berço futura calculada pelo motor.
* 🔴 **Vermelho:** Fundeado na barra em espera confirmada.
* 🟠 **Laranja:** Espera prevista (aguardando chegada do navio).
* ⚪ **Cinza:** Livre prática sanitária concedida.
* 🟡 **Amarelo Dourado:** Cursor temporal e Linha "AGORA" em tempo real.
* **Alternância Dark / Light:** Paleta profunda de alta densidade (`#070d18`) ou modo diurno de alto contraste (`#f8fafc`).

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
  - **Visualização Náutica Limpa:** Alinhamento geométrico do cais sobre a Área 1 (Anexo IX), eliminando marcadores avulsos de âncora sobre o berço e mantendo popups interativos com especificações técnicas e calados operacionais.
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

## 9. Instruções de Execução Local & Testes

### Pré-requisitos
* **Node.js** v20+ ou v22 LTS instalado.
* Instância do **PostgreSQL** ativa (ou string `DATABASE_URL` configurada).

### 1. Instalação de Dependências
```bash
npm install
```

### 2. Execução em Modo de Desenvolvimento
```bash
npm run dev
```
* **Frontend Web:** [`http://localhost:5173`](http://localhost:5173)
* **Backend API:** [`http://localhost:3000/api/lineup`](http://localhost:3000/api/lineup)

### 3. Execução dos Testes Automatizados (Vitest)
A plataforma possui cobertura abrangente de testes automatizados para validar a integridade matemática do motor:
```bash
npm test
```
* **Cobertura da Suite:** 39 testes unitários e de integração cobrindo motor determinístico, cálculo de run-rate, estimativa de chuva, engenharia de UKC/marés, alocação multi-berço e auditoria de divergência de ETA.

### 4. Build e Execução de Produção
```bash
# Compilação completa (servidor e cliente)
npm run build

# Ou compilação granular
npm run build:server
npm run build:client

# Inicialização do serviço em produção
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
