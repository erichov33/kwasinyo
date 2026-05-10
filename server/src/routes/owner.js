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

function getTicketTotalsByDay(dayDates) {
  if (dayDates.length === 0) return new Map()
  const placeholders = dayDates.map(() => '?').join(',')
  const rows = db
    .prepare(
      `
      SELECT day_date AS dayDate, COUNT(*) AS ticketsCount, SUM(price_cents) AS expectedRevenueCents
      FROM tickets
      WHERE day_date IN (${placeholders})
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
        WHERE day_date = ?
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
          t.price_cents AS priceCents,
          t.price_overridden AS priceOverridden,
          t.payment_method AS paymentMethod,
          t.created_at AS createdAt
        FROM tickets t
        WHERE t.day_date = ?
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
}
