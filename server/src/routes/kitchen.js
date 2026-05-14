import { z } from 'zod'
import { query, withTx } from '../db.js'
import { requireAuth, requireRole } from '../auth.js'
import { getLocalDayDate } from '../util.js'

function formatKitchenOrderNumber(n) {
  return `#K${String(n).padStart(4, '0')}`
}

export function attachKitchenRoutes(app) {
  app.get('/api/kitchen/menu', requireRole('cashier'), async (_req, res) => {
    const r = await query(
      `
        SELECT id, name, category, price_cents AS "priceCents"
        FROM kitchen_items
        WHERE active = 1
        ORDER BY category ASC, sort_order ASC, id ASC
      `,
    )
    res.json({ items: r.rows })
  })

  app.post('/api/kitchen/orders', requireRole('cashier'), async (req, res) => {
    const dayDate = getLocalDayDate()
    const locked = await query('SELECT 1 FROM day_reconciliations WHERE day_date = $1::date LIMIT 1', [dayDate])
    if (locked.rows.length) return res.status(409).json({ error: 'day_locked' })

    const schema = z.object({
      paymentMethod: z.enum(['cash', 'card']).default('cash'),
      items: z
        .array(
          z.object({
            itemId: z.number().int().positive(),
            quantity: z.number().int().min(1).max(100),
          }),
        )
        .min(1)
        .max(50),
    })
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' })

    const ids = Array.from(new Set(parsed.data.items.map((x) => x.itemId)))
    const idPlaceholders = ids.map((_, i) => `$${i + 1}`).join(',')
    const menuRes = await query(
      `
        SELECT id, name, price_cents AS "priceCents"
        FROM kitchen_items
        WHERE active = 1 AND id IN (${idPlaceholders})
      `,
      ids,
    )
    const menu = new Map(menuRes.rows.map((r) => [Number(r.id), { name: r.name, priceCents: Number(r.priceCents) }]))
    if (menu.size !== ids.length) return res.status(409).json({ error: 'invalid_item' })

    let totalCents = 0
    const lines = parsed.data.items.map((x) => {
      const m = menu.get(x.itemId)
      const unitPriceCents = m?.priceCents ?? 0
      const lineTotalCents = unitPriceCents * x.quantity
      totalCents += lineTotalCents
      return {
        itemId: x.itemId,
        itemName: m?.name ?? '',
        unitPriceCents,
        quantity: x.quantity,
        lineTotalCents,
      }
    })
    if (totalCents <= 0) return res.status(409).json({ error: 'invalid_total' })

    const createdAt = new Date().toISOString()
    const inserted = await withTx(async (client) => {
      const ins = await client.query(
        `
          INSERT INTO kitchen_orders (day_date, payment_method, total_cents, cashier_user_id, created_at)
          VALUES ($1::date, $2, $3, $4, $5)
          RETURNING id, order_number
        `,
        [dayDate, parsed.data.paymentMethod, totalCents, req.user.id, createdAt],
      )
      const orderId = Number(ins.rows[0].id)
      const orderNumber = Number(ins.rows[0].order_number)

      for (const li of lines) {
        await client.query(
          `
            INSERT INTO kitchen_order_items (order_id, item_id, item_name, unit_price_cents, quantity, line_total_cents)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [orderId, li.itemId, li.itemName, li.unitPriceCents, li.quantity, li.lineTotalCents],
        )
      }

      return { orderId, orderNumber }
    })

    res.json({
      ok: true,
      order: {
        orderNumber: inserted.orderNumber,
        orderLabel: formatKitchenOrderNumber(inserted.orderNumber),
        dayDate,
        totalCents,
        paymentMethod: parsed.data.paymentMethod,
        createdAt,
      },
    })
  })

  app.get('/api/kitchen/orders/:orderNumber/receipt', requireAuth, async (req, res) => {
    const orderNumber = Number(req.params.orderNumber)
    if (!Number.isFinite(orderNumber)) return res.status(400).json({ error: 'invalid_order_number' })

    const orderRes = await query(
      `
        SELECT
          o.order_number AS "orderNumber",
          o.day_date AS "dayDate",
          o.payment_method AS "paymentMethod",
          o.total_cents AS "totalCents",
          o.created_at AS "createdAt",
          u.username AS "cashierUsername"
        FROM kitchen_orders o
        JOIN users u ON u.id = o.cashier_user_id
        WHERE o.order_number = $1
      `,
      [orderNumber],
    )
    const order = orderRes.rows[0] ?? null
    if (!order) return res.status(404).json({ error: 'not_found' })

    const itemsRes = await query(
      `
        SELECT
          item_name AS "itemName",
          unit_price_cents AS "unitPriceCents",
          quantity AS quantity,
          line_total_cents AS "lineTotalCents"
        FROM kitchen_order_items i
        JOIN kitchen_orders o ON o.id = i.order_id
        WHERE o.order_number = $1
        ORDER BY i.id ASC
      `,
      [orderNumber],
    )

    res.json({
      order: {
        ...order,
        orderLabel: formatKitchenOrderNumber(Number(order.orderNumber)),
        items: itemsRes.rows,
        printedAt: new Date().toISOString(),
      },
    })
  })
}

