import { z } from 'zod'
import { db } from '../db.js'
import { requireRole } from '../auth.js'
import { getLocalDayDate } from '../util.js'

function normalizePlate(s) {
  return s.trim().toUpperCase()
}

function addDays(dayDate, deltaDays) {
  const [y, m, d] = dayDate.split('-').map((x) => Number(x))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return getLocalDayDate(dt)
}

function getCustomerPlateList(customerId) {
  return db
    .prepare('SELECT plate FROM customer_plates WHERE customer_id = ? ORDER BY plate ASC')
    .all(customerId)
    .map((r) => r.plate)
}

function buildInClause(values) {
  if (values.length === 0) return { clause: '(NULL)', params: [] }
  return { clause: `(${values.map(() => '?').join(',')})`, params: values }
}

function computeCustomerStats(customerId) {
  const plates = getCustomerPlateList(customerId)
  if (plates.length === 0) {
    return {
      totalVisits: 0,
      lastVisitAt: null,
      visitsLast30: 0,
      visitsLast90: 0,
      avgRevenueCents: 0,
    }
  }
  const { clause, params } = buildInClause(plates)
  const today = getLocalDayDate()
  const day30 = addDays(today, -29)
  const day90 = addDays(today, -89)

  const totals = db
    .prepare(
      `
      SELECT COUNT(*) AS totalVisits, IFNULL(SUM(price_cents), 0) AS totalRevenueCents, MAX(created_at) AS lastVisitAt
      FROM tickets
      WHERE plate IN ${clause} AND voided_at IS NULL
    `,
    )
    .get(...params)

  const last30 = db
    .prepare(
      `
      SELECT COUNT(*) AS visitsLast30
      FROM tickets
      WHERE plate IN ${clause} AND day_date >= ? AND voided_at IS NULL
    `,
    )
    .get(...params, day30)

  const last90 = db
    .prepare(
      `
      SELECT COUNT(*) AS visitsLast90
      FROM tickets
      WHERE plate IN ${clause} AND day_date >= ? AND voided_at IS NULL
    `,
    )
    .get(...params, day90)

  const totalVisits = totals.totalVisits ?? 0
  const totalRevenueCents = totals.totalRevenueCents ?? 0

  return {
    totalVisits,
    lastVisitAt: totals.lastVisitAt ?? null,
    visitsLast30: last30.visitsLast30 ?? 0,
    visitsLast90: last90.visitsLast90 ?? 0,
    avgRevenueCents: totalVisits > 0 ? Math.round(totalRevenueCents / totalVisits) : 0,
  }
}

function getLoyalty(customerId, totalVisits) {
  const earned = Math.floor((totalVisits ?? 0) / 10)
  const grantedRow = db
    .prepare("SELECT COUNT(*) AS c FROM loyalty_rewards WHERE customer_id = ? AND type = 'free_wash'")
    .get(customerId)
  const redeemedRow = db
    .prepare("SELECT COUNT(*) AS c FROM loyalty_rewards WHERE customer_id = ? AND type = 'free_wash' AND redeemed_at IS NOT NULL")
    .get(customerId)
  const granted = grantedRow.c ?? 0
  const redeemed = redeemedRow.c ?? 0
  const available = Math.max(0, granted - redeemed)
  return { earnedFreeWashes: earned, grantedFreeWashes: granted, redeemedFreeWashes: redeemed, availableFreeWashes: available }
}

