# AZIMARA MESH — Component Library

## Navigation
- **Sidebar** (`app-shell.tsx`): 4 groups (Operate/Build/Trust/Manage), 25 items,
  active state with violet icon + elevated row, group accent colors, environment
  radio group, plan badge. Collapses to overlay on <lg screens.
- **Top bar**: workspace switcher (role + budget), breadcrumbs (group / view),
  command palette trigger, approvals badge (live count), notifications dropdown
  (unread ring, mark-all-read), user menu (role, settings, sign out).
- **Command palette**: ⌘K / ctrl-K; fuzzy view jump with group labels.
- **Breadcrumbs + environment selector**: dev/staging/prod radio group.

## Controls
shadcn primitives styled with mesh tokens: Button (radius 9), Input, Textarea,
Select, Switch, Tabs, Dialog (radius 20), DropdownMenu, Tooltip, Badge, Progress,
Skeleton. All states: hover / focus-visible ring (violet) / disabled / active.

## Data
- `MetricCard` — label, value (accent colors), sub-line, click-through, loading skeleton.
- `StatusChip` — 24 mapped statuses (healthy, degraded, waiting_approval, denied…),
  pulse on running-family; `RiskBadge` (low/medium/high/critical); `AutonomyBadge`
  (A0–A3 + label); `HealthDot`.
- `DataTable<T>` — generic columns with render closures, right-aligned `tnum` cells,
  row click, empty state, 13px dense rows.
- `ExecutionTimeline` — last 24 runs as colored duration bars with tooltips.
- Charts (`charts.tsx`): `UsageArea`, `TrendLine`, `CostBars` (horizontal), `Donut`.

## Workflow components
`WorkflowCanvas`: 12 node types with meta (color, glyph), pointer-drag with pointer
capture, bezier edges with true/false branch colors, connect-from-port flow, node
inspector (label, key, on-error, agent/tool/expr/iterations/delay/children config),
per-node edge list with deletion, palette buttons, validation banner, code-first tab
(spec JSON editor + apply). The spec — not the diagram — is the durable artifact.

## Trace & telemetry
`TraceWaterfall` — Gantt bars from span timestamps, kind-colored, click for detail;
`Json` viewer for payloads; `KV` rows for identity/limits.

## Feedback
Toast (sonner), `ErrorNote`, `PermissionNote`, `SeededNote` (sample-data disclosure),
`EmptyState`, `LoadingBlock` (skeleton), `LoadingMark` (route-level shimmer),
confirmation dialogs (emergency stop), badges for approvals/notifications.

## States contract
Every interactive component implements: default, hover, focus-visible, active,
disabled, selected (nav/rows), error (inputs, notes). Status color mapping is
centralized in `STATUS_STYLES` — no ad-hoc status colors in views.
