# AZIMARA MESH — Design System

Implemented in `src/app/globals.css` (token layer) and `src/components/mesh/*`
(component layer), on Tailwind CSS 4 + shadcn/ui primitives.

## Foundations
- **Dark-first.** Mesh Midnight is the default theme; a complete light theme ships via
  the `.light` class on `<html>` (all semantic variables remapped).
- **Semantic aliases only.** Components consume `--background`, `--card`, `--primary`,
  `--border`, `--success`… — raw hex values appear only in the token file and the
  brand mark.
- **Typography.** Geist Sans for UI, Geist Mono for technical values (IDs, expressions,
  fingerprints). Tabular numerals (`tnum` utility) on every metric, latency, cost cell.
- **Spacing.** 4px base scale (4/8/12/16/20/24/32/40/48/64/80) via Tailwind steps.
- **Radius scale.** control 6 · button 9 · card 12 · large 16 · modal 20 · pills full
  (utilities `.radius-control` … `.radius-modal`; shadcn `--radius` set to 12px).
- **Elevation.** Three shadow tokens (`.elev-1/2/3`), subtle and dark-biased; borders —
  not glassmorphism — separate dense information.
- **Motion.** `.motion-fast/std/panel/graph` (120/180/220/300ms), reduced-motion
  respected globally, single restrained shimmer (`.mesh-shimmer`), no looping
  indicators in monitoring surfaces.
- **Scrollbars.** Thin, dark, styled for dense tables and logs.

## Type scale
Display 48 · H1 36 · H2 28 · H3 24 · H4 20 · Body-lg 16 · Body 14 · Body-sm 13 ·
Caption 12 · Micro 11 (uppercase, tracked).

## Component system
Implemented in `src/components/mesh/kit.tsx`, `charts.tsx`, `canvas.tsx`:
`PageHeader`, `Section`, `MetricCard`, `StatusChip` (24 status styles), `RiskBadge`,
`AutonomyBadge`, `HealthDot`, `DataTable` (generic, sortable columns, row click),
`EmptyState`, `KV`, `PermissionNote`, `SeededNote`, `LoadingBlock`, `ErrorNote`,
`Json`, plus `UsageArea`, `TrendLine`, `CostBars`, `Donut`, `TraceWaterfall`,
`ExecutionTimeline` and the workflow `WorkflowCanvas`.

Interaction states: every control ships hover/focus-visible/active/disabled via
shadcn primitives + token classes; status chips pulse only for `running/deploying/
validating`.

See DESIGN_TOKENS.md for values, COMPONENT_LIBRARY.md for the inventory,
MOTION_SPECIFICATION.md and ACCESSIBILITY.md for the behavioral contracts.
