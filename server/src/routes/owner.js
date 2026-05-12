import { z } from 'zod'
import { db } from '../db.js'
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

function getTicketTotalsByDay(dayDates) {
  if (dayDates.length === 0) return new Map()
  const placeholders = dayDates.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
      SELECT day_date AS dayDate, COUNT(*) AS ticketsCount, SUM(price_cents) AS expectedRevenueCents
      FROM tickets
      WHERE day_date IN (${placeholders}) AND voided_at IS NULL
      GROUP BY day_date
    `,
    )
    .all(...dayDates)
  const map = new Map()
  for (const r of rows) {
    map.set(r.dayDate, {
      ticketsCount: r.ticketsCount ?? 0,
      expectedRevenueCents: r.expectedRevenueCents ?? 0,
    })
  }
  return map
}

function getReconciliationsByDay(dayDates) {
  if (dayDates.length === 0) return new Map()
  const placeholders = dayDates.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
      SELECT
        day_date AS dayDate,
        tickets_count AS ticketsCount,
        expected_revenue_cents AS expectedRevenueCents,
        expected_cash_cents AS expectedCashCents,
        declared_cash_cents AS declaredCashCents,
        discrepancy_cash_cents AS discrepancyCashCents,
        cashier_submitted_at AS cashierSubmittedAt,
        owner_confirmed_at AS ownerConfirmedAt
      FROM day_reconciliations
      WHERE day_date IN (${placeholders})
    `,
    )
    .all(...dayDates)
  const map = new Map()
  for (const r of rows) map.set(r.dayDate, r)
  return map
}

function getLastConfirmedDiscrepancy() {
  const row = db
    .prepare(
      `
      SELECT day_date AS dayDate, discrepancy_cash_cents AS discrepancyCashCents
      FROM day_reconciliations
      WHERE owner_confirmed_at IS NOT NULL
      ORDER BY day_date DESC
      LIMIT 1
    `,
    )
    .get()
  if (!row) return null
  return row
}

