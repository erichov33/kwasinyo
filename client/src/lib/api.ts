export type ApiError = { error: string }

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    const msg = (data && typeof data.error === 'string' && data.error) || 'request_failed'
    const err = new Error(msg)
    ;(err as any).status = res.status
    ;(err as any).data = data
    throw err
  }

  return data as T
}

