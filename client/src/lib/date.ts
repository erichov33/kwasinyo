export function formatDayDate(dayDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayDate)) return dayDate
  const [y, m, d] = dayDate.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(dt)
}

