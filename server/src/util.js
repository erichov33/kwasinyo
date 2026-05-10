export function getLocalDayDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  const d = parts.find((p) => p.type === 'day')?.value
  if (!y || !m || !d) throw new Error('Failed to compute local date')
  return `${y}-${m}-${d}`
}

export function clampInt(n, { min, max }) {
  if (!Number.isFinite(n)) return min
  const i = Math.trunc(n)
  if (i < min) return min
  if (i > max) return max
  return i
}

