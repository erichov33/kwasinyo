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