export function attachCustomerRoutes(app) {
  app.get('/api/owner/customers', requireRole('owner'), (req, res) => {
    const schema = z
      .object({
        q: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).max(5000).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' })

    const q = parsed.data.q ? parsed.data.q.trim() : ''
    const limit = parsed.data.limit ?? 50
    const offset = parsed.data.offset ?? 0

    const like = `%${q.replaceAll('%', '').replaceAll('_', '')}%`

    const rows = q
      ? db
          .prepare(
            `
            SELECT DISTINCT
              c.id AS id,
              c.name AS name,
              c.phone AS phone,
              c.notes AS notes,
              c.active AS active,
              c.created_at AS createdAt,
              c.updated_at AS updatedAt
            FROM customers c
            LEFT JOIN customer_plates cp ON cp.customer_id = c.id
            WHERE c.active = 1 AND (
              c.name LIKE ? OR c.phone LIKE ? OR cp.plate LIKE ?
            )
            ORDER BY c.id DESC
            LIMIT ? OFFSET ?
          `,
          )
          .all(like, like, like.toUpperCase(), limit, offset)
      : db
          .prepare(
            `
            SELECT
              c.id AS id,
              c.name AS name,
              c.phone AS phone,
              c.notes AS notes,
              c.active AS active,
              c.created_at AS createdAt,
              c.updated_at AS updatedAt
            FROM customers c
            WHERE c.active = 1
            ORDER BY c.id DESC
            LIMIT ? OFFSET ?
          `,
          )
          .all(limit, offset)

    const data = rows.map((c) => {
      const plates = getCustomerPlateList(c.id)
      const stats = computeCustomerStats(c.id)
      return { ...c, plates, stats }
    })

    res.json({ customers: data })
  })

  app.post('/api/owner/customers', requireRole('owner'), (req, res) => {
    const schema = z
      .object({
        name: z.string().trim().max(60).optional(),
        phone: z.string().trim().max(32).optional(),
        notes: z.string().trim().max(500).optional(),
        plates: z.array(z.string().trim().min(1).max(16)).max(10).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const name = parsed.data.name ?? ''
    const phone = parsed.data.phone ?? null
    const notes = parsed.data.notes ?? null
    const plates = (parsed.data.plates ?? []).map(normalizePlate).filter(Boolean)

    if (!name && !phone && plates.length === 0) return res.status(400).json({ error: 'missing_details' })

    const now = new Date().toISOString()

    try {
      const customerId = Number(
        db.transaction(() => {
          const info = db
            .prepare('INSERT INTO customers (name, phone, notes, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
            .run(name, phone, notes, now, now)
          const id = info.lastInsertRowid
          const insertPlate = db.prepare('INSERT INTO customer_plates (customer_id, plate, created_at) VALUES (?, ?, ?)')
          for (const p of plates) insertPlate.run(id, p, now)
          return id
        })(),
      )

      res.json({ ok: true, id: customerId })
    } catch {
      res.status(409).json({ error: 'plate_conflict' })
    }
  })

  app.get('/api/owner/customers/:id', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const customer = db
      .prepare(
        `
        SELECT id, name, phone, notes, active, created_at AS createdAt, updated_at AS updatedAt
        FROM customers
        WHERE id = ?
      `,
      )
      .get(id)
    if (!customer) return res.status(404).json({ error: 'not_found' })

    const plates = getCustomerPlateList(id)
    const stats = computeCustomerStats(id)
    const loyalty = getLoyalty(id, stats.totalVisits)
    const rewards = db
      .prepare(
        `
        SELECT id, type, note, granted_at AS grantedAt, redeemed_at AS redeemedAt
        FROM loyalty_rewards
        WHERE customer_id = ?
        ORDER BY granted_at DESC, id DESC
        LIMIT 200
      `,
      )
      .all(id)

    res.json({ customer, plates, stats, loyalty, rewards })
  })

  app.patch('/api/owner/customers/:id', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const schema = z
      .object({
        name: z.string().trim().max(60).optional(),
        phone: z.string().trim().max(32).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
        active: z.number().int().min(0).max(1).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const exists = db.prepare('SELECT id FROM customers WHERE id = ?').get(id)
    if (!exists) return res.status(404).json({ error: 'not_found' })

    const now = new Date().toISOString()
    db.transaction(() => {
      if (parsed.data.name !== undefined) db.prepare('UPDATE customers SET name = ?, updated_at = ? WHERE id = ?').run(parsed.data.name, now, id)
      if (parsed.data.phone !== undefined)
        db.prepare('UPDATE customers SET phone = ?, updated_at = ? WHERE id = ?').run(parsed.data.phone, now, id)
      if (parsed.data.notes !== undefined)
        db.prepare('UPDATE customers SET notes = ?, updated_at = ? WHERE id = ?').run(parsed.data.notes, now, id)
      if (parsed.data.active !== undefined)
        db.prepare('UPDATE customers SET active = ?, updated_at = ? WHERE id = ?').run(parsed.data.active, now, id)
      if (
        parsed.data.name === undefined &&
        parsed.data.phone === undefined &&
        parsed.data.notes === undefined &&
        parsed.data.active === undefined
      ) {
        db.prepare('UPDATE customers SET updated_at = ? WHERE id = ?').run(now, id)
      }
    })()

    res.json({ ok: true })
  })

  app.post('/api/owner/customers/:id/plates', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const schema = z.object({ plate: z.string().trim().min(1).max(16) }).strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const exists = db.prepare('SELECT id FROM customers WHERE id = ? AND active = 1').get(id)
    if (!exists) return res.status(404).json({ error: 'not_found' })

    const plate = normalizePlate(parsed.data.plate)
    const now = new Date().toISOString()

    try {
      db.prepare('INSERT INTO customer_plates (customer_id, plate, created_at) VALUES (?, ?, ?)').run(id, plate, now)
      res.json({ ok: true })
    } catch {
      res.status(409).json({ error: 'plate_conflict' })
    }
  })

  app.delete('/api/owner/customers/:id/plates/:plate', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const plate = normalizePlate(req.params.plate ?? '')
    if (!plate) return res.status(400).json({ error: 'invalid_plate' })

    const info = db.prepare('DELETE FROM customer_plates WHERE customer_id = ? AND plate = ?').run(id, plate)
    if (info.changes === 0) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  })

  app.get('/api/owner/customers/:id/visits', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const customer = db.prepare('SELECT id, name FROM customers WHERE id = ? AND active = 1').get(id)
    if (!customer) return res.status(404).json({ error: 'not_found' })

    const plates = getCustomerPlateList(id)
    if (plates.length === 0) return res.json({ visits: [] })
    const { clause, params } = buildInClause(plates)

    const rows = db
      .prepare(
        `
        SELECT
          ticket_number AS ticketNumber,
          day_date AS dayDate,
          plate,
          vehicle_type_name AS vehicleTypeName,
          service_type_name AS serviceTypeName,
          price_cents AS priceCents,
          payment_method AS paymentMethod,
          created_at AS createdAt
        FROM tickets
        WHERE plate IN ${clause} AND voided_at IS NULL
        ORDER BY created_at DESC
        LIMIT 300
      `,
      )
      .all(...params)

    res.json({ visits: rows })
  })

  app.get('/api/owner/customers/high-frequency', requireRole('owner'), (req, res) => {
    const schema = z
      .object({
        days: z.coerce.number().int().min(7).max(365).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' })

    const daysBack = parsed.data.days ?? 30
    const limit = parsed.data.limit ?? 20
    const startDay = addDays(getLocalDayDate(), -(daysBack - 1))

    const rows = db
      .prepare(
        `
        SELECT
          c.id AS customerId,
          c.name AS name,
          c.phone AS phone,
          COUNT(*) AS visits,
          IFNULL(SUM(t.price_cents), 0) AS revenueCents,
          MAX(t.created_at) AS lastVisitAt
        FROM tickets t
        JOIN customer_plates cp ON cp.plate = t.plate
        JOIN customers c ON c.id = cp.customer_id
        WHERE c.active = 1 AND t.day_date >= ? AND t.voided_at IS NULL
        GROUP BY c.id
        ORDER BY visits DESC, revenueCents DESC
        LIMIT ?
      `,
      )
      .all(startDay, limit)

    res.json({ startDay, days: daysBack, rows })
  })

  app.post('/api/owner/customers/:id/rewards/free-wash', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const schema = z.object({ note: z.string().trim().max(200).optional() }).strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const exists = db.prepare('SELECT id FROM customers WHERE id = ? AND active = 1').get(id)
    if (!exists) return res.status(404).json({ error: 'not_found' })

    const now = new Date().toISOString()
    db.prepare("INSERT INTO loyalty_rewards (customer_id, type, note, granted_at) VALUES (?, 'free_wash', ?, ?)").run(
      id,
      parsed.data.note ?? null,
      now,
    )
    res.json({ ok: true })
  })

  app.post('/api/owner/customers/:id/rewards/:rewardId/redeem', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    const rewardId = Number(req.params.rewardId)
    if (!Number.isFinite(id) || !Number.isFinite(rewardId)) return res.status(400).json({ error: 'invalid_id' })

    const row = db
      .prepare("SELECT id, redeemed_at AS redeemedAt FROM loyalty_rewards WHERE id = ? AND customer_id = ? AND type = 'free_wash'")
      .get(rewardId, id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (row.redeemedAt) return res.status(409).json({ error: 'already_redeemed' })

    const now = new Date().toISOString()
    db.prepare('UPDATE loyalty_rewards SET redeemed_at = ? WHERE id = ?').run(now, rewardId)
    res.json({ ok: true })
  })
}
