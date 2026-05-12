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
      overrideNote: z.string().trim().max(160).optional(),
      discountCents: z.number().int().min(0).max(1_000_000_00).optional(),
      discountReason: z.string().trim().max(160).optional(),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const { plate, vehicleTypeId, serviceTypeId, paymentMethod, priceCents, override } = parsed.data
    const pricing = getBoardPricing(vehicleTypeId, serviceTypeId)
    if (!pricing) return res.status(409).json({ error: 'missing_price' })
    const basePriceCents = pricing.priceCents

    const discountCents = parsed.data.discountCents ?? 0
    const discountReason = parsed.data.discountReason ? parsed.data.discountReason.trim() : null
    const overrideNote = parsed.data.overrideNote ? parsed.data.overrideNote.trim() : null

    if (override && discountCents > 0) return res.status(409).json({ error: 'discount_with_override' })
    if (!override && discountCents > basePriceCents) return res.status(409).json({ error: 'discount_too_large' })

    const expectedFinal = override ? priceCents : basePriceCents - discountCents
    if (expectedFinal < 0) return res.status(409).json({ error: 'invalid_price' })
    if (!override && priceCents !== expectedFinal) return res.status(409).json({ error: 'price_mismatch' })

    const now = new Date().toISOString()

    const insert = db.prepare(
      `
      INSERT INTO tickets
        (ticket_number, day_date, plate, vehicle_type_id, vehicle_type_name, service_type_id, service_type_name, base_price_cents, price_cents, price_overridden, discount_cents, discount_reason, override_note, payment_method, cashier_user_id, created_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )

    const ticketNumber = Number(
      db.transaction(() => {
        const temp = db.prepare('SELECT IFNULL(MAX(ticket_number), 0) + 1 AS next FROM tickets').get()
        const next = temp.next
        const info = insert.run(
          next,
          dayDate,
          plate.toUpperCase(),
          vehicleTypeId,
          pricing.vehicleTypeName,
          serviceTypeId,
          pricing.serviceTypeName,
          basePriceCents,
          expectedFinal,
          override ? 1 : 0,
          discountCents,
          discountReason,
          overrideNote,
          paymentMethod,
          req.user.id,
          now,
        )
        const ticketId = Number(info.lastInsertRowid)
        db.prepare('INSERT INTO ticket_audits (ticket_id, action, actor_user_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
          ticketId,
          'create',
          req.user.id,
          JSON.stringify({
            plate: plate.toUpperCase(),
            vehicleTypeId,
            serviceTypeId,
            basePriceCents,
            priceCents: expectedFinal,
            discountCents,
            discountReason,
            override,
            overrideNote,
            paymentMethod,
          }),
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
        discountCents,
        discountReason,
        overrideNote,
        priceCents: expectedFinal,
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
      .all(parsed.data.dayDate)

    res.json({ dayDate: parsed.data.dayDate, tickets: rows })
  })

  app.get('/api/tickets/:ticketNumber/receipt', requireAuth, (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber)
    if (!Number.isFinite(ticketNumber)) return res.status(400).json({ error: 'invalid_ticket_number' })

    const row = db
      .prepare(
        `
        SELECT
          t.ticket_number AS ticketNumber,
          t.day_date AS dayDate,
          t.plate AS plate,
          t.vehicle_type_name AS vehicleTypeName,
          t.service_type_name AS serviceTypeName,
          t.base_price_cents AS basePriceCents,
          t.discount_cents AS discountCents,
          t.discount_reason AS discountReason,
          t.override_note AS overrideNote,
          t.price_cents AS priceCents,
          t.price_overridden AS priceOverridden,
          t.payment_method AS paymentMethod,
          t.created_at AS createdAt,
          u.username AS cashierUsername,
          t.voided_at AS voidedAt,
          t.void_reason AS voidReason
        FROM tickets t
        JOIN users u ON u.id = t.cashier_user_id
        WHERE t.ticket_number = ?
      `,
      )
      .get(ticketNumber)
    if (!row) return res.status(404).json({ error: 'not_found' })

    res.json({
      ticket: {
        ...row,
        ticketLabel: formatTicketNumber(row.ticketNumber),
        printedAt: new Date().toISOString(),
      },
    })
  })

  app.post('/api/owner/tickets/:ticketNumber/void', requireRole('owner'), (req, res) => {
    const ticketNumber = Number(req.params.ticketNumber)
    if (!Number.isFinite(ticketNumber)) return res.status(400).json({ error: 'invalid_ticket_number' })
    const schema = z.object({ reason: z.string().trim().min(1).max(200) }).strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const t = db
      .prepare('SELECT id, day_date AS dayDate, voided_at AS voidedAt FROM tickets WHERE ticket_number = ?')
      .get(ticketNumber)
    if (!t) return res.status(404).json({ error: 'not_found' })
    if (t.voidedAt) return res.status(409).json({ error: 'already_voided' })

    const locked = db.prepare('SELECT 1 FROM day_reconciliations WHERE day_date = ?').get(t.dayDate)
    if (locked) return res.status(409).json({ error: 'day_locked' })

    const now = new Date().toISOString()
    db.transaction(() => {
      db.prepare('UPDATE tickets SET voided_at = ?, void_reason = ?, voided_by_user_id = ? WHERE id = ?').run(
        now,
        parsed.data.reason,
        req.user.id,
        t.id,
      )
      db.prepare('INSERT INTO ticket_audits (ticket_id, action, actor_user_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?)').run(
        t.id,
        'void',
        req.user.id,
        JSON.stringify({ ticketNumber, reason: parsed.data.reason }),
        now,
      )
    })()

    res.json({ ok: true })
  })
}
