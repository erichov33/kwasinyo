export function formatMoneyCents(cents: number) {
  const value = (cents ?? 0) / 100
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function parseMoneyToCents(input: string) {
  const normalized = input.replace(/[^\d.]/g, '')
  if (!normalized) return 0
  const [a, b] = normalized.split('.')
  const whole = Number(a || '0')
  const frac = String(b || '').padEnd(2, '0').slice(0, 2)
  const cents = whole * 100 + Number(frac || '0')
  return Number.isFinite(cents) ? cents : 0
}

