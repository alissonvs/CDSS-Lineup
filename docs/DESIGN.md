---
name: SISPORT CDSS Corporate Light
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0051d5'
  on-secondary: '#ffffff'
  secondary-container: '#316bf3'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#001d31'
  on-tertiary-container: '#188ace'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#dbe1ff'
  secondary-fixed-dim: '#b4c5ff'
  on-secondary-fixed: '#00174b'
  on-secondary-fixed-variant: '#003ea8'
  tertiary-fixed: '#cce5ff'
  tertiary-fixed-dim: '#93ccff'
  on-tertiary-fixed: '#001d31'
  on-tertiary-fixed-variant: '#004b73'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

The design system establishes a high-performance, critical-mission interface for port dispatchers, marine pilots, terminal operators, and port authority executives at Porto de São Sebastião. The operational reality demands swift, error-free cognitive processing of complex vessel dynamics, hydro-meteorological windows, and dock allocations.

The visual direction merges **Corporate Precision** with **Data-Dense Utilitarianism**:
- **Clarity over ornament:** Chrome elements yield absolute focus to maritime status indicators, scheduling timelines, and telemetry graphs.
- **Controlled density:** Compact layouts maximize vertical visual budget without inducing cognitive overload, utilizing structural hierarchy and strict border-separated zones.
- **Calm, decisive ergonomics:** The palette replaces stark high-contrast warning sirens with refined, muted semantic tints that remain instantly distinguishable under varied ambient lighting conditions in control towers and executive desks.

## Colors

The system uses an executive light architecture engineered to mitigate ocular strain during extended surveillance shifts while maintaining sharp data demarcation.

### Core Canvas & Surfaces
- **App Canvas Base:** `#F8FAFC` (Slate 50) and `#F1F5F9` (Slate 100) for structural background layering and sub-panels.
- **Card & Table Surfaces:** Pure `#FFFFFF` to provide elevation contrast and focus areas.
- **Structural Dividers:** `#E2E8F0` (Slate 200) for clean, crisp structural boundaries.
- **Text Hierarchy:** High-contrast slate neutrals:
  - Primary text: `#0F172A` (Slate 900)
  - Secondary/Label text: `#334155` (Slate 700)
  - Muted/Metadata text: `#64748B` (Slate 500)

### Maritime Semantic Statuses
Status badges, berth gantt bars, and vessel state cards adhere to four muted dual-tone pairings:
- **Operando Real (Actual Operation):** Text/Icon `#059669`, Background `#ECFDF5`, Border `#A7F3D0`.
- **Previsão de Operação (Planned Operation):** Text/Icon `#2563EB`, Background `#EFF6FF`, Border `#BFDBFE`.
- **Fundeio Real (Anchored Active):** Text/Icon `#DC2626`, Background `#FEF2F2`, Border `#FECACA`.
- **Fundeio Previsto (Anchored Planned):** Text/Icon `#D97706`, Background `#FFFBEB`, Border `#FDE68A`.

### Critical Markers & Telemetry
- **Timeline 'AGORA' (Now Marker):** `#E11D48` (Rose 600) with matching pulsating anchor dots.
- **Tide Chart (Gráfico de Maré):** Line stroke in `#1E3A8A` (Deep Marine Navy) paired with a vertical linear gradient fill transitioning from `rgba(6, 182, 212, 0.28)` (Cyan) at the crest to `rgba(239, 246, 255, 0.0)` at zero datum.

## Typography

The type scale leverages **Inter** for its neutral geometry, tall x-height, and legible distinction between glyphs (e.g., `1`, `l`, `I`) essential for vessel IMO codes, draft numbers, and arrival timestamps.

### Usage Standards
- Enable tabular figures (`font-feature-settings: "tnum" 1`) across all operational schedules, ETA displays, coordinates, and tide depth counters to prevent layout shift during realtime streaming updates.
- Uppercase styling is reserved for `label-sm` when used in micro-headers, berth designations (e.g., `BERÇO 1`, `TECON`), and operational state badges.
- Body text sizes are condensed by default (`13px` / `body-md`) to permit dense information grids without sacrificing readability.

## Layout & Spacing