export function attachOwnerRoutes(app) {
  app.get('/api/owner/today-snapshot', requireRole('owner'), (_req, res) => {
    const dayDate = getLocalDayDate()
    const totals = db
      .prepare(
        `
        SELECT COUNT(*) AS ticketsCount, IFNULL(SUM(price_cents), 0) AS expectedRevenueCents
        FROM tickets
        WHERE day_date = ? AND voided_at IS NULL
      `,
      )
      .get(dayDate)

    const rec = db
      .prepare('SELECT cashier_submitted_at AS cashierSubmittedAt, owner_confirmed_at AS ownerConfirmedAt, discrepancy_cash_cents AS discrepancyCashCents FROM day_reconciliations WHERE day_date = ?')
      .get(dayDate)

    let reconciliationStatus = 'pending'
    if (rec?.cashierSubmittedAt && !rec?.ownerConfirmedAt) reconciliationStatus = 'cashier_submitted'
    if (rec?.ownerConfirmedAt) reconciliationStatus = 'confirmed'

    const last = getLastConfirmedDiscrepancy()

    res.json({
      dayDate,
      carsWashedToday: totals.ticketsCount ?? 0,
      expectedRevenueTodayCents: totals.expectedRevenueCents ?? 0,
      reconciliationStatus,
      todayDiscrepancyCashCents: rec?.discrepancyCashCents ?? null,
      lastConfirmedDiscrepancy: last,
    })
  })

  app.get('/api/owner/history', requireRole('owner'), (req, res) => {
    const daysParam = Number(req.query.days)
    const days = clampInt(daysParam, { min: 7, max: 90 })
    const dayDates = listLastDays(days)
    const ticketTotals = getTicketTotalsByDay(dayDates)
    const recs = getReconciliationsByDay(dayDates)

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

  app.get('/api/owner/reports', requireRole('owner'), (req, res) => {
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

    const placeholders = days.map(() => '?').join(',')
    const group = parsed.data.group ?? 'day'

    const totals = db
      .prepare(
        `
        SELECT
          COUNT(*) AS ticketsCount,
          IFNULL(SUM(price_cents), 0) AS totalRevenueCents,
          COUNT(DISTINCT plate) AS uniquePlatesCount
        FROM tickets
        WHERE day_date IN (${placeholders}) AND voided_at IS NULL
      `,
      )
      .get(...days)

    const cashTotals = db
      .prepare(
        `
        SELECT
          IFNULL(SUM(expected_cash_cents), 0) AS expectedCashCents,
          IFNULL(SUM(declared_cash_cents), 0) AS declaredCashCents,
          IFNULL(SUM(discrepancy_cash_cents), 0) AS discrepancyCashCents
        FROM day_reconciliations
        WHERE day_date IN (${placeholders})
      `,
      )
      .get(...days)

    const repeat = db
      .prepare(
        `
        SELECT COUNT(*) AS repeatPlatesCount
        FROM (
          SELECT plate
          FROM tickets
          WHERE day_date IN (${placeholders}) AND voided_at IS NULL
          GROUP BY plate
          HAVING COUNT(*) >= 2
        ) rp
      `,
      )
      .get(...days)

    const serviceRows = db
      .prepare(
        `
        SELECT service_type_name AS serviceTypeName, COUNT(*) AS ticketsCount, IFNULL(SUM(price_cents), 0) AS revenueCents
        FROM tickets
        WHERE day_date IN (${placeholders}) AND voided_at IS NULL
        GROUP BY service_type_name
        ORDER BY revenueCents DESC, ticketsCount DESC
      `,
      )
      .all(...days)

    const hourRows = db
      .prepare(
        `
        SELECT substr(created_at, 12, 2) AS hour, COUNT(*) AS ticketsCount, IFNULL(SUM(price_cents), 0) AS revenueCents
        FROM tickets
        WHERE day_date IN (${placeholders}) AND voided_at IS NULL
        GROUP BY hour
        ORDER BY hour ASC
      `,
      )
      .all(...days)
    const hourMap = new Map(hourRows.map((r) => [Number(r.hour), r]))
    const peakHours = Array.from({ length: 24 }).map((_, h) => {
      const r = hourMap.get(h) ?? null
      return {
        hour: h,
        ticketsCount: r?.ticketsCount ?? 0,
        revenueCents: r?.revenueCents ?? 0,
      }
    })

    const paymentRows = db
      .prepare(
        `
        SELECT payment_method AS paymentMethod, COUNT(*) AS ticketsCount, IFNULL(SUM(price_cents), 0) AS revenueCents
        FROM tickets
        WHERE day_date IN (${placeholders}) AND voided_at IS NULL
        GROUP BY payment_method
      `,
      )
      .all(...days)

    const recRows = db
      .prepare(
        `
        SELECT day_date AS dayDate, discrepancy_cash_cents AS discrepancyCashCents, cashier_submitted_at AS cashierSubmittedAt, owner_confirmed_at AS ownerConfirmedAt
        FROM day_reconciliations
        WHERE day_date IN (${placeholders})
      `,
      )
      .all(...days)
    const recMap = new Map(recRows.map((r) => [r.dayDate, r]))

    let pendingDays = 0
    let cashierSubmittedDays = 0
    let confirmedDays = 0

    const makeDaySeries = () => {
      const byDay = db
        .prepare(
          `
          SELECT day_date AS key, day_date AS label, COUNT(*) AS ticketsCount, IFNULL(SUM(price_cents), 0) AS revenueCents
          FROM tickets
          WHERE day_date IN (${placeholders}) AND voided_at IS NULL
          GROUP BY day_date
        `,
        )
        .all(...days)
      const byDayMap = new Map(byDay.map((r) => [r.key, r]))

      return days.map((d) => {
        const t = byDayMap.get(d) ?? { ticketsCount: 0, revenueCents: 0 }
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
    }

    const makeWeekSeries = () => {
      const tickets = db
        .prepare(
          `
          SELECT
            date(day_date, 'weekday 0', '-6 days') AS weekStart,
            COUNT(*) AS ticketsCount,
            IFNULL(SUM(price_cents), 0) AS revenueCents
          FROM tickets
          WHERE day_date IN (${placeholders}) AND voided_at IS NULL
          GROUP BY weekStart
          ORDER BY weekStart ASC
        `,
        )
        .all(...days)
      const ticketMap = new Map(tickets.map((r) => [r.weekStart, r]))

      const recs = db
        .prepare(
          `
          SELECT
            date(day_date, 'weekday 0', '-6 days') AS weekStart,
            IFNULL(SUM(discrepancy_cash_cents), 0) AS discrepancyCashCents,
            COUNT(*) AS submittedDays,
            SUM(CASE WHEN owner_confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmedDays
          FROM day_reconciliations
          WHERE day_date IN (${placeholders})
          GROUP BY weekStart
        `,
        )
        .all(...days)
      const recMap2 = new Map(recs.map((r) => [r.weekStart, r]))

      const weekStarts = [...new Set(days.map((d) => db.prepare("SELECT date(?, 'weekday 0', '-6 days') AS w").get(d).w))].sort()
      return weekStarts.map((ws) => {
        const t = ticketMap.get(ws) ?? { ticketsCount: 0, revenueCents: 0 }
        const r = recMap2.get(ws) ?? null
        const start2 = ws
        const end2 = addDays(ws, 6)
        let status = 'pending'
        if (r?.submittedDays > 0) status = 'cashier_submitted'
        if (r?.confirmedDays === r?.submittedDays && r?.submittedDays > 0) status = 'confirmed'
        if (status === 'pending') pendingDays += 1
        if (status === 'cashier_submitted') cashierSubmittedDays += 1
        if (status === 'confirmed') confirmedDays += 1
        return {
          key: ws,
          label: ws,
          start: start2,
          end: end2,
          ticketsCount: t.ticketsCount ?? 0,
          revenueCents: t.revenueCents ?? 0,
          discrepancyCashCents: r ? r.discrepancyCashCents : null,
          status,
        }
      })
    }

    const makeMonthSeries = () => {
      const tickets = db
        .prepare(
          `
          SELECT
            substr(day_date, 1, 7) AS ym,
            COUNT(*) AS ticketsCount,
            IFNULL(SUM(price_cents), 0) AS revenueCents
          FROM tickets
          WHERE day_date IN (${placeholders}) AND voided_at IS NULL
          GROUP BY ym
          ORDER BY ym ASC
        `,
        )
        .all(...days)
      const ticketMap = new Map(tickets.map((r) => [r.ym, r]))

      const recs = db
        .prepare(
          `
          SELECT
            substr(day_date, 1, 7) AS ym,
            IFNULL(SUM(discrepancy_cash_cents), 0) AS discrepancyCashCents,
            COUNT(*) AS submittedDays,
            SUM(CASE WHEN owner_confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmedDays
          FROM day_reconciliations
          WHERE day_date IN (${placeholders})
          GROUP BY ym
        `,
        )
        .all(...days)
      const recMap2 = new Map(recs.map((r) => [r.ym, r]))

      const yms = [...new Set(days.map((d) => d.slice(0, 7)))].sort()
      return yms.map((ym) => {
        const t = ticketMap.get(ym) ?? { ticketsCount: 0, revenueCents: 0 }
        const r = recMap2.get(ym) ?? null
        const start2 = `${ym}-01`
        let end2 = `${ym}-28`
        for (let i = 31; i >= 28; i -= 1) {
          const cand = `${ym}-${String(i).padStart(2, '0')}`
          if (cand >= start && cand <= end) {
            end2 = cand
            break
          }
        }
        let status = 'pending'
        if (r?.submittedDays > 0) status = 'cashier_submitted'
        if (r?.confirmedDays === r?.submittedDays && r?.submittedDays > 0) status = 'confirmed'
        if (status === 'pending') pendingDays += 1
        if (status === 'cashier_submitted') cashierSubmittedDays += 1
        if (status === 'confirmed') confirmedDays += 1
        return {
          key: ym,
          label: ym,
          start: start2,
          end: end2,
          ticketsCount: t.ticketsCount ?? 0,
          revenueCents: t.revenueCents ?? 0,
          discrepancyCashCents: r ? r.discrepancyCashCents : null,
          status,
        }
      })
    }

    const series =
      group === 'week' ? makeWeekSeries() : group === 'month' ? makeMonthSeries() : makeDaySeries()

    const totalTickets = totals.ticketsCount ?? 0
    const totalRevenueCents = totals.totalRevenueCents ?? 0
    const avgTicketCents = totalTickets > 0 ? Math.round(totalRevenueCents / totalTickets) : 0
    const expectedCashCents = cashTotals.expectedCashCents ?? 0
    const declaredCashCents = cashTotals.declaredCashCents ?? 0
    const discrepancyCashCents = cashTotals.discrepancyCashCents ?? 0
    const leakagePct = expectedCashCents > 0 ? (discrepancyCashCents / expectedCashCents) * 100 : 0
    const repeatPlatesCount = repeat.repeatPlatesCount ?? 0
    const uniquePlatesCount = totals.uniquePlatesCount ?? 0
    const repeatRatePct = uniquePlatesCount > 0 ? (repeatPlatesCount / uniquePlatesCount) * 100 : 0

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

  app.get('/api/owner/day/:dayDate', requireRole('owner'), (req, res) => {
    const schema = z.object({ dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' })

    const dayDate = parsed.data.dayDate
    const tickets = db
      .prepare(
        `
        SELECT
          t.ticket_number AS ticketNumber,
          t.day_date AS dayDate,
          t.plate AS plate,
          t.vehicle_type_id AS vehicleTypeId,
          t.vehicle_type_name AS vehicleTypeName,
          t.service_type_id AS serviceTypeId,
          t.service_type_name AS serviceTypeName,
          t.base_price_cents AS basePriceCents,
          t.discount_cents AS discountCents,
          t.discount_reason AS discountReason,
          t.override_note AS overrideNote,
          t.price_cents AS priceCents,
          t.price_overridden AS priceOverridden,
          t.payment_method AS paymentMethod,
          t.created_at AS createdAt
        FROM tickets t
        WHERE t.day_date = ? AND t.voided_at IS NULL
        ORDER BY t.ticket_number DESC
      `,
      )
      .all(dayDate)

    const reconciliation = db
      .prepare(
        `
        SELECT
          day_date AS dayDate,
          tickets_count AS ticketsCount,
          expected_revenue_cents AS expectedRevenueCents,
          expected_cash_cents AS expectedCashCents,
          declared_cash_cents AS declaredCashCents,
          discrepancy_cash_cents AS discrepancyCashCents,
          cashier_submitted_at AS cashierSubmittedAt,
          owner_confirmed_at AS ownerConfirmedAt,
          owner_note AS ownerNote
        FROM day_reconciliations
        WHERE day_date = ?
      `,
      )
      .get(dayDate)

    res.json({ dayDate, tickets, reconciliation: reconciliation ?? null })
  })

  app.get('/api/owner/cash-audit/:dayDate', requireRole('owner'), (req, res) => {
    const schema = z.object({ dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' })
    const dayDate = parsed.data.dayDate

    const rows = db
      .prepare(
        `
        SELECT
          t.ticket_number AS ticketNumber,
          t.plate AS plate,
          t.payment_method AS paymentMethod,
          t.base_price_cents AS basePriceCents,
          t.discount_cents AS discountCents,
          t.discount_reason AS discountReason,
          t.override_note AS overrideNote,
          t.price_cents AS priceCents,
          t.price_overridden AS priceOverridden,
          t.voided_at AS voidedAt,
          t.void_reason AS voidReason,
          t.created_at AS createdAt
        FROM tickets t
        WHERE t.day_date = ?
        ORDER BY t.ticket_number ASC
      `,
      )
      .all(dayDate)

    const active = rows.filter((r) => !r.voidedAt)
    let expectedRevenueCents = 0
    let expectedCashCents = 0
    for (const r of active) {
      expectedRevenueCents += r.priceCents
      if (r.paymentMethod === 'cash') expectedCashCents += r.priceCents
    }

    const ticketNumbers = rows.map((r) => r.ticketNumber)
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

    const flagged = rows
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
        overridesCount: rows.filter((r) => r.priceOverridden).length,
        discountsCount: rows.filter((r) => (r.discountCents ?? 0) > 0).length,
        voidedCount: rows.filter((r) => r.voidedAt).length,
      },
      flaggedTickets: flagged,
    })
  })
}
