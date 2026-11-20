# AZIMARA MESH — Motion Specification

Principles: motion communicates state change, never decorates; monitoring surfaces
must never flash; reduced-motion is a first-class mode.

## Tokens (globals.css)
| Token | Duration | Easing | Applied to |
|---|---|---|---|
| motion-fast | 120ms | ease | chips, health dots, small hovers |
| motion-std | 180ms | ease | buttons, metric cards, table rows |
| motion-panel | 220ms | ease | dialogs, dropdowns, sheets |
| motion-graph | 300ms | ease | canvas nodes, chart re-renders |

## Patterns
- **View transitions (SPA router):** instant swap; view-local skeletons absorb latency.
  No page-level fade that delays data reading.
- **Live polling:** values update in place; `StatusChip` pulses only for
  `running / deploying / validating`. Timestamps render relative ("2m ago").
- **Trace waterfall:** static bars; click → detail section; no animation loops.
- **Canvas:** node drag uses pointer capture (no transition during drag to avoid
  lag); edges re-render immediately; panel transitions 220ms.
- **Loading:** route-level brand shimmer (1.6s) only on first boot;
  `LoadingBlock` skeletons elsewhere; buttons show textual progress ("Starting…").
- **Toasts:** sonner defaults (slide+fade, auto-dismiss).
- **Command palette:** dialog scale/fade 220ms; list filtering is synchronous.

## Reduced motion
`@media (prefers-reduced-motion: reduce)` sets all animation/transition durations to
0.01ms and caps iterations at 1 — pulses, shimmer and transitions collapse to instant
state changes. Monitoring remains fully usable.

## Forbidden
- Flashing indicators or >2 looped animations in a viewport.
- Motion on numeric telemetry (no counting animations) — values are exact at render.
- Animated gradients on dense surfaces; brand gradient restricted to identity moments.
