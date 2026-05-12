import { z } from 'zod'
import { query, withTx } from '../db.js'
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

async function getCustomerPlateList(customerId) {
  const r = await query('SELECT plate FROM customer_plates WHERE customer_id = $1 ORDER BY plate ASC', [customerId])
  return r.rows.map((x) => x.plate)
}

function buildInClause(values, startIndex) {
  if (values.length === 0) return { clause: '(NULL)', params: [] }
  const clause = `(${values.map((_, i) => `$${startIndex + i}`).join(',')})`
  return { clause, params: values }
}

async function computeCustomerStats(customerId) {
  const plates = await getCustomerPlateList(customerId)
  if (plates.length === 0) {
    return {
      totalVisits: 0,
      lastVisitAt: null,
      visitsLast30: 0,
      visitsLast90: 0,
      avgRevenueCents: 0,
    }
  }
  const { clause, params } = buildInClause(plates, 1)
  const today = getLocalDayDate()
  const day30 = addDays(today, -29)
  const day90 = addDays(today, -89)

  const totals = await query(
    `
      SELECT
        COUNT(*)::int AS "totalVisits",
        COALESCE(SUM(price_cents), 0)::int AS "totalRevenueCents",
        MAX(created_at) AS "lastVisitAt"
      FROM tickets
      WHERE plate IN ${clause} AND voided_at IS NULL
    `,
    params,
  )

  const last30 = await query(
    `
      SELECT COUNT(*)::int AS "visitsLast30"
      FROM tickets
      WHERE plate IN ${clause} AND day_date >= $${params.length + 1}::date AND voided_at IS NULL
    `,
    [...params, day30],
  )

  const last90 = await query(
    `
      SELECT COUNT(*)::int AS "visitsLast90"
      FROM tickets
      WHERE plate IN ${clause} AND day_date >= $${params.length + 1}::date AND voided_at IS NULL
    `,
    [...params, day90],
  )

  const totalVisits = totals.rows[0]?.totalVisits ?? 0
  const totalRevenueCents = totals.rows[0]?.totalRevenueCents ?? 0

  return {
    totalVisits,
    lastVisitAt: totals.rows[0]?.lastVisitAt ?? null,
    visitsLast30: last30.rows[0]?.visitsLast30 ?? 0,
    visitsLast90: last90.rows[0]?.visitsLast90 ?? 0,
    avgRevenueCents: totalVisits > 0 ? Math.round(totalRevenueCents / totalVisits) : 0,
  }
}

async function getLoyalty(customerId, totalVisits) {
  const earned = Math.floor((totalVisits ?? 0) / 10)
  const grantedRow = await query(
    "SELECT COUNT(*)::int AS c FROM loyalty_rewards WHERE customer_id = $1 AND type = 'free_wash'",
    [customerId],
  )
  const redeemedRow = await query(
    "SELECT COUNT(*)::int AS c FROM loyalty_rewards WHERE customer_id = $1 AND type = 'free_wash' AND redeemed_at IS NOT NULL",
    [customerId],
  )
  const granted = grantedRow.rows[0]?.c ?? 0
  const redeemed = redeemedRow.rows[0]?.c ?? 0
  const available = Math.max(0, granted - redeemed)
  return { earnedFreeWashes: earned, grantedFreeWashes: granted, redeemedFreeWashes: redeemed, availableFreeWashes: available }
}

