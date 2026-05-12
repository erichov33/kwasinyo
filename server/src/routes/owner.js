import { z } from 'zod'
import { query } from '../db.js'
import { requireRole } from '../auth.js'
import { clampInt, getLocalDayDate } from '../util.js'

function addDays(dayDate, deltaDays) {
  const [y, m, d] = dayDate.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return getLocalDayDate(dt)
}

function listLastDays(count) {
  const today = getLocalDayDate()
  const days = []
  for (let i = count - 1; i >= 0; i -= 1) {
    days.push(addDays(today, -i))
  }
  return days
}

function listDaysBetween(startDayDate, endDayDate) {
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

function startOfWeek(dayDate) {
  const [y, m, d] = dayDate.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  const delta = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - delta)
  return getLocalDayDate(dt)
}

async function getLastConfirmedDiscrepancy() {
  const r = await query(
    `
      SELECT day_date AS "dayDate", discrepancy_cash_cents AS "discrepancyCashCents"
      FROM day_reconciliations
      WHERE owner_confirmed_at IS NOT NULL
      ORDER BY day_date DESC
      LIMIT 1
    `,
  )
  return r.rows[0] ?? null
}

export function attachOwnerRoutes(app) {
  app.get('/api/owner/today-snapshot', requireRole('owner'), async (_req, res) => {
    const dayDate = getLocalDayDate()
    const totalsRes = await query(
      `
        SELECT COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "expectedRevenueCents"
        FROM tickets
        WHERE day_date = $1 AND voided_at IS NULL
      `,
      [dayDate],
    )
    const totals = totalsRes.rows[0] ?? { ticketsCount: 0, expectedRevenueCents: 0 }

    const recRes = await query(
      `
        SELECT
          cashier_submitted_at AS "cashierSubmittedAt",
          owner_confirmed_at AS "ownerConfirmedAt",
          discrepancy_cash_cents AS "discrepancyCashCents"
        FROM day_reconciliations
        WHERE day_date = $1
      `,
      [dayDate],
    )
    const rec = recRes.rows[0] ?? null

    let reconciliationStatus = 'pending'
    if (rec?.cashierSubmittedAt && !rec?.ownerConfirmedAt) reconciliationStatus = 'cashier_submitted'
    if (rec?.ownerConfirmedAt) reconciliationStatus = 'confirmed'

    const last = await getLastConfirmedDiscrepancy()

    res.json({
      dayDate,
      carsWashedToday: totals.ticketsCount ?? 0,
      expectedRevenueTodayCents: totals.expectedRevenueCents ?? 0,
      reconciliationStatus,
      todayDiscrepancyCashCents: rec?.discrepancyCashCents ?? null,
      lastConfirmedDiscrepancy: last,
    })
  })

  app.get('/api/owner/history', requireRole('owner'), async (req, res) => {
    const daysParam = Number(req.query.days)
    const days = clampInt(daysParam, { min: 7, max: 90 })
    const dayDates = listLastDays(days)
    const start = dayDates[0]
    const end = dayDates[dayDates.length - 1]

    const ticketTotalsRes = await query(
      `
        SELECT day_date AS "dayDate", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "expectedRevenueCents"
        FROM tickets
        WHERE day_date >= $1 AND day_date <= $2 AND voided_at IS NULL
        GROUP BY day_date
      `,
      [start, end],
    )
    const ticketTotals = new Map(ticketTotalsRes.rows.map((r) => [r.dayDate, r]))

    const recsRes = await query(
      `
        SELECT
          day_date AS "dayDate",
          declared_cash_cents AS "declaredCashCents",
          discrepancy_cash_cents AS "discrepancyCashCents",
          cashier_submitted_at AS "cashierSubmittedAt",
          owner_confirmed_at AS "ownerConfirmedAt"
        FROM day_reconciliations
        WHERE day_date >= $1 AND day_date <= $2
      `,
      [start, end],
    )
    const recs = new Map(recsRes.rows.map((r) => [r.dayDate, r]))

    const rows = dayDates
      .map((d) => {
        const tt = ticketTotals.get(d) ?? { ticketsCount: 0, expectedRevenueCents: 0 }
        const rec = recs.get(d) ?? null
        let status = 'pending'
        if (rec?.cashierSubmittedAt && !rec?.ownerConfirmedAt) status = 'cashier_submitted'
        if (rec?.ownerConfirmedAt) status = 'confirmed'

        return {
          dayDate: d,
          ticketsCount: tt.ticketsCount,
          expectedRevenueCents: tt.expectedRevenueCents,
          declaredCashCents: rec?.declaredCashCents ?? null,
          discrepancyCashCents: rec?.discrepancyCashCents ?? null,
          status,
        }
      })

    res.json({ days, rows })
  })

  app.get('/api/owner/reports', requireRole('owner'), async (req, res) => {
    const schema = z
      .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        type: z.string().optional(),
        group: z.enum(['day', 'week', 'month']).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' })

    const today = getLocalDayDate()
    const end = parsed.data.end ?? today
    const start = parsed.data.start ?? addDays(end, -29)

    if (start > end) return res.status(400).json({ error: 'invalid_range' })
    const days = listDaysBetween(start, end)
    if (days.length === 0) return res.status(400).json({ error: 'invalid_range' })
    if (days.length > 120) return res.status(400).json({ error: 'range_too_large' })

    const group = parsed.data.group ?? 'day'

    const totalsRes = await query(
      `
        SELECT
          COUNT(*)::int AS "ticketsCount",
          COALESCE(SUM(price_cents), 0)::int AS "totalRevenueCents",
          COUNT(DISTINCT plate)::int AS "uniquePlatesCount"
        FROM tickets
        WHERE day_date >= $1 AND day_date <= $2 AND voided_at IS NULL
      `,
      [start, end],
    )
    const totals = totalsRes.rows[0] ?? { ticketsCount: 0, totalRevenueCents: 0, uniquePlatesCount: 0 }

    const cashTotalsRes = await query(
      `
        SELECT
          COALESCE(SUM(expected_cash_cents), 0)::int AS "expectedCashCents",
          COALESCE(SUM(declared_cash_cents), 0)::int AS "declaredCashCents",
          COALESCE(SUM(discrepancy_cash_cents), 0)::int AS "discrepancyCashCents"
        FROM day_reconciliations
        WHERE day_date >= $1 AND day_date <= $2
      `,
      [start, end],
    )
    const cashTotals = cashTotalsRes.rows[0] ?? { expectedCashCents: 0, declaredCashCents: 0, discrepancyCashCents: 0 }

    const repeatRes = await query(
      `
        SELECT COUNT(*)::int AS "repeatPlatesCount"
        FROM (
          SELECT plate
          FROM tickets
          WHERE day_date >= $1 AND day_date <= $2 AND voided_at IS NULL
          GROUP BY plate
          HAVING COUNT(*) >= 2
        ) rp
      `,
      [start, end],
    )
    const repeat = repeatRes.rows[0] ?? { repeatPlatesCount: 0 }

    const serviceRes = await query(
      `
        SELECT service_type_name AS "serviceTypeName", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
        FROM tickets
        WHERE day_date >= $1 AND day_date <= $2 AND voided_at IS NULL
        GROUP BY service_type_name
        ORDER BY revenueCents DESC, ticketsCount DESC
      `,
      [start, end],
    )
    const serviceRows = serviceRes.rows

    const hourRes = await query(
      `
        SELECT
          EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC'))::int AS hour,
          COUNT(*)::int AS "ticketsCount",
          COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
        FROM tickets
        WHERE day_date >= $1 AND day_date <= $2 AND voided_at IS NULL
        GROUP BY hour
        ORDER BY hour ASC
      `,
      [start, end],
    )
    const hourMap = new Map(hourRes.rows.map((r) => [Number(r.hour), r]))
    const peakHours = Array.from({ length: 24 }).map((_, h) => {
      const r = hourMap.get(h) ?? null
      return {
        hour: h,
        ticketsCount: r?.ticketsCount ?? 0,
        revenueCents: r?.revenueCents ?? 0,
      }
    })

    const paymentRes = await query(
      `
        SELECT payment_method AS "paymentMethod", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
        FROM tickets
        WHERE day_date >= $1 AND day_date <= $2 AND voided_at IS NULL
        GROUP BY payment_method
      `,
      [start, end],
    )
    const paymentRows = paymentRes.rows

    const recRowsRes = await query(
      `
        SELECT
          day_date AS "dayDate",
          discrepancy_cash_cents AS "discrepancyCashCents",
          cashier_submitted_at AS "cashierSubmittedAt",
          owner_confirmed_at AS "ownerConfirmedAt"
        FROM day_reconciliations
        WHERE day_date >= $1 AND day_date <= $2
      `,
      [start, end],
    )
    const recMap = new Map(recRowsRes.rows.map((r) => [r.dayDate, r]))

    let pendingDays = 0
    let cashierSubmittedDays = 0
    let confirmedDays = 0

    const ticketsByDayRes = await query(
      `
        SELECT day_date AS "dayDate", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
        FROM tickets
        WHERE day_date >= $1 AND day_date <= $2 AND voided_at IS NULL
        GROUP BY day_date
      `,
      [start, end],
    )
    const ticketsByDay = new Map(ticketsByDayRes.rows.map((r) => [r.dayDate, r]))

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
        const cur = bucket.get(ws) ?? { ticketsCount: 0, revenueCents: 0, discrepancyCashCents: 0, submittedDays: 0, confirmedDays: 0 }
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
        const cur = bucket.get(ym) ?? { ticketsCount: 0, revenueCents: 0, discrepancyCashCents: 0, submittedDays: 0, confirmedDays: 0, start: `${ym}-01`, end: d }
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

    const totalTickets = totals.ticketsCount ?? 0
    const totalRevenueCents = totals.totalRevenueCents ?? 0
    const avgTicketCents = totalTickets > 0 ? Math.round(totalRevenueCents / totalTickets) : 0
    const expectedCashCents = cashTotals.expectedCashCents ?? 0
    const declaredCashCents = cashTotals.declaredCashCents ?? 0
    const discrepancyCashCents = cashTotals.discrepancyCashCents ?? 0
    const leakagePct = expectedCashCents > 0 ? Math.round((Math.abs(discrepancyCashCents) / expectedCashCents) * 1000) / 10 : 0
    const repeatPlatesCount = repeat.repeatPlatesCount ?? 0
    const uniquePlatesCount = totals.uniquePlatesCount ?? 0
    const repeatRatePct = uniquePlatesCount > 0 ? Math.round((repeatPlatesCount / uniquePlatesCount) * 1000) / 10 : 0

    res.json({
      range: { start, end, days: days.length },
      type: parsed.data.type ?? 'overview',
      group,
      summary: {
        totalTickets,
        totalRevenueCents,
        avgTicketCents,
        uniquePlatesCount,
      },
      financial: {
        expectedCashCents,
        declaredCashCents,
        discrepancyCashCents,
        leakagePct,
      },
      behavioral: {
        repeatPlatesCount,
        repeatRatePct,
        peakHours,
        preferredServices: serviceRows,
      },
      statusCounts: {
        pending: pendingDays,
        cashier_submitted: cashierSubmittedDays,
        confirmed: confirmedDays,
      },
      paymentBreakdown: paymentRows,
      series,
    })
  })

  app.get('/api/owner/day/:dayDate', requireRole('owner'), async (req, res) => {
    const schema = z.object({ dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' })

    const dayDate = parsed.data.dayDate
    const tickets = await query(
      `
        SELECT
          t.ticket_number AS "ticketNumber",
          t.day_date AS "dayDate",
          t.plate AS plate,
          t.vehicle_type_id AS "vehicleTypeId",
          t.vehicle_type_name AS "vehicleTypeName",
          t.service_type_id AS "serviceTypeId",
          t.service_type_name AS "serviceTypeName",
          t.base_price_cents AS "basePriceCents",
          t.discount_cents AS "discountCents",
          t.discount_reason AS "discountReason",
          t.override_note AS "overrideNote",
          t.price_cents AS "priceCents",
          t.price_overridden AS "priceOverridden",
          t.payment_method AS "paymentMethod",
          t.created_at AS "createdAt"
        FROM tickets t
        WHERE t.day_date = $1 AND t.voided_at IS NULL
        ORDER BY t.ticket_number DESC
      `,
      [dayDate],
    )

    const reconciliation = await query(
      `
        SELECT
          day_date AS "dayDate",
          tickets_count AS "ticketsCount",
          expected_revenue_cents AS "expectedRevenueCents",
          expected_cash_cents AS "expectedCashCents",
          declared_cash_cents AS "declaredCashCents",
          discrepancy_cash_cents AS "discrepancyCashCents",
          cashier_submitted_at AS "cashierSubmittedAt",
          owner_confirmed_at AS "ownerConfirmedAt",
          owner_note AS "ownerNote"
        FROM day_reconciliations
        WHERE day_date = $1
      `,
      [dayDate],
    )

    res.json({ dayDate, tickets: tickets.rows, reconciliation: reconciliation.rows[0] ?? null })
  })

  app.get('/api/owner/cash-audit/:dayDate', requireRole('owner'), async (req, res) => {
    const schema = z.object({ dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' })
    const dayDate = parsed.data.dayDate

    const rows = await query(
      `
        SELECT
          t.ticket_number AS "ticketNumber",
          t.plate AS plate,
          t.payment_method AS "paymentMethod",
          t.base_price_cents AS "basePriceCents",
          t.discount_cents AS "discountCents",
          t.discount_reason AS "discountReason",
          t.override_note AS "overrideNote",
          t.price_cents AS "priceCents",
          t.price_overridden AS "priceOverridden",
          t.voided_at AS "voidedAt",
          t.void_reason AS "voidReason",
          t.created_at AS "createdAt"
        FROM tickets t
        WHERE t.day_date = $1
        ORDER BY t.ticket_number ASC
      `,
      [dayDate],
    )

    const active = rows.rows.filter((r) => !r.voidedAt)
    let expectedRevenueCents = 0
    let expectedCashCents = 0
    for (const r of active) {
      expectedRevenueCents += r.priceCents
      if (r.paymentMethod === 'cash') expectedCashCents += r.priceCents
    }

    const ticketNumbers = rows.rows.map((r) => r.ticketNumber)
    const minTicket = ticketNumbers.length ? Math.min(...ticketNumbers) : null
    const maxTicket = ticketNumbers.length ? Math.max(...ticketNumbers) : null
    const set = new Set(ticketNumbers)
    const missing = []
    if (minTicket !== null && maxTicket !== null) {
      for (let n = minTicket; n <= maxTicket; n += 1) {
        if (!set.has(n)) missing.push(n)
        if (missing.length >= 200) break
      }
    }

    const flagged = rows.rows
      .filter((r) => r.priceOverridden || (r.discountCents ?? 0) > 0 || r.voidedAt)
      .slice(0, 200)

    res.json({
      dayDate,
      summary: {
        ticketsCount: active.length,
        expectedRevenueCents,
        expectedCashCents,
        minTicketNumber: minTicket,
        maxTicketNumber: maxTicket,
        missingTicketNumbers: missing,
        overridesCount: rows.rows.filter((r) => r.priceOverridden).length,
        discountsCount: rows.rows.filter((r) => (r.discountCents ?? 0) > 0).length,
        voidedCount: rows.rows.filter((r) => r.voidedAt).length,
      },
      flaggedTickets: flagged,
    })
  })
}
