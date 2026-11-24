// Cross-browser fetch timeout. AbortSignal.timeout is not available in older
// Safari/Edge versions; an explicit AbortController works everywhere fetch does.
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs = 8000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: init.signal ?? controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
