// Small haptic helper. Feature-detected so desktop and unsupported browsers
// simply no-op. Patterns are deliberately subtle.
export function haptic(pattern: number | number[] = 10): void {
  if (typeof navigator === 'undefined') return
  if (!('vibrate' in navigator)) return
  try { navigator.vibrate?.(pattern) } catch { /* ignore */ }
}
