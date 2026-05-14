import { query } from '../db.js'

export async function fetchLastConfirmedDiscrepancy() {
  const r = await query(
    `
      SELECT day_date AS "dayDate", discrepancy_cash_cents AS "discrepancyCashCents"
      FROM day_reconciliations
      WHERE owner_confirmed_at IS NOT NULL
      ORDER BY day_date DESC
      LIMIT 1
    `,
  )
  return r.rows[0] ?? null
}

export async function fetchTicketTotalsForDay(dayDate) {
  const r = await query(
    `
      SELECT COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "expectedRevenueCents"
      FROM tickets
      WHERE day_date = $1::date AND voided_at IS NULL
    `,
    [dayDate],
  )
  return r.rows[0] ?? { ticketsCount: 0, expectedRevenueCents: 0 }
}

export async function fetchReconciliationForDay(dayDate) {
  const r = await query(
    `
      SELECT
        cashier_submitted_at AS "cashierSubmittedAt",
        owner_confirmed_at AS "ownerConfirmedAt",
        discrepancy_cash_cents AS "discrepancyCashCents"
      FROM day_reconciliations
      WHERE day_date = $1::date
    `,
    [dayDate],
  )
  return r.rows[0] ?? null
}

export async function fetchTicketTotalsByDayRange(start, end) {
  const r = await query(
    `
      SELECT day_date AS "dayDate", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "expectedRevenueCents"
      FROM tickets
      WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
      GROUP BY day_date
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchReconciliationsByDayRange(start, end) {
  const r = await query(
    `
      SELECT
        day_date AS "dayDate",
        declared_cash_cents AS "declaredCashCents",
        discrepancy_cash_cents AS "discrepancyCashCents",
        cashier_submitted_at AS "cashierSubmittedAt",
        owner_confirmed_at AS "ownerConfirmedAt"
      FROM day_reconciliations
      WHERE day_date >= $1::date AND day_date <= $2::date
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchReportsTotals(start, end) {
  const r = await query(
    `
      SELECT
        COUNT(*)::int AS "ticketsCount",
        COALESCE(SUM(price_cents), 0)::int AS "totalRevenueCents",
        COUNT(DISTINCT plate)::int AS "uniquePlatesCount"
      FROM tickets
      WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
    `,
    [start, end],
  )
  return r.rows[0] ?? { ticketsCount: 0, totalRevenueCents: 0, uniquePlatesCount: 0 }
}

export async function fetchReportsCashTotals(start, end) {
  const r = await query(
    `
      SELECT
        COALESCE(SUM(expected_cash_cents), 0)::int AS "expectedCashCents",
        COALESCE(SUM(declared_cash_cents), 0)::int AS "declaredCashCents",
        COALESCE(SUM(discrepancy_cash_cents), 0)::int AS "discrepancyCashCents"
      FROM day_reconciliations
      WHERE day_date >= $1::date AND day_date <= $2::date
    `,
    [start, end],
  )
  return r.rows[0] ?? { expectedCashCents: 0, declaredCashCents: 0, discrepancyCashCents: 0 }
}

export async function fetchReportsRepeatPlatesCount(start, end) {
  const r = await query(
    `
      SELECT COUNT(*)::int AS "repeatPlatesCount"
      FROM (
        SELECT plate
        FROM tickets
        WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
        GROUP BY plate
        HAVING COUNT(*) >= 2
      ) rp
    `,
    [start, end],
  )
  return r.rows[0] ?? { repeatPlatesCount: 0 }
}

export async function fetchReportsServiceRows(start, end) {
  const r = await query(
    `
      SELECT service_type_name AS "serviceTypeName", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
      FROM tickets
      WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
      GROUP BY service_type_name
      ORDER BY revenueCents DESC, ticketsCount DESC
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchReportsHourRows(start, end) {
  const r = await query(
    `
      SELECT
        EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC'))::int AS hour,
        COUNT(*)::int AS "ticketsCount",
        COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
      FROM tickets
      WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
      GROUP BY hour
      ORDER BY hour ASC
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchReportsPaymentRows(start, end) {
  const r = await query(
    `
      SELECT payment_method AS "paymentMethod", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
      FROM tickets
      WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
      GROUP BY payment_method
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchReportsVehicleRows(start, end) {
  const r = await query(
    `
      SELECT vehicle_type_name AS "vehicleTypeName", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
      FROM tickets
      WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
      GROUP BY vehicle_type_name
      ORDER BY ticketsCount DESC, revenueCents DESC, vehicleTypeName ASC
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchReportsCustomerOverview(start, end) {
  const r = await query(
    `
      WITH customer_first AS (
        SELECT cp.customer_id, MIN(t.day_date) AS first_day
        FROM customer_plates cp
        JOIN tickets t ON t.plate = cp.plate AND t.voided_at IS NULL
        GROUP BY cp.customer_id
      ),
      customer_range AS (
        SELECT cp.customer_id, COUNT(t.id)::int AS visits, COALESCE(SUM(t.price_cents), 0)::int AS "revenueCents"
        FROM customer_plates cp
        JOIN tickets t ON t.plate = cp.plate AND t.voided_at IS NULL
        WHERE t.day_date >= $1::date AND t.day_date <= $2::date
        GROUP BY cp.customer_id
      )
      SELECT
        COUNT(*)::int AS "customersVisited",
        COUNT(*) FILTER (WHERE cf.first_day >= $1::date AND cf.first_day <= $2::date)::int AS "newCustomers",
        COUNT(*) FILTER (WHERE cf.first_day < $1::date)::int AS "returningCustomers",
        COALESCE(ROUND(AVG(cr.visits)::numeric), 0)::int AS "avgVisitsPerCustomer"
      FROM customer_range cr
      JOIN customer_first cf ON cf.customer_id = cr.customer_id
    `,
    [start, end],
  )
  return (
    r.rows[0] ?? {
      customersVisited: 0,
      newCustomers: 0,
      returningCustomers: 0,
      avgVisitsPerCustomer: 0,
    }
  )
}

export async function fetchReportsCustomerFrequency(start, end) {
  const r = await query(
    `
      WITH customer_range AS (
        SELECT cp.customer_id, COUNT(t.id)::int AS visits
        FROM customer_plates cp
        JOIN tickets t ON t.plate = cp.plate AND t.voided_at IS NULL
        WHERE t.day_date >= $1::date AND t.day_date <= $2::date
        GROUP BY cp.customer_id
      )
      SELECT
        COUNT(*) FILTER (WHERE visits = 1)::int AS once,
        COUNT(*) FILTER (WHERE visits BETWEEN 2 AND 3)::int AS twoToThree,
        COUNT(*) FILTER (WHERE visits BETWEEN 4 AND 9)::int AS fourToNine,
        COUNT(*) FILTER (WHERE visits >= 10)::int AS tenPlus
      FROM customer_range
    `,
    [start, end],
  )
  return r.rows[0] ?? { once: 0, twoToThree: 0, fourToNine: 0, tenPlus: 0 }
}

export async function fetchReportsTopCustomers(start, end, limit) {
  const r = await query(
    `
      SELECT
        c.id AS "customerId",
        c.name AS name,
        c.phone AS phone,
        COUNT(t.id)::int AS visits,
        COALESCE(SUM(t.price_cents), 0)::int AS "revenueCents",
        MAX(t.created_at) AS "lastVisitAt"
      FROM customers c
      JOIN customer_plates cp ON cp.customer_id = c.id
      JOIN tickets t ON t.plate = cp.plate AND t.voided_at IS NULL
      WHERE t.day_date >= $1::date AND t.day_date <= $2::date AND c.active = 1
      GROUP BY c.id
      ORDER BY visits DESC, revenueCents DESC, "lastVisitAt" DESC NULLS LAST
      LIMIT $3
    `,
    [start, end, limit],
  )
  return r.rows
}

export async function fetchKitchenTotalsForDay(dayDate) {
  const r = await query(
    `
      SELECT
        COUNT(*)::int AS "ordersCount",
        COALESCE(SUM(total_cents), 0)::int AS "revenueCents"
      FROM kitchen_orders
      WHERE day_date = $1::date
    `,
    [dayDate],
  )
  return r.rows[0] ?? { ordersCount: 0, revenueCents: 0 }
}

export async function fetchKitchenMealsSoldForDay(dayDate) {
  const r = await query(
    `
      SELECT COALESCE(SUM(i.quantity), 0)::int AS "mealsSold"
      FROM kitchen_order_items i
      JOIN kitchen_orders o ON o.id = i.order_id
      JOIN kitchen_items ki ON ki.id = i.item_id
      WHERE o.day_date = $1::date AND ki.category = 'meal'
    `,
    [dayDate],
  )
  return r.rows[0]?.mealsSold ?? 0
}

export async function fetchKitchenMostOrderedMealForDay(dayDate) {
  const r = await query(
    `
      SELECT ki.name AS name, COALESCE(SUM(i.quantity), 0)::int AS qty
      FROM kitchen_order_items i
      JOIN kitchen_orders o ON o.id = i.order_id
      JOIN kitchen_items ki ON ki.id = i.item_id
      WHERE o.day_date = $1::date AND ki.category = 'meal'
      GROUP BY ki.name
      ORDER BY qty DESC, name ASC
      LIMIT 1
    `,
    [dayDate],
  )
  return r.rows[0]?.name ?? null
}

export async function fetchKitchenTopItemsByCategory(start, end, category, limit) {
  const r = await query(
    `
      SELECT
        ki.name AS "itemName",
        COALESCE(SUM(i.quantity), 0)::int AS "qtySold",
        COALESCE(SUM(i.line_total_cents), 0)::int AS "revenueCents"
      FROM kitchen_order_items i
      JOIN kitchen_orders o ON o.id = i.order_id
      JOIN kitchen_items ki ON ki.id = i.item_id
      WHERE o.day_date >= $1::date AND o.day_date <= $2::date AND ki.category = $3
      GROUP BY ki.name
      ORDER BY qtySold DESC, revenueCents DESC, "itemName" ASC
      LIMIT $4
    `,
    [start, end, category, limit],
  )
  return r.rows
}

export async function fetchKitchenSummaryByRange(start, end) {
  const totals = await query(
    `
      SELECT
        COUNT(*)::int AS "ordersCount",
        COALESCE(SUM(total_cents), 0)::int AS "revenueCents"
      FROM kitchen_orders
      WHERE day_date >= $1::date AND day_date <= $2::date
    `,
    [start, end],
  )
  const meals = await query(
    `
      SELECT COALESCE(SUM(i.quantity), 0)::int AS "mealsSold"
      FROM kitchen_order_items i
      JOIN kitchen_orders o ON o.id = i.order_id
      JOIN kitchen_items ki ON ki.id = i.item_id
      WHERE o.day_date >= $1::date AND o.day_date <= $2::date AND ki.category = 'meal'
    `,
    [start, end],
  )
  const drinks = await query(
    `
      SELECT COALESCE(SUM(i.quantity), 0)::int AS "drinksSold"
      FROM kitchen_order_items i
      JOIN kitchen_orders o ON o.id = i.order_id
      JOIN kitchen_items ki ON ki.id = i.item_id
      WHERE o.day_date >= $1::date AND o.day_date <= $2::date AND ki.category = 'drink'
    `,
    [start, end],
  )
  return {
    ordersCount: totals.rows[0]?.ordersCount ?? 0,
    revenueCents: totals.rows[0]?.revenueCents ?? 0,
    mealsSold: meals.rows[0]?.mealsSold ?? 0,
    drinksSold: drinks.rows[0]?.drinksSold ?? 0,
  }
}

export async function fetchKitchenQtyForItemName(start, end, name) {
  const r = await query(
    `
      SELECT COALESCE(SUM(i.quantity), 0)::int AS qty
      FROM kitchen_order_items i
      JOIN kitchen_orders o ON o.id = i.order_id
      JOIN kitchen_items ki ON ki.id = i.item_id
      WHERE o.day_date >= $1::date AND o.day_date <= $2::date AND ki.name = $3
    `,
    [start, end, name],
  )
  return r.rows[0]?.qty ?? 0
}

export async function fetchCombinedToday(dayDate) {
  const [carWash, kitchen] = await Promise.all([
    query(
      `
        SELECT
          COUNT(*)::int AS "txCount",
          COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
        FROM tickets
        WHERE day_date = $1::date AND voided_at IS NULL
      `,
      [dayDate],
    ),
    query(
      `
        SELECT
          COUNT(*)::int AS "txCount",
          COALESCE(SUM(total_cents), 0)::int AS "revenueCents"
        FROM kitchen_orders
        WHERE day_date = $1::date
      `,
      [dayDate],
    ),
  ])

  const carWashTx = carWash.rows[0]?.txCount ?? 0
  const carWashRev = carWash.rows[0]?.revenueCents ?? 0
  const kitchenTx = kitchen.rows[0]?.txCount ?? 0
  const kitchenRev = kitchen.rows[0]?.revenueCents ?? 0

  return {
    carWash: { txCount: carWashTx, revenueCents: carWashRev },
    kitchen: { txCount: kitchenTx, revenueCents: kitchenRev },
    combined: { txCount: carWashTx + kitchenTx, revenueCents: carWashRev + kitchenRev },
  }
}

export async function fetchCombinedDailyByRange(start, end) {
  const r = await query(
    `
      WITH rows AS (
        SELECT
          day_date AS "dayDate",
          COUNT(*)::int AS "carWashTxCount",
          COALESCE(SUM(price_cents), 0)::int AS "carWashRevenueCents",
          0::int AS "kitchenTxCount",
          0::int AS "kitchenRevenueCents"
        FROM tickets
        WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
        GROUP BY day_date

        UNION ALL

        SELECT
          day_date AS "dayDate",
          0::int AS "carWashTxCount",
          0::int AS "carWashRevenueCents",
          COUNT(*)::int AS "kitchenTxCount",
          COALESCE(SUM(total_cents), 0)::int AS "kitchenRevenueCents"
        FROM kitchen_orders
        WHERE day_date >= $1::date AND day_date <= $2::date
        GROUP BY day_date
      )
      SELECT
        "dayDate",
        COALESCE(SUM("carWashTxCount"), 0)::int AS "carWashTxCount",
        COALESCE(SUM("carWashRevenueCents"), 0)::int AS "carWashRevenueCents",
        COALESCE(SUM("kitchenTxCount"), 0)::int AS "kitchenTxCount",
        COALESCE(SUM("kitchenRevenueCents"), 0)::int AS "kitchenRevenueCents"
      FROM rows
      GROUP BY "dayDate"
      ORDER BY "dayDate" ASC
    `,
    [start, end],
  )
  return r.rows.map((x) => ({
    ...x,
    totalTxCount: (x.carWashTxCount ?? 0) + (x.kitchenTxCount ?? 0),
    totalRevenueCents: (x.carWashRevenueCents ?? 0) + (x.kitchenRevenueCents ?? 0),
  }))
}

export async function fetchCombinedWeeklyByRange(start, end) {
  const r = await query(
    `
      WITH rows AS (
        SELECT
          date_trunc('week', day_date)::date AS "bucket",
          COALESCE(SUM(price_cents), 0)::int AS "carWashRevenueCents",
          0::int AS "kitchenRevenueCents"
        FROM tickets
        WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
        GROUP BY date_trunc('week', day_date)

        UNION ALL

        SELECT
          date_trunc('week', day_date)::date AS "bucket",
          0::int AS "carWashRevenueCents",
          COALESCE(SUM(total_cents), 0)::int AS "kitchenRevenueCents"
        FROM kitchen_orders
        WHERE day_date >= $1::date AND day_date <= $2::date
        GROUP BY date_trunc('week', day_date)
      )
      SELECT
        "bucket" AS "weekStart",
        COALESCE(SUM("carWashRevenueCents"), 0)::int AS "carWashRevenueCents",
        COALESCE(SUM("kitchenRevenueCents"), 0)::int AS "kitchenRevenueCents"
      FROM rows
      GROUP BY "bucket"
      ORDER BY "bucket" ASC
    `,
    [start, end],
  )
  return r.rows.map((x) => ({
    ...x,
    totalRevenueCents: (x.carWashRevenueCents ?? 0) + (x.kitchenRevenueCents ?? 0),
  }))
}

export async function fetchCombinedMonthlyByRange(start, end) {
  const r = await query(
    `
      WITH rows AS (
        SELECT
          date_trunc('month', day_date)::date AS "bucket",
          COALESCE(SUM(price_cents), 0)::int AS "carWashRevenueCents",
          0::int AS "kitchenRevenueCents"
        FROM tickets
        WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
        GROUP BY date_trunc('month', day_date)

        UNION ALL

        SELECT
          date_trunc('month', day_date)::date AS "bucket",
          0::int AS "carWashRevenueCents",
          COALESCE(SUM(total_cents), 0)::int AS "kitchenRevenueCents"
        FROM kitchen_orders
        WHERE day_date >= $1::date AND day_date <= $2::date
        GROUP BY date_trunc('month', day_date)
      )
      SELECT
        "bucket" AS "monthStart",
        COALESCE(SUM("carWashRevenueCents"), 0)::int AS "carWashRevenueCents",
        COALESCE(SUM("kitchenRevenueCents"), 0)::int AS "kitchenRevenueCents"
      FROM rows
      GROUP BY "bucket"
      ORDER BY "bucket" ASC
    `,
    [start, end],
  )
  return r.rows.map((x) => ({
    ...x,
    totalRevenueCents: (x.carWashRevenueCents ?? 0) + (x.kitchenRevenueCents ?? 0),
  }))
}

export async function fetchCombinedEndOfDayEstimate(dayDate, hourUtc, lookbackDays) {
  const start = new Date(`${dayDate}T00:00:00.000Z`)
  start.setUTCDate(start.getUTCDate() - Math.max(7, Math.min(lookbackDays, 90)))
  const startDay = start.toISOString().slice(0, 10)

  const progressRes = await query(
    `
      WITH src AS (
        SELECT day_date, created_at, price_cents AS amount
        FROM tickets
        WHERE day_date >= $1::date AND day_date < $2::date AND voided_at IS NULL
        UNION ALL
        SELECT day_date, created_at, total_cents AS amount
        FROM kitchen_orders
        WHERE day_date >= $1::date AND day_date < $2::date
      ),
      per_hour AS (
        SELECT
          day_date,
          EXTRACT(HOUR FROM (created_at AT TIME ZONE 'UTC'))::int AS hour,
          COALESCE(SUM(amount), 0)::int AS revenue
        FROM src
        GROUP BY day_date, hour
      ),
      cum AS (
        SELECT
          day_date,
          hour,
          SUM(revenue) OVER (PARTITION BY day_date ORDER BY hour ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_rev,
          SUM(revenue) OVER (PARTITION BY day_date) AS day_rev
        FROM per_hour
      )
      SELECT
        (cum_rev::numeric / NULLIF(day_rev, 0)) AS progress
      FROM cum
      WHERE hour = $3
    `,
    [startDay, dayDate, hourUtc],
  )

  const progresses = progressRes.rows
    .map((r) => Number(r.progress))
    .filter((v) => Number.isFinite(v) && v > 0 && v < 1)

  if (progresses.length < 3) return { avgProgress: null }
  const avg = progresses.reduce((a, b) => a + b, 0) / progresses.length
  const clamped = Math.max(0.08, Math.min(0.92, avg))
  return { avgProgress: clamped }
}

export async function fetchReportsReconciliationRows(start, end) {
  const r = await query(
    `
      SELECT
        day_date AS "dayDate",
        discrepancy_cash_cents AS "discrepancyCashCents",
        cashier_submitted_at AS "cashierSubmittedAt",
        owner_confirmed_at AS "ownerConfirmedAt"
      FROM day_reconciliations
      WHERE day_date >= $1::date AND day_date <= $2::date
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchTicketsByDayRows(start, end) {
  const r = await query(
    `
      SELECT day_date AS "dayDate", COUNT(*)::int AS "ticketsCount", COALESCE(SUM(price_cents), 0)::int AS "revenueCents"
      FROM tickets
      WHERE day_date >= $1::date AND day_date <= $2::date AND voided_at IS NULL
      GROUP BY day_date
    `,
    [start, end],
  )
  return r.rows
}

export async function fetchOwnerDayTickets(dayDate) {
  const r = await query(
    `
      SELECT
        t.ticket_number AS "ticketNumber",
        t.day_date AS "dayDate",
        t.plate AS plate,
        t.vehicle_type_id AS "vehicleTypeId",
        t.vehicle_type_name AS "vehicleTypeName",
        t.service_type_id AS "serviceTypeId",
        t.service_type_name AS "serviceTypeName",
        t.base_price_cents AS "basePriceCents",
        t.discount_cents AS "discountCents",
        t.discount_reason AS "discountReason",
        t.override_note AS "overrideNote",
        t.price_cents AS "priceCents",
        t.price_overridden AS "priceOverridden",
        t.payment_method AS "paymentMethod",
        t.created_at AS "createdAt"
      FROM tickets t
      WHERE t.day_date = $1::date AND t.voided_at IS NULL
      ORDER BY t.ticket_number DESC
    `,
    [dayDate],
  )
  return r.rows
}

export async function fetchOwnerDayReconciliation(dayDate) {
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

export async function fetchCashAuditRows(dayDate) {
  const r = await query(
    `
      SELECT
        t.ticket_number AS "ticketNumber",
        t.plate AS plate,
        t.payment_method AS "paymentMethod",
        t.base_price_cents AS "basePriceCents",
        t.discount_cents AS "discountCents",
        t.discount_reason AS "discountReason",
        t.override_note AS "overrideNote",
        t.price_cents AS "priceCents",
        t.price_overridden AS "priceOverridden",
        t.voided_at AS "voidedAt",
        t.void_reason AS "voidReason",
        t.created_at AS "createdAt"
      FROM tickets t
      WHERE t.day_date = $1::date
      ORDER BY t.ticket_number ASC
    `,
    [dayDate],
  )
  return r.rows
}

export async function fetchTodaySnapshot(dayDate) {
  const cars = await query('SELECT COUNT(*)::int AS c FROM tickets WHERE day_date = $1::date AND voided_at IS NULL', [
    dayDate,
  ])
  const rev = await query(
    'SELECT COALESCE(SUM(price_cents),0)::int AS r FROM tickets WHERE day_date = $1::date AND voided_at IS NULL',
    [dayDate]
  )
  const newCust = await query(
    'SELECT COUNT(DISTINCT customer_id)::int AS c FROM customer_plates WHERE created_at::date = $1::date',
    [dayDate]
  )

  const cRows = await fetchCashAuditRows(dayDate)
  let recStatus = 'pending'
  let disc = null
  if (cRows.length > 0) {
    const c = cRows[0]
    if (c.confirmed_at) recStatus = 'confirmed'
    else if (c.cashier_submitted_at) recStatus = 'cashier_submitted'
    disc = c.discrepancy_cash_cents
  }

  const lastConf = await query(
    'SELECT day_date, discrepancy_cash_cents FROM cash_audit WHERE confirmed_at IS NOT NULL AND day_date < $1::date ORDER BY day_date DESC LIMIT 1',
    [dayDate]
  )

  return {
    dayDate,
    carsWashedToday: cars.rows[0].c,
    expectedRevenueTodayCents: rev.rows[0].r,
    newCustomersToday: newCust.rows[0].c,
    reconciliationStatus: recStatus,
    todayDiscrepancyCashCents: disc,
    lastConfirmedDiscrepancy:
      lastConf.rows.length > 0
        ? {
            dayDate: lastConf.rows[0].day_date,
            discrepancyCashCents: lastConf.rows[0].discrepancy_cash_cents,
          }
        : null,
  }
}
