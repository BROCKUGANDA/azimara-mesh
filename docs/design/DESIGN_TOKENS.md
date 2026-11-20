# AZIMARA MESH — Design Tokens

Source of truth: `src/app/globals.css`. Semantic aliases consumed as Tailwind theme
variables (`@theme inline`).

## Brand (raw)
| Token | Value |
|---|---|
| --mesh-midnight | #0B1020 |
| --panel | #111A2E |
| --elevated | #17243A |
| --mesh-border | #2A3A56 |
| --mesh-violet | #8B7CFF |
| --mesh-blue | #5D8CFF |
| --mesh-cyan | #42D9E8 |
| --mesh-teal | #39C7B2 |
| --success | #35C991 |
| --warning | #F2B95D |
| --danger | #F06B7A |
| --info | #66A8F8 |

## Semantic (dark default)
| Alias | Value | Alias | Value |
|---|---|---|---|
| --background | #0B1020 | --card | #111A2E |
| --popover | #17243A | --secondary | #17243A |
| --muted-foreground | #8593AA | --secondary-foreground | #B4C0D4 |
| --foreground | #F4F7FC | --primary | #8B7CFF |
| --primary-foreground | #0B1020 | --ring | #8B7CFF |
| --border / --input | #223050 | --destructive | #F06B7A |
| --chart-1..5 | violet, cyan, teal, blue, amber | --sidebar | #0E1526 |

Light theme (`.light`): background #F6F8FC, card #FFF, primary #6C5CE7 (WCAG-safe on
white), full remap of every alias incl. charts.

## Typography
| Token | Size | Line height | Weight | Notes |
|---|---|---|---|---|
| Display | 48 | 1.1 | 700 | -0.02em |
| H1 | 36 | 1.15 | 700 | -0.02em |
| H2 | 28 | 1.2 | 650 | -0.01em |
| H3 | 24 | 1.25 | 600 | |
| H4 | 20 | 1.3 | 600 | |
| Body-lg | 16 | 1.5 | 400 | |
| Body | 14 | 1.5 | 400 | |
| Body-sm | 13 | 1.45 | 400 | |
| Caption | 12 | 1.4 | 400 | |
| Micro | 11 | 1.35 | 500 | 0.06em, uppercase |

Fonts: `--font-geist-sans` (UI), `--font-geist-mono` (IDs, code, telemetry).
`.tnum` enforces tabular numerals.

## Radius
control 6 · button 9 · card 12 · large 16 · modal 20 · pill 999.
Utilities: `.radius-control/.radius-button/.radius-card/.radius-large/.radius-modal`.

## Spacing
4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80.

## Elevation
`.elev-1` 0 1 2 rgba(4,8,20,.4) · `.elev-2` 0 4 16 rgba(4,8,20,.45) ·
`.elev-3` 0 12 40 rgba(4,8,20,.55).

## Motion
| Token | Duration | Use |
|---|---|---|
| fast | 120ms | hovers, chips |
| std | 180ms | buttons, cards |
| panel | 220ms | drawers, dialogs |
| graph | 300ms | canvas nodes, charts |
Loading shimmer: 1.6s linear, panel→elevated, `.mesh-shimmer`.
`prefers-reduced-motion` collapses all durations to 0.01ms.

## Surfaces
`.grid-surface` 24px grid (canvas), `.brand-gradient-text` violet→blue→cyan
(brand moments only).
