import { z } from 'zod'
import { query } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { getLocalDayDate } from '../util.js'

async function computeDayTotals(dayDate) {
  const r = await query(
    `
      SELECT
        COUNT(*)::int AS "ticketsCount",
        COALESCE(SUM(price_cents), 0)::int AS "expectedRevenueCents",
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN price_cents ELSE 0 END), 0)::int AS "expectedCashCents"
      FROM tickets
      WHERE day_date = $1::date AND voided_at IS NULL
    `,
    [dayDate],
  )
  return r.rows[0] ?? { ticketsCount: 0, expectedRevenueCents: 0, expectedCashCents: 0 }
}

async function getReconciliation(dayDate) {
  const r = await query(
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
      WHERE day_date = $1::date
    `,
    [dayDate],
  )
  return r.rows[0] ?? null
}

export function attachCloseoutRoutes(app) {
  app.get('/api/closeout/today-summary', requireAuth, async (_req, res) => {
    const dayDate = getLocalDayDate()
    const totals = await computeDayTotals(dayDate)
    const rec = await getReconciliation(dayDate)

    res.json({
      dayDate,
      ...totals,
      reconciliation: rec ?? null,
    })
  })

  app.post('/api/closeout/cashier-submit', requireRole('cashier'), async (req, res) => {
    const dayDate = getLocalDayDate()
    const existing = await getReconciliation(dayDate)
    if (existing) return res.status(409).json({ error: 'already_submitted' })

    const schema = z.object({
      declaredCashCents: z.number().int().min(0).max(1_000_000_00),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const totals = await computeDayTotals(dayDate)
    const declaredCashCents = parsed.data.declaredCashCents
    const discrepancyCashCents = declaredCashCents - totals.expectedCashCents
    const now = new Date().toISOString()

    await query(
      `
      INSERT INTO day_reconciliations
        (day_date, tickets_count, expected_revenue_cents, expected_cash_cents, declared_cash_cents, discrepancy_cash_cents, cashier_submitted_at)
      VALUES
        ($1::date, $2, $3, $4, $5, $6, $7)
    `,
      [
        dayDate,
        totals.ticketsCount,
        totals.expectedRevenueCents,
        totals.expectedCashCents,
        declaredCashCents,
        discrepancyCashCents,
        now,
      ],
    )

    res.json({ ok: true, reconciliation: await getReconciliation(dayDate) })
  })

  app.post('/api/closeout/owner-confirm', requireRole('owner'), async (req, res) => {
    const schema = z.object({
      dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ownerNote: z.string().trim().max(500).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const existing = await getReconciliation(parsed.data.dayDate)
    if (!existing) return res.status(404).json({ error: 'not_submitted' })
    if (existing.ownerConfirmedAt) return res.status(409).json({ error: 'already_confirmed' })

    const now = new Date().toISOString()
    await query(
      `
      UPDATE day_reconciliations
      SET owner_confirmed_at = $1, owner_note = $2
      WHERE day_date = $3::date
    `,
      [now, parsed.data.ownerNote ?? null, parsed.data.dayDate],
    )

    res.json({ ok: true, reconciliation: await getReconciliation(parsed.data.dayDate) })
  })
}
