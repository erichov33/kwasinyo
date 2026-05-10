import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { getLocalDayDate } from '../util.js'

function getBoardPricing(vehicleTypeId, serviceTypeId) {
  const row = db
    .prepare(
      `
      SELECT
        pm.price_cents AS priceCents,
        vt.name AS vehicleTypeName,
        st.name AS serviceTypeName
      FROM price_matrix pm
      JOIN vehicle_types vt ON vt.id = pm.vehicle_type_id
      JOIN service_types st ON st.id = pm.service_type_id
      WHERE pm.vehicle_type_id = ? AND pm.service_type_id = ?
        AND vt.active = 1 AND st.active = 1
    `,
    )
    .get(vehicleTypeId, serviceTypeId)
  if (!row) return null
  return row
}

function formatTicketNumber(n) {
  return `#${String(n).padStart(4, '0')}`
}

export function attachTicketRoutes(app) {
  app.post('/api/tickets', requireRole('cashier'), (req, res) => {
    const dayDate = getLocalDayDate()
    const locked = db.prepare('SELECT 1 FROM day_reconciliations WHERE day_date = ?').get(dayDate)
    if (locked) return res.status(409).json({ error: 'day_locked' })

    const schema = z.object({
      plate: z.string().trim().min(1).max(16),
      vehicleTypeId: z.number().int().positive(),
      serviceTypeId: z.number().int().positive(),
      paymentMethod: z.enum(['cash', 'card', 'other']).default('cash'),
      priceCents: z.number().int().min(0).max(1_000_000_00),
      override: z.boolean().default(false),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const { plate, vehicleTypeId, serviceTypeId, paymentMethod, priceCents, override } = parsed.data
    const pricing = getBoardPricing(vehicleTypeId, serviceTypeId)
    if (!pricing) return res.status(409).json({ error: 'missing_price' })
    const basePriceCents = pricing.priceCents

    if (!override && priceCents !== basePriceCents) {
      return res.status(409).json({ error: 'price_mismatch' })
    }

    const now = new Date().toISOString()

    const insert = db.prepare(
      `
      INSERT INTO tickets
        (ticket_number, day_date, plate, vehicle_type_id, vehicle_type_name, service_type_id, service_type_name, base_price_cents, price_cents, price_overridden, payment_method, cashier_user_id, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )

    const ticketNumber = Number(
      db.transaction(() => {
        const temp = db.prepare('SELECT IFNULL(MAX(ticket_number), 0) + 1 AS next FROM tickets').get()
        const next = temp.next
        insert.run(
          next,
          dayDate,
          plate.toUpperCase(),
          vehicleTypeId,
          pricing.vehicleTypeName,
          serviceTypeId,
          pricing.serviceTypeName,
          basePriceCents,
          priceCents,
          override ? 1 : 0,
          paymentMethod,
          req.user.id,
          now,
        )
        return next
      })(),
    )

    res.json({
      ok: true,
      ticket: {
        ticketNumber,
        ticketLabel: formatTicketNumber(ticketNumber),
        dayDate,
        plate: plate.toUpperCase(),
        vehicleTypeId,
        serviceTypeId,
        basePriceCents,
        priceCents,
        priceOverridden: override,
        paymentMethod,
        createdAt: now,
      },
    })
  })

  app.get('/api/tickets/today', requireAuth, (req, res) => {
    const dayDate = getLocalDayDate()
    const rows = db
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

    res.json({ dayDate, tickets: rows })
  })

  app.get('/api/tickets/by-date/:dayDate', requireRole('owner'), (req, res) => {
    const schema = z.object({ dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' })

    const rows = db
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
      .all(parsed.data.dayDate)

    res.json({ dayDate: parsed.data.dayDate, tickets: rows })
  })
}
