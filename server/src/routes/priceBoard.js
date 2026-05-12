import { z } from 'zod'
import { query, withTx } from '../db.js'
import { requireRole } from '../auth.js'

async function fetchPriceBoard() {
  const vehicleTypes = await query(
    'SELECT id, name, sort_order AS "sortOrder", active FROM vehicle_types ORDER BY sort_order ASC, id ASC',
  )
  const serviceTypes = await query(
    'SELECT id, name, sort_order AS "sortOrder", active FROM service_types ORDER BY sort_order ASC, id ASC',
  )
  const prices = await query(
    'SELECT vehicle_type_id AS "vehicleTypeId", service_type_id AS "serviceTypeId", price_cents AS "priceCents" FROM price_matrix',
  )

  return { vehicleTypes: vehicleTypes.rows, serviceTypes: serviceTypes.rows, prices: prices.rows }
}

export function attachPriceBoardRoutes(app) {
  app.get('/api/price-board', async (req, res) => {
    const board = await fetchPriceBoard()
    const cashierOnlyActive = req.query.activeOnly === '1'
    if (cashierOnlyActive) {
      board.vehicleTypes = board.vehicleTypes.filter((v) => v.active === 1)
      board.serviceTypes = board.serviceTypes.filter((s) => s.active === 1)
    }
    res.json(board)
  })

  app.post('/api/vehicle-types', requireRole('owner'), async (req, res) => {
    const schema = z.object({ name: z.string().trim().min(1).max(48) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    try {
      const r = await query('INSERT INTO vehicle_types (name, sort_order, active) VALUES ($1, 0, 1) RETURNING id', [
        parsed.data.name,
      ])
      res.json({ ok: true, id: Number(r.rows[0].id) })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === '23505') return res.status(409).json({ error: 'name_conflict' })
      res.status(409).json({ error: 'name_conflict' })
    }
  })

  app.patch('/api/vehicle-types/:id', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const schema = z
      .object({
        name: z.string().trim().min(1).max(48).optional(),
        active: z.number().int().min(0).max(1).optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const current = await query('SELECT id FROM vehicle_types WHERE id = $1', [id])
    if ((current.rows[0]?.id ?? null) === null) return res.status(404).json({ error: 'not_found' })

    try {
      await withTx(async (client) => {
        if (parsed.data.name !== undefined) {
          await client.query('UPDATE vehicle_types SET name = $1 WHERE id = $2', [parsed.data.name, id])
        }
        if (parsed.data.active !== undefined) {
          await client.query('UPDATE vehicle_types SET active = $1 WHERE id = $2', [parsed.data.active, id])
        }
        if (parsed.data.sortOrder !== undefined) {
          await client.query('UPDATE vehicle_types SET sort_order = $1 WHERE id = $2', [parsed.data.sortOrder, id])
        }
      })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === '23505') return res.status(409).json({ error: 'name_conflict' })
      return res.status(409).json({ error: 'name_conflict' })
    }

    res.json({ ok: true })
  })

  app.delete('/api/vehicle-types/:id', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const r = await query('DELETE FROM vehicle_types WHERE id = $1', [id])
    if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  })

  app.post('/api/service-types', requireRole('owner'), async (req, res) => {
    const schema = z.object({ name: z.string().trim().min(1).max(48) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    try {
      const r = await query('INSERT INTO service_types (name, sort_order, active) VALUES ($1, 0, 1) RETURNING id', [
        parsed.data.name,
      ])
      res.json({ ok: true, id: Number(r.rows[0].id) })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === '23505') return res.status(409).json({ error: 'name_conflict' })
      res.status(409).json({ error: 'name_conflict' })
    }
  })

  app.patch('/api/service-types/:id', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const schema = z
      .object({
        name: z.string().trim().min(1).max(48).optional(),
        active: z.number().int().min(0).max(1).optional(),
        sortOrder: z.number().int().min(0).max(999).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const current = await query('SELECT id FROM service_types WHERE id = $1', [id])
    if ((current.rows[0]?.id ?? null) === null) return res.status(404).json({ error: 'not_found' })

    try {
      await withTx(async (client) => {
        if (parsed.data.name !== undefined) {
          await client.query('UPDATE service_types SET name = $1 WHERE id = $2', [parsed.data.name, id])
        }
        if (parsed.data.active !== undefined) {
          await client.query('UPDATE service_types SET active = $1 WHERE id = $2', [parsed.data.active, id])
        }
        if (parsed.data.sortOrder !== undefined) {
          await client.query('UPDATE service_types SET sort_order = $1 WHERE id = $2', [parsed.data.sortOrder, id])
        }
      })
    } catch (e) {
      if (e && typeof e === 'object' && e.code === '23505') return res.status(409).json({ error: 'name_conflict' })
      return res.status(409).json({ error: 'name_conflict' })
    }

    res.json({ ok: true })
  })

  app.delete('/api/service-types/:id', requireRole('owner'), async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const r = await query('DELETE FROM service_types WHERE id = $1', [id])
    if (r.rowCount === 0) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  })

  app.put('/api/prices', requireRole('owner'), async (req, res) => {
    const schema = z.object({
      vehicleTypeId: z.number().int().positive(),
      serviceTypeId: z.number().int().positive(),
      priceCents: z.number().int().min(0).max(1_000_000_00),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const { vehicleTypeId, serviceTypeId, priceCents } = parsed.data
    const exists = await query('SELECT 1 FROM vehicle_types WHERE id = $1 AND active = 1', [vehicleTypeId])
    if (exists.rows.length === 0) return res.status(404).json({ error: 'vehicle_type_not_found' })
    const exists2 = await query('SELECT 1 FROM service_types WHERE id = $1 AND active = 1', [serviceTypeId])
    if (exists2.rows.length === 0) return res.status(404).json({ error: 'service_type_not_found' })

    await query(
      `
      INSERT INTO price_matrix (vehicle_type_id, service_type_id, price_cents, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT(vehicle_type_id, service_type_id)
      DO UPDATE SET price_cents = excluded.price_cents, updated_at = now()
    `,
      [vehicleTypeId, serviceTypeId, priceCents],
    )

    res.json({ ok: true })
  })
}
