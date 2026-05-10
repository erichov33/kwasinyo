import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { getLocalDayDate } from '../util.js'

function computeDayTotals(dayDate) {
  const rows = db
    .prepare(
      `
      SELECT payment_method AS paymentMethod, price_cents AS priceCents
      FROM tickets
      WHERE day_date = ?
    `,
    )
    .all(dayDate)

  let expectedRevenueCents = 0
  let expectedCashCents = 0
  for (const r of rows) {
    expectedRevenueCents += r.priceCents
    if (r.paymentMethod === 'cash') expectedCashCents += r.priceCents
  }

  const ticketsCount = rows.length
  return { ticketsCount, expectedRevenueCents, expectedCashCents }
}

function getReconciliation(dayDate) {
  return db
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
}

export function attachCloseoutRoutes(app) {
  app.get('/api/closeout/today-summary', requireAuth, (req, res) => {
    const dayDate = getLocalDayDate()
    const totals = computeDayTotals(dayDate)
    const rec = getReconciliation(dayDate)

    res.json({
      dayDate,
      ...totals,
      reconciliation: rec ?? null,
    })
  })

  app.post('/api/closeout/cashier-submit', requireRole('cashier'), (req, res) => {
    const dayDate = getLocalDayDate()
    const existing = getReconciliation(dayDate)
    if (existing) return res.status(409).json({ error: 'already_submitted' })

    const schema = z.object({
      declaredCashCents: z.number().int().min(0).max(1_000_000_00),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const totals = computeDayTotals(dayDate)
    const declaredCashCents = parsed.data.declaredCashCents
    const discrepancyCashCents = declaredCashCents - totals.expectedCashCents
    const now = new Date().toISOString()

    db.prepare(
      `
      INSERT INTO day_reconciliations
        (day_date, tickets_count, expected_revenue_cents, expected_cash_cents, declared_cash_cents, discrepancy_cash_cents, cashier_submitted_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      dayDate,
      totals.ticketsCount,
      totals.expectedRevenueCents,
      totals.expectedCashCents,
      declaredCashCents,
      discrepancyCashCents,
      now,
    )

    res.json({ ok: true, reconciliation: getReconciliation(dayDate) })
  })

  app.post('/api/closeout/owner-confirm', requireRole('owner'), (req, res) => {
    const schema = z.object({
      dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ownerNote: z.string().trim().max(500).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const existing = getReconciliation(parsed.data.dayDate)
    if (!existing) return res.status(404).json({ error: 'not_submitted' })
    if (existing.ownerConfirmedAt) return res.status(409).json({ error: 'already_confirmed' })

    const now = new Date().toISOString()
    db.prepare(
      `
      UPDATE day_reconciliations
      SET owner_confirmed_at = ?, owner_note = ?
      WHERE day_date = ?
    `,
    ).run(now, parsed.data.ownerNote ?? null, parsed.data.dayDate)

    res.json({ ok: true, reconciliation: getReconciliation(parsed.data.dayDate) })
  })
}

