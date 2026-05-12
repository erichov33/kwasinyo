import { getLocalDayDate } from '../util.js'

export function addDays(dayDate, deltaDays) {
  const [y, m, d] = dayDate.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return getLocalDayDate(dt)
}

export function listLastDays(count) {
  const today = getLocalDayDate()
  const days = []
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(addDays(today, -i))
  }
  return days
}

export function listDaysBetween(startDayDate, endDayDate) {
  if (startDayDate > endDayDate) return []
  const days = []
  let d = startDayDate
  while (d <= endDayDate) {
    days.push(d)
    d = addDays(d, 1)
    if (days.length > 400) break
  }
  return days
}

export function startOfWeek(dayDate) {
  const [y, m, d] = dayDate.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  const delta = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - delta)
  return getLocalDayDate(dt)
}

export function buildPeakHours(hourRows) {
  const hourMap = new Map(hourRows.map((r) => [Number(r.hour), r]))
  return Array.from({ length: 24 }).map((_, h) => {
    const r = hourMap.get(h) ?? null
    return {
      hour: h,
      ticketsCount: r?.ticketsCount ?? 0,
      revenueCents: r?.revenueCents ?? 0,
    }
  })
}

export function buildReportSeries({ days, group, ticketsByDay, recMap }) {
  let pendingDays = 0
  let cashierSubmittedDays = 0
  let confirmedDays = 0

  const makeDaySeries = () =>
    days.map((d) => {
      const t = ticketsByDay.get(d) ?? { ticketsCount: 0, revenueCents: 0 }
      const rec = recMap.get(d) ?? null
      let status = 'pending'
      if (rec?.cashierSubmittedAt && !rec?.ownerConfirmedAt) status = 'cashier_submitted'
      if (rec?.ownerConfirmedAt) status = 'confirmed'
      if (status === 'pending') pendingDays += 1
      if (status === 'cashier_submitted') cashierSubmittedDays += 1
      if (status === 'confirmed') confirmedDays += 1
      return {
        key: d,
        label: d,
        start: d,
        end: d,
        ticketsCount: t.ticketsCount ?? 0,
        revenueCents: t.revenueCents ?? 0,
        discrepancyCashCents: rec?.discrepancyCashCents ?? null,
        status,
      }
    })

  const makeWeekSeries = () => {
    const bucket = new Map()
    for (const d of days) {
      const ws = startOfWeek(d)
      const t = ticketsByDay.get(d) ?? { ticketsCount: 0, revenueCents: 0 }
      const r = recMap.get(d) ?? null
      const cur =
        bucket.get(ws) ?? ({ ticketsCount: 0, revenueCents: 0, discrepancyCashCents: 0, submittedDays: 0, confirmedDays: 0 })
      cur.ticketsCount += t.ticketsCount ?? 0
      cur.revenueCents += t.revenueCents ?? 0
      if (r?.cashierSubmittedAt) cur.submittedDays += 1
      if (r?.ownerConfirmedAt) cur.confirmedDays += 1
      if (r?.discrepancyCashCents !== null && r?.discrepancyCashCents !== undefined) cur.discrepancyCashCents += r.discrepancyCashCents
      bucket.set(ws, cur)
    }
    const weekStarts = [...bucket.keys()].sort()
    return weekStarts.map((ws) => {
      const b = bucket.get(ws)
      let status = 'pending'
      if (b.submittedDays > 0) status = 'cashier_submitted'
      if (b.confirmedDays === b.submittedDays && b.submittedDays > 0) status = 'confirmed'
      if (status === 'pending') pendingDays += 1
      if (status === 'cashier_submitted') cashierSubmittedDays += 1
      if (status === 'confirmed') confirmedDays += 1
      return {
        key: ws,
        label: ws,
        start: ws,
        end: addDays(ws, 6),
        ticketsCount: b.ticketsCount,
        revenueCents: b.revenueCents,
        discrepancyCashCents: b.submittedDays > 0 ? b.discrepancyCashCents : null,
        status,
      }
    })
  }

  const makeMonthSeries = () => {
    const bucket = new Map()
    for (const d of days) {
      const ym = d.slice(0, 7)
      const t = ticketsByDay.get(d) ?? { ticketsCount: 0, revenueCents: 0 }
      const r = recMap.get(d) ?? null
      const cur =
        bucket.get(ym) ??
        ({ ticketsCount: 0, revenueCents: 0, discrepancyCashCents: 0, submittedDays: 0, confirmedDays: 0, start: `${ym}-01`, end: d })
      cur.ticketsCount += t.ticketsCount ?? 0
      cur.revenueCents += t.revenueCents ?? 0
      cur.end = d
      if (r?.cashierSubmittedAt) cur.submittedDays += 1
      if (r?.ownerConfirmedAt) cur.confirmedDays += 1
      if (r?.discrepancyCashCents !== null && r?.discrepancyCashCents !== undefined) cur.discrepancyCashCents += r.discrepancyCashCents
      bucket.set(ym, cur)
    }
    const yms = [...bucket.keys()].sort()
    return yms.map((ym) => {
      const b = bucket.get(ym)
      let status = 'pending'
      if (b.submittedDays > 0) status = 'cashier_submitted'
      if (b.confirmedDays === b.submittedDays && b.submittedDays > 0) status = 'confirmed'
      if (status === 'pending') pendingDays += 1
      if (status === 'cashier_submitted') cashierSubmittedDays += 1
      if (status === 'confirmed') confirmedDays += 1
      return {
        key: ym,
        label: ym,
        start: b.start,
        end: b.end,
        ticketsCount: b.ticketsCount,
        revenueCents: b.revenueCents,
        discrepancyCashCents: b.submittedDays > 0 ? b.discrepancyCashCents : null,
        status,
      }
    })
  }

  const series = group === 'week' ? makeWeekSeries() : group === 'month' ? makeMonthSeries() : makeDaySeries()

  return {
    series,
    statusCounts: {
      pending: pendingDays,
      cashier_submitted: cashierSubmittedDays,
      confirmed: confirmedDays,
    },
  }
}

