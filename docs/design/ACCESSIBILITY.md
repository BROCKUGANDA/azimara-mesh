# AZIMARA MESH — Accessibility

Implemented baseline (WCAG 2.1 AA-oriented) in the shipped UI:

## Structure & semantics
- Single `<h1>` per view (`PageHeader`), section titles via Card headings;
  logical landmarks: `<nav aria-label="Product navigation">`, `<main id="main">`,
  `<header>`, `<footer>`, `<aside>` for the sidebar.
- Tables use real `<table>/<thead>/<tbody>` semantics with header cells.
- Icons that carry meaning have `aria-label`s (approvals count, health dots);
  decorative icons are `aria-hidden` via usage pattern.

## Keyboard
- All navigation entries, rows, buttons and menu items are real `<button>`s —
  tabbable and Enter/Space activated.
- Command palette: ⌘K/Ctrl-K global shortcut; autofocus input; Esc closes (Radix).
- Dialogs (Radix) trap focus, restore on close; `Escape` everywhere.
- No positive `tabindex`; DOM order matches visual order.

## Screen readers
- `aria-current="page"` on the active nav item.
- `aria-label` on icon-only controls (approvals, notifications, menu toggles).
- Live regions: toasts announce via sonner's built-in live region; polling updates
  mutate text nodes (announced when focused, not aggressively broadcast).
- `aria-expanded` on dropdown triggers, `aria-checked` on the environment radio group.

## Visual
- Dark theme contrast: body text #F4F7FC on #0B1020 ≈ 15.9:1; secondary #B4C0D4 on
  panel ≥ 7:1; muted #8593AA reserved for non-essential meta.
- Status never relies on color alone — chips include text labels + dots; risk badges
  are text.
- Light theme ships with darkened accents (#6C5CE7 primary at 4.6:1 on white).
- Focus-visible ring (violet, 2px offset) enforced globally via `outline-ring/50`.
- Reduced motion supported (see MOTION_SPECIFICATION.md).

## Known gaps (roadmap)
- Full automated axe-core CI gate.
- Complete screen-reader pass on the canvas editor (node inspector is keyboard
  reachable; node drag currently pointer-only — keyboard repositioning planned).
- High-contrast theme variant beyond light/dark.