export function attachCustomerRoutes(app) {
  app.get('/api/owner/customers', requireRole('owner'), async (req, res) => {
    const schema = z
      .object({
        q: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).max(5000).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' })

    const q = parsed.data.q ? parsed.data.q.trim() : null
    const limit = parsed.data.limit ?? 50
    const offset = parsed.data.offset ?? 0

    const cleaned = q ? q.replaceAll('%', '').replaceAll('_', '') : ''
    const like = q ? `%${cleaned}%` : null

    const today = getLocalDayDate()
    const day30 = addDays(today, -29)
    const day90 = addDays(today, -89)

    const rows = await query(
      `
        WITH filtered AS (
          SELECT c.id, c.name, c.phone, c.notes, c.active, c.created_at, c.updated_at
          FROM customers c
          WHERE c.active = 1
            AND (
              $1::text IS NULL
              OR COALESCE(c.name, '') ILIKE $2
              OR COALESCE(c.phone, '') ILIKE $2
              OR EXISTS (
                SELECT 1
                FROM customer_plates cpq
                WHERE cpq.customer_id = c.id AND cpq.plate ILIKE $2
              )
            )
          ORDER BY c.id DESC
          LIMIT $3 OFFSET $6
        )
        SELECT
          c.id AS id,
          c.name AS name,
          c.phone AS phone,
          c.notes AS notes,
          c.active AS active,
          c.created_at AS "createdAt",
          c.updated_at AS "updatedAt",
          COALESCE(array_agg(DISTINCT cp.plate ORDER BY cp.plate) FILTER (WHERE cp.plate IS NOT NULL), '{}'::text[]) AS plates,
          COUNT(t.id)::int AS "totalVisits",
          MAX(t.created_at) AS "lastVisitAt",
          COUNT(t.id) FILTER (WHERE t.day_date >= $4::date)::int AS "visitsLast30",
          COUNT(t.id) FILTER (WHERE t.day_date >= $5::date)::int AS "visitsLast90",
          CASE
            WHEN COUNT(t.id) > 0 THEN ROUND(COALESCE(SUM(t.price_cents), 0)::numeric / COUNT(t.id))::int
            ELSE 0
          END AS "avgRevenueCents"
        FROM filtered c
        LEFT JOIN customer_plates cp ON cp.customer_id = c.id
        LEFT JOIN tickets t ON t.plate = cp.plate AND t.voided_at IS NULL
        GROUP BY c.id
        ORDER BY c.id DESC
      `,
      [q, like, limit, day30, day90, offset],
    )

    const data = rows.rows.map((c) => ({
      id: Number(c.id),
      name: c.name,
      phone: c.phone,
      notes: c.notes,
      active: c.active,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      plates: c.plates ?? [],
      stats: {
        totalVisits: c.totalVisits ?? 0,
        lastVisitAt: c.lastVisitAt ?? null,
        visitsLast30: c.visitsLast30 ?? 0,
        visitsLast90: c.visitsLast90 ?? 0,
        avgRevenueCents: c.avgRevenueCents ?? 0,
      },
    }))

    res.json({ customers: data })
  })

  app.post('/api/owner/customers', requireRole('owner'), async (req, res) => {
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
      const customerId = await withTx(async (client) => {
        const ins = await client.query(
          'INSERT INTO customers (name, phone, notes, active, created_at, updated_at) VALUES ($1, $2, $3, 1, $4, $5) RETURNING id',
          [name, phone, notes, now, now],
        )
        const id = Number(ins.rows[0].id)
        for (const p of plates) {
          await client.query('INSERT INTO customer_plates (customer_id, plate, created_at) VALUES ($1, $2, $3)', [
            id,
            p,
            now,
          ])
        }
        return id
      })

      res.json({ ok: true, id: customerId })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === '23505') return res.status(409).json({ error: 'plate_conflict' })
      res.status(409).json({ error: 'plate_conflict' })
    }
  })

  app.get('/api/owner/customers/:id', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const cRes = await query(
      `
        SELECT id, name, phone, notes, active, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM customers
        WHERE id = $1
      `,
      [id],
    )
    const customer = cRes.rows[0] ?? null
    if (!customer) return res.status(404).json({ error: 'not_found' })

    const plates = await getCustomerPlateList(id)
    const stats = await computeCustomerStats(id)
    const loyalty = await getLoyalty(id, stats.totalVisits)
    const rewardsRes = await query(
      `
        SELECT id, type, note, granted_at AS "grantedAt", redeemed_at AS "redeemedAt"
        FROM loyalty_rewards
        WHERE customer_id = $1
        ORDER BY granted_at DESC, id DESC
        LIMIT 200
      `,
      [id],
    )

    res.json({ customer, plates, stats, loyalty, rewards: rewardsRes.rows })
  })

  app.patch('/api/owner/customers/:id', requireRole('owner'), async (req, res) => {
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

    const exists = await query('SELECT id FROM customers WHERE id = $1', [id])
    if (exists.rows.length === 0) return res.status(404).json({ error: 'not_found' })

    const now = new Date().toISOString()
    await withTx(async (client) => {
      if (parsed.data.name !== undefined) await client.query('UPDATE customers SET name = $1, updated_at = $2 WHERE id = $3', [parsed.data.name, now, id])
      if (parsed.data.phone !== undefined) await client.query('UPDATE customers SET phone = $1, updated_at = $2 WHERE id = $3', [parsed.data.phone, now, id])
      if (parsed.data.notes !== undefined) await client.query('UPDATE customers SET notes = $1, updated_at = $2 WHERE id = $3', [parsed.data.notes, now, id])
      if (parsed.data.active !== undefined) await client.query('UPDATE customers SET active = $1, updated_at = $2 WHERE id = $3', [parsed.data.active, now, id])
      if (parsed.data.name === undefined && parsed.data.phone === undefined && parsed.data.notes === undefined && parsed.data.active === undefined) {
        await client.query('UPDATE customers SET updated_at = $1 WHERE id = $2', [now, id])
      }
    })

    res.json({ ok: true })
  })

  app.post('/api/owner/customers/:id/plates', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const schema = z.object({ plate: z.string().trim().min(1).max(16) }).strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const exists = await query('SELECT id FROM customers WHERE id = $1 AND active = 1', [id])
    if (exists.rows.length === 0) return res.status(404).json({ error: 'not_found' })

    const plate = normalizePlate(parsed.data.plate)
    const now = new Date().toISOString()

    try {
      await query('INSERT INTO customer_plates (customer_id, plate, created_at) VALUES ($1, $2, $3)', [id, plate, now])
      res.json({ ok: true })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === '23505') return res.status(409).json({ error: 'plate_conflict' })
      res.status(409).json({ error: 'plate_conflict' })
    }
  })

  app.delete('/api/owner/customers/:id/plates/:plate', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const plate = normalizePlate(req.params.plate ?? '')
    if (!plate) return res.status(400).json({ error: 'invalid_plate' })

    const info = await query('DELETE FROM customer_plates WHERE customer_id = $1 AND plate = $2', [id, plate])
    if (info.rowCount === 0) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  })

  app.get('/api/owner/customers/:id/visits', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })

    const customer = await query('SELECT id, name FROM customers WHERE id = $1 AND active = 1', [id])
    if (customer.rows.length === 0) return res.status(404).json({ error: 'not_found' })

    const plates = await getCustomerPlateList(id)
    if (plates.length === 0) return res.json({ visits: [] })
    const { clause, params } = buildInClause(plates, 1)

    const rows = await query(
      `
        SELECT
          ticket_number AS "ticketNumber",
          day_date AS "dayDate",
          plate,
          vehicle_type_name AS "vehicleTypeName",
          service_type_name AS "serviceTypeName",
          price_cents AS "priceCents",
          payment_method AS "paymentMethod",
          created_at AS "createdAt"
        FROM tickets
        WHERE plate IN ${clause} AND voided_at IS NULL
        ORDER BY created_at DESC
        LIMIT 300
      `,
      params,
    )

    res.json({ visits: rows.rows })
  })

  app.get('/api/owner/customers/high-frequency', requireRole('owner'), async (req, res) => {
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

    const rows = await query(
      `
        SELECT
          c.id AS "customerId",
          c.name AS name,
          c.phone AS phone,
          COUNT(*)::int AS visits,
          COALESCE(SUM(t.price_cents), 0)::int AS "revenueCents",
          MAX(t.created_at) AS "lastVisitAt"
        FROM tickets t
        JOIN customer_plates cp ON cp.plate = t.plate
        JOIN customers c ON c.id = cp.customer_id
        WHERE c.active = 1 AND t.day_date >= $1::date AND t.voided_at IS NULL
        GROUP BY c.id
        ORDER BY visits DESC, revenueCents DESC
        LIMIT $2
      `,
      [startDay, limit],
    )

    res.json({ startDay, days: daysBack, rows: rows.rows })
  })

  app.post('/api/owner/customers/:id/rewards/free-wash', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const schema = z.object({ note: z.string().trim().max(200).optional() }).strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const exists = await query('SELECT id FROM customers WHERE id = $1 AND active = 1', [id])
    if (exists.rows.length === 0) return res.status(404).json({ error: 'not_found' })

    const now = new Date().toISOString()
    await query("INSERT INTO loyalty_rewards (customer_id, type, note, granted_at) VALUES ($1, 'free_wash', $2, $3)", [
      id,
      parsed.data.note ?? null,
      now,
    ])
    res.json({ ok: true })
  })

  app.post('/api/owner/customers/:id/rewards/:rewardId/redeem', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    const rewardId = Number(req.params.rewardId)
    if (!Number.isFinite(id) || !Number.isFinite(rewardId)) return res.status(400).json({ error: 'invalid_id' })

    const rowRes = await query(
      "SELECT id, redeemed_at AS \"redeemedAt\" FROM loyalty_rewards WHERE id = $1 AND customer_id = $2 AND type = 'free_wash'",
      [rewardId, id],
    )
    const row = rowRes.rows[0] ?? null
    if (!row) return res.status(404).json({ error: 'not_found' })
    if (row.redeemedAt) return res.status(409).json({ error: 'already_redeemed' })

    const now = new Date().toISOString()
    await query('UPDATE loyalty_rewards SET redeemed_at = $1 WHERE id = $2', [now, rewardId])
    res.json({ ok: true })
  })
}
