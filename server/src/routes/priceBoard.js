import { z } from 'zod'
import { db } from '../db.js'
import { requireRole } from '../auth.js'

function fetchPriceBoard() {
  const vehicleTypes = db
    .prepare('SELECT id, name, sort_order AS sortOrder, active FROM vehicle_types ORDER BY sort_order ASC, id ASC')
    .all()
  const serviceTypes = db
    .prepare('SELECT id, name, sort_order AS sortOrder, active FROM service_types ORDER BY sort_order ASC, id ASC')
    .all()
  const prices = db
    .prepare('SELECT vehicle_type_id AS vehicleTypeId, service_type_id AS serviceTypeId, price_cents AS priceCents FROM price_matrix')
    .all()

  return { vehicleTypes, serviceTypes, prices }
}

export function attachPriceBoardRoutes(app) {
  app.get('/api/price-board', (req, res) => {
    const board = fetchPriceBoard()
    const cashierOnlyActive = req.query.activeOnly === '1'
    if (cashierOnlyActive) {
      board.vehicleTypes = board.vehicleTypes.filter((v) => v.active === 1)
      board.serviceTypes = board.serviceTypes.filter((s) => s.active === 1)
    }
    res.json(board)
  })

  app.post('/api/vehicle-types', requireRole('owner'), (req, res) => {
    const schema = z.object({ name: z.string().trim().min(1).max(48) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    try {
      const info = db
        .prepare('INSERT INTO vehicle_types (name, sort_order, active) VALUES (?, 0, 1)')
        .run(parsed.data.name)
      res.json({ ok: true, id: info.lastInsertRowid })
    } catch {
      res.status(409).json({ error: 'name_conflict' })
    }
  })

  app.patch('/api/vehicle-types/:id', requireRole('owner'), (req, res) => {
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

    const current = db.prepare('SELECT id FROM vehicle_types WHERE id = ?').get(id)
    if (!current) return res.status(404).json({ error: 'not_found' })

    try {
      db.transaction(() => {
        if (parsed.data.name !== undefined) {
          db.prepare('UPDATE vehicle_types SET name = ? WHERE id = ?').run(parsed.data.name, id)
        }
        if (parsed.data.active !== undefined) {
          db.prepare('UPDATE vehicle_types SET active = ? WHERE id = ?').run(parsed.data.active, id)
        }
        if (parsed.data.sortOrder !== undefined) {
          db.prepare('UPDATE vehicle_types SET sort_order = ? WHERE id = ?').run(parsed.data.sortOrder, id)
        }
      })()
    } catch {
      return res.status(409).json({ error: 'name_conflict' })
    }

    res.json({ ok: true })
  })

  app.delete('/api/vehicle-types/:id', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const info = db.prepare('DELETE FROM vehicle_types WHERE id = ?').run(id)
    if (info.changes === 0) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  })

  app.post('/api/service-types', requireRole('owner'), (req, res) => {
    const schema = z.object({ name: z.string().trim().min(1).max(48) })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    try {
      const info = db
        .prepare('INSERT INTO service_types (name, sort_order, active) VALUES (?, 0, 1)')
        .run(parsed.data.name)
      res.json({ ok: true, id: info.lastInsertRowid })
    } catch {
      res.status(409).json({ error: 'name_conflict' })
    }
  })

  app.patch('/api/service-types/:id', requireRole('owner'), (req, res) => {
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

    const current = db.prepare('SELECT id FROM service_types WHERE id = ?').get(id)
    if (!current) return res.status(404).json({ error: 'not_found' })

    try {
      db.transaction(() => {
        if (parsed.data.name !== undefined) {
          db.prepare('UPDATE service_types SET name = ? WHERE id = ?').run(parsed.data.name, id)
        }
        if (parsed.data.active !== undefined) {
          db.prepare('UPDATE service_types SET active = ? WHERE id = ?').run(parsed.data.active, id)
        }
        if (parsed.data.sortOrder !== undefined) {
          db.prepare('UPDATE service_types SET sort_order = ? WHERE id = ?').run(parsed.data.sortOrder, id)
        }
      })()
    } catch {
      return res.status(409).json({ error: 'name_conflict' })
    }

    res.json({ ok: true })
  })

  app.delete('/api/service-types/:id', requireRole('owner'), (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' })
    const info = db.prepare('DELETE FROM service_types WHERE id = ?').run(id)
    if (info.changes === 0) return res.status(404).json({ error: 'not_found' })
    res.json({ ok: true })
  })

  app.put('/api/prices', requireRole('owner'), (req, res) => {
    const schema = z.object({
      vehicleTypeId: z.number().int().positive(),
      serviceTypeId: z.number().int().positive(),
      priceCents: z.number().int().min(0).max(1_000_000_00),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const { vehicleTypeId, serviceTypeId, priceCents } = parsed.data
    const exists = db
      .prepare('SELECT 1 FROM vehicle_types WHERE id = ? AND active = 1')
      .get(vehicleTypeId)
    if (!exists) return res.status(404).json({ error: 'vehicle_type_not_found' })
    const exists2 = db
      .prepare('SELECT 1 FROM service_types WHERE id = ? AND active = 1')
      .get(serviceTypeId)
    if (!exists2) return res.status(404).json({ error: 'service_type_not_found' })

    const now = new Date().toISOString()
    db.prepare(
      `
      INSERT INTO price_matrix (vehicle_type_id, service_type_id, price_cents, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(vehicle_type_id, service_type_id)
      DO UPDATE SET price_cents = excluded.price_cents, updated_at = excluded.updated_at
    `,
    ).run(vehicleTypeId, serviceTypeId, priceCents, now)

    res.json({ ok: true })
  })
}

