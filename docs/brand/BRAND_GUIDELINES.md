# AZIMARA MESH — Brand Guidelines

## Core visual symbol
The master mark (`public/brand/azimara-mesh-mark.svg`) encodes the product idea:

- **Central coordination diamond** — the governed core; filled with the
  violet→blue brand gradient, inner diamond in Mesh Midnight.
- **Four autonomous agent nodes** — violet (N), blue (E), cyan (S), teal (W);
  the four planes of the operating fabric.
- **Mesh pathways** — gradient lines from core to nodes: coordination, not chaos.
- **Dark geometric outer structure** — the boundary diamond and rotated square
  in Mesh Border; governance as visible structure, not decoration.

## Asset inventory
| Asset | File | Notes |
|---|---|---|
| Primary mark | `public/brand/azimara-mesh-mark.svg` | Color, for dark surfaces |
| Monochrome | `public/brand/azimara-mesh-mono.svg` | `currentColor` — recolor via CSS |
| Horizontal wordmark | `public/brand/azimara-mesh-wordmark.svg` | AZIMARA (800) + MESH (300, gradient) |
| Stacked | `public/brand/azimara-mesh-stacked.svg` | For square placements |
| Favicon / app icon | `public/favicon.svg` | 32px-safe simplification |
| Dark-surface lockup | mono + white text | via `color: #F4F7FC` |
| Light-surface lockup | mono + midnight text | via `color: #0B1020` |
| Loading mark | mark + shimmer bar | see globals.css `.mesh-shimmer` |

All assets are hand-authored, editable SVG with transparent backgrounds — no raster
screenshots anywhere. The mark renders correctly at 16/24/32/48/64px and above.

## Usage rules
1. Clear space ≥ 25% of mark height on all sides.
2. Minimum size 16px (favicon); below 24px use the favicon simplification.
3. Do not rotate, outline, add drop shadows, or place the color mark on mid-tone
   backgrounds (contrast fails).
4. Monochrome variants inherit `currentColor` — this IS the light/dark/white/logo
   variant mechanism.
5. Wordmark letter-spacing is fixed; never re-typeset AZIMARA in another weight.

## Palette
| Token | Value | Role |
|---|---|---|
| Mesh Midnight | `#0B1020` | App background |
| Mesh Panel | `#111A2E` | Cards |
| Mesh Elevated | `#17243A` | Popovers, hover surfaces |
| Mesh Border | `#2A3A56` | Structure lines, mark frame |
| Mesh Violet | `#8B7CFF` | Primary accent (interactive) |
| Mesh Blue | `#5D8CFF` | Secondary accent |
| Mesh Cyan | `#42D9E8` | Telemetry highlights |
| Mesh Teal | `#39C7B2` | Success-adjacent data |
| Success / Warning / Danger / Info | `#35C991` / `#F2B95D` / `#F06B7A` / `#66A8F8` | Status |
| Primary / Secondary / Muted text | `#F4F7FC` / `#B4C0D4` / `#8593AA` | Type |

Gradient use is **restrained**: brand moments (logo, primary metric emphasis) and
high-value visualizations only. The interface must never "glow purple".

## Voice
- Precise, operational, calm. Verbs over adjectives.
- Never claim production deployment, uptime or adoption that has not been verified.
- Status language maps to the chip system (`healthy`, `degraded`, `waiting approval`).