The layout operates on a fluid, modular grid tailored for data monitoring stations (1920x1080 and above) as well as tablet inspection interfaces:
- **Canvas Division:** Multi-panel architecture with a persistent contextual left-rail navigation (compact, 64px collapsed / 240px expanded), an interactive main operational viewport (berth occupancy gantt / hydro-meteorological telemetry), and an optional collapsible side inspector (vessel manifest).
- **Rhythm:** An 8pt base grid tightened to 4pt micro-increments (`0.25rem`) for compact data table cells and badge internal padding.
- **Breakpoints:**
  - `Desktop Wide (>= 1440px)`: Full multi-pane view with side-by-side timeline, map, and telemetry modules.
  - `Desktop (1024px - 1439px)`: Side panel collapses into overlay drawers; gantt chart horizontal pan enabled.
  - `Tablet (< 1024px)`: Single-column stacked cards; operational tables support frozen header and first column.

## Elevation & Depth

Visual hierarchy is communicated through structural layering, crisp borders, and subtle ambient shadows rather than heavy skeuomorphic drop shadows.

- **Base Layer (L0):** `#F8FAFC` canvas. Flat, unshadowed.
- **Structural Layer (L1):** `#FFFFFF` surfaces bounded by solid `1px` border of `#E2E8F0`. Used for data grid containers, cards, and toolbars.
- **Interactive Elevated Layer (L2):** Vessel cards on hover, popovers, and date pickers use a tight diffuse shadow: `0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 2px 4px -2px rgba(15, 23, 42, 0.05)` with `#E2E8F0` border.
- **Floating Overlays (L3):** Contextual tooltips, vessel tracking HUD overlays, and modal alerts use: `0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -4px rgba(15, 23, 42, 0.03)` with border `#CBD5E1`.

## Shapes

The design system enforces a disciplined, utilitarian corner curve (`roundedness: 1`):
- Standard container radius: `4px` (`0.25rem`). Gives panels, input controls, table headers, and vessel status chips a tailored, technical contour.
- Large overlays and modals: `8px` (`0.5rem`).
- Pills: Full radius applied exclusively to runtime status dots and real-time live pills (e.g., `AGORA` timeline indicator tags).

## Components

### Buttons
- **Primary:** Solid `#0F172A` background, white label, `4px` radius. Hover state transitions to `#1E293B`.
- **Secondary:** White `#FFFFFF` surface with `1px solid #CBD5E1`, text `#334155`. Hover state fills with `#F8FAFC`.
- **Operational Action (Quick Berthing/Approval):** Subtle tinted states aligned with semantic colors (e.g., light blue background `#EFF6FF` with `#2563EB` border and text).
- **Height Metrics:** Standard `32px` (compact data-dense) and `40px` (standard actions).

### Badges & Status Chips
- Height fixed at `22px`, horizontal padding `8px`, radius `4px`.
- Typeface set to `label-md` (`11px`, weight `600`).
- Display formats use semantic backgrounds with a `1px` border:
  - *Operando Real:* Bg `#ECFDF5`, Border `#A7F3D0`, Text `#059669`. Includes a `6px` solid emerald circle prefix.
  - *Previsão de Operação:* Bg `#EFF6FF`, Border `#BFDBFE`, Text `#2563EB`.
  - *Fundeio Real:* Bg `#FEF2F2`, Border `#FECACA`, Text `#DC2626`.
  - *Fundeio Previsto:* Bg `#FFFBEB`, Border `#FDE68A`, Text `#D97706`.

### Tables & Data Grids
- **Header:** Background `#F1F5F9`, border bottom `1px solid #CBD5E1`, text `#64748B` in `label-sm` uppercase.
- **Row:** Height `36px` compact or `44px` standard. Border bottom `1px solid #E2E8F0`. Hover state switches to `#F8FAFC`.
- Cells containing measurements (draft, LOA, DWT) right-aligned with monospace/tabular digits.

### Input Fields & Selects
- Background `#FFFFFF`, border `1px solid #CBD5E1`, text `#0F172A`, placeholder `#94A3B8`.
- Focus state: border `#2563EB` with an external glow ring of `0 0 0 2px rgba(37, 99, 235, 0.15)`.

### Operational Timeline ('AGORA' Line)
- A vertical or horizontal continuous `2px` stroke in `#E11D48`.
- Integrated marker flag pinned to current vessel timeline slot, rendered with an active pulsating dot indicator (`#E11D48`).

### Tide Chart Component
- Container on `#FFFFFF` card with internal grid lines in `#F1F5F9`.
- Dynamic curve rendered with smooth Catmull-Rom spline: stroke `#1E3A8A` at `2px` width, with cyan-to-transparent area fill.
- High/low tide inflection points tagged with numeric tooltip chips in `#0F172A` over `#FFFFFF`.