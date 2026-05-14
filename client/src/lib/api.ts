export type ApiError = { error: string }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const timeoutMs = Number((globalThis as any).__KW_API_TIMEOUT_MS ?? 15_000)
  const controller = init?.signal ? null : new AbortController()
  const timeoutId =
    controller && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : null

  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      signal: init?.signal ?? controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('api_timeout')
    throw e
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId)
  }

  const text = await res.text()
  let data: any = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const msg = (data && typeof data.error === 'string' && data.error) || 'request_failed'
    const err = new Error(msg)
    ;(err as any).status = res.status
    ;(err as any).data = data
    throw err
  }

  return data as T
}
