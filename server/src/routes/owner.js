import { z } from 'zod'
import { requireRole } from '../auth.js'
import { query } from '../db.js'
import { clampInt, getLocalDayDate } from '../util.js'
import { addDays, buildPeakHours, buildReportSeries, listDaysBetween, listLastDays } from '../services/ownerService.js'
import {
  fetchCashAuditRows,
  fetchCombinedDailyByRange,
  fetchCombinedEndOfDayEstimate,
  fetchCombinedMonthlyByRange,
  fetchCombinedToday,
  fetchCombinedWeeklyByRange,
  fetchKitchenMealsSoldForDay,
  fetchKitchenMostOrderedMealForDay,
  fetchKitchenQtyForItemName,
  fetchKitchenSummaryByRange,
  fetchKitchenTopItemsByCategory,
  fetchKitchenTotalsForDay,
  fetchLastConfirmedDiscrepancy,
  fetchOwnerDayReconciliation,
  fetchOwnerDayTickets,
  fetchReconciliationForDay,
  fetchReconciliationsByDayRange,
  fetchReportsCashTotals,
  fetchReportsCustomerFrequency,
  fetchReportsCustomerOverview,
  fetchReportsHourRows,
  fetchReportsPaymentRows,
  fetchReportsReconciliationRows,
  fetchReportsRepeatPlatesCount,
  fetchReportsServiceRows,
  fetchReportsTotals,
  fetchReportsTopCustomers,
  fetchReportsVehicleRows,
  fetchTicketTotalsByDayRange,
  fetchTicketTotalsForDay,
  fetchTicketsByDayRows,
} from '../repos/ownerRepo.js'

function startOfMonth(dayDate) {
  const [y, m] = dayDate.split('-')
  return `${y}-${m}-01`
}

export function attachOwnerRoutes(app) {
  app.get('/api/owner/today-snapshot', requireRole('owner'), async (_req, res) => {
    const dayDate = getLocalDayDate()
    const totals = await fetchTicketTotalsForDay(dayDate)
    const rec = await fetchReconciliationForDay(dayDate)
    const newCust = await query(
      'SELECT COUNT(DISTINCT customer_id)::int AS c FROM customer_plates WHERE created_at::date = $1::date',
      [dayDate],
    )

    let reconciliationStatus = 'pending'
    if (rec?.cashierSubmittedAt && !rec?.ownerConfirmedAt) reconciliationStatus = 'cashier_submitted'
    if (rec?.ownerConfirmedAt) reconciliationStatus = 'confirmed'

    const last = await fetchLastConfirmedDiscrepancy()

    res.json({
      dayDate,
      carsWashedToday: totals.ticketsCount ?? 0,
      expectedRevenueTodayCents: totals.expectedRevenueCents ?? 0,
      newCustomersToday: newCust.rows[0]?.c ?? 0,
      reconciliationStatus,
      todayDiscrepancyCashCents: rec?.discrepancyCashCents ?? null,
      lastConfirmedDiscrepancy: last,
    })
  })

  app.get('/api/owner/business/combined-metrics', requireRole('owner'), async (req, res) => {
    const schema = z
      .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' })

    const today = getLocalDayDate()
    const end = parsed.data.end ?? today
    const start = parsed.data.start ?? addDays(end, -29)
    if (start > end) return res.status(400).json({ error: 'invalid_range' })
    const days = listDaysBetween(start, end)
    if (days.length === 0) return res.status(400).json({ error: 'invalid_range' })
    if (days.length > 366) return res.status(400).json({ error: 'range_too_large' })

    const dayDate = today
    const monthStart = startOfMonth(dayDate)
    const monthTargetCents = Number(process.env.MONTHLY_REVENUE_TARGET_CENTS ?? 0) || 0

    const [todayTotals, monthRows, dailyRows, weeklyRows, monthlyRows] = await Promise.all([
      fetchCombinedToday(dayDate),
      fetchCombinedDailyByRange(monthStart, dayDate),
      fetchCombinedDailyByRange(start, end),
      fetchCombinedWeeklyByRange(addDays(end, -120), end),
      fetchCombinedMonthlyByRange(addDays(end, -365), end),
    ])

    const monthRevenueCents = monthRows.reduce((sum, r) => sum + (r.totalRevenueCents ?? 0), 0)
    const monthProgressPct = monthTargetCents > 0 ? Math.round((monthRevenueCents / monthTargetCents) * 1000) / 10 : null

    const peakDays = [...dailyRows]
      .sort((a, b) => (b.totalRevenueCents ?? 0) - (a.totalRevenueCents ?? 0))
      .slice(0, 7)
      .map((r) => ({ dayDate: r.dayDate, totalRevenueCents: r.totalRevenueCents }))

    const now = new Date()
    const hourUtc = now.getUTCHours()
    const { avgProgress } = await fetchCombinedEndOfDayEstimate(dayDate, hourUtc, 42)
    const estimatedEndOfDayRevenueCents = avgProgress ? Math.round((todayTotals.combined.revenueCents ?? 0) / avgProgress) : null

    const weekdayStats = new Map()
    for (const r of dailyRows) {
      const dt = new Date(`${r.dayDate}T00:00:00.000Z`)
      const dow = dt.getUTCDay()
      const v = r.totalRevenueCents ?? 0
      const cur = weekdayStats.get(dow) ?? { sum: 0, count: 0 }
      cur.sum += v
      cur.count += 1
      weekdayStats.set(dow, cur)
    }
    const weekdayAverages = Array.from(weekdayStats.entries()).map(([dow, v]) => ({
      dow,
      avgRevenueCents: v.count ? Math.round(v.sum / v.count) : 0,
    }))
    weekdayAverages.sort((a, b) => b.avgRevenueCents - a.avgRevenueCents)
    const predictedBusyDays = weekdayAverages.slice(0, 2)
    const predictedSlowDays = [...weekdayAverages].reverse().slice(0, 2)

    const next7 = []
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(dayDate, i)
      const dt = new Date(`${d}T00:00:00.000Z`)
      const dow = dt.getUTCDay()
      const avg = weekdayAverages.find((x) => x.dow === dow)?.avgRevenueCents ?? 0
      next7.push({ dayDate: d, expectedRevenueCents: avg })
    }

    res.json({
      range: { start, end, days: days.length },
      today: {
        dayDate,
        totalRevenueCents: todayTotals.combined.revenueCents,
        totalTransactions: todayTotals.combined.txCount,
        carWashRevenueCents: todayTotals.carWash.revenueCents,
        kitchenRevenueCents: todayTotals.kitchen.revenueCents,
        carWashTransactions: todayTotals.carWash.txCount,
        kitchenTransactions: todayTotals.kitchen.txCount,
      },
      monthToDate: {
        start: monthStart,
        end: dayDate,
        revenueCents: monthRevenueCents,
        targetCents: monthTargetCents > 0 ? monthTargetCents : null,
        progressPct: monthProgressPct,
      },
      estimate: {
        asOf: now.toISOString(),
        avgProgress: avgProgress ?? null,
        estimatedEndOfDayRevenueCents,
      },
      trends: {
        daily: dailyRows,
        weekly: weeklyRows,
        monthly: monthlyRows,
      },
      comparison: {
        carWashRevenueCents: dailyRows.reduce((sum, r) => sum + (r.carWashRevenueCents ?? 0), 0),
        kitchenRevenueCents: dailyRows.reduce((sum, r) => sum + (r.kitchenRevenueCents ?? 0), 0),
      },
      peakDays,
      forecast: {
        next7Days: next7,
        predictedBusyDays,
        predictedSlowDays,
      },
    })
  })

  app.get('/api/owner/kitchen/today-metrics', requireRole('owner'), async (_req, res) => {
    const dayDate = getLocalDayDate()
    const [totals, mealsSold, mostOrderedMeal] = await Promise.all([
      fetchKitchenTotalsForDay(dayDate),
      fetchKitchenMealsSoldForDay(dayDate),
      fetchKitchenMostOrderedMealForDay(dayDate),
    ])
    res.json({
      dayDate,
      ordersCount: totals.ordersCount ?? 0,
      revenueCents: totals.revenueCents ?? 0,
      mostOrderedMeal,
      mealsSold,
    })
  })

  app.get('/api/owner/kitchen/analytics', requireRole('owner'), async (req, res) => {
    const schema = z
      .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .strict()
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' })

    const start = parsed.data.start
    const end = parsed.data.end
    if (start > end) return res.status(400).json({ error: 'invalid_range' })
    const days = listDaysBetween(start, end)
    if (days.length === 0) return res.status(400).json({ error: 'invalid_range' })
    if (days.length > 366) return res.status(400).json({ error: 'range_too_large' })

    const [summary, topMeals, topDrinks, steakQty, hardbodyQty] = await Promise.all([
      fetchKitchenSummaryByRange(start, end),
      fetchKitchenTopItemsByCategory(start, end, 'meal', 10),
      fetchKitchenTopItemsByCategory(start, end, 'drink', 10),
      fetchKitchenQtyForItemName(start, end, 'Steak'),
      fetchKitchenQtyForItemName(start, end, 'Hardbody Chicken'),
    ])

    res.json({
      range: { start, end, days: days.length },
      summary,
      topMeals,
      topDrinks,
      spotlight: {
        steakQty,
        hardbodyChickenQty: hardbodyQty,
        drinksSold: summary.drinksSold ?? 0,
      },
    })
  })

  app.get('/api/owner/history', requireRole('owner'), async (req, res) => {
    const daysParam = Number(req.query.days)
    const days = clampInt(daysParam, { min: 7, max: 90 })
    const dayDates = listLastDays(days)
    const start = dayDates[0]
    const end = dayDates[dayDates.length - 1]
    const ticketTotals = new Map((await fetchTicketTotalsByDayRange(start, end)).map((r) => [r.dayDate, r]))
    const recs = new Map((await fetchReconciliationsByDayRange(start, end)).map((r) => [r.dayDate, r]))

    const rows = dayDates
      .map((d) => {
        const tt = ticketTotals.get(d) ?? { ticketsCount: 0, expectedRevenueCents: 0 }
        const rec = recs.get(d) ?? null
        let status = 'pending'
        if (rec?.cashierSubmittedAt && !rec?.ownerConfirmedAt) status = 'cashier_submitted'
        if (rec?.ownerConfirmedAt) status = 'confirmed'

        return {
          dayDate: d,
          ticketsCount: tt.ticketsCount,
          expectedRevenueCents: tt.expectedRevenueCents,
          declaredCashCents: rec?.declaredCashCents ?? null,
          discrepancyCashCents: rec?.discrepancyCashCents ?? null,
          status,
        }
      })

    res.json({ days, rows })
  })

  app.get('/api/owner/reports', requireRole('owner'), async (req, res) => {
    const schema = z
      .object({
        start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        type: z.string().optional(),
        group: z.enum(['day', 'week', 'month']).optional(),
      })
      .strict()
    const parsed = schema.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_query' })

    const today = getLocalDayDate()
    const end = parsed.data.end ?? today
    const start = parsed.data.start ?? addDays(end, -29)

    if (start > end) return res.status(400).json({ error: 'invalid_range' })
    const days = listDaysBetween(start, end)
    if (days.length === 0) return res.status(400).json({ error: 'invalid_range' })
    if (days.length > 120) return res.status(400).json({ error: 'range_too_large' })

    const group = parsed.data.group ?? 'day'
    const [totals, cashTotals, repeat, serviceRows, hourRows, paymentRows, vehicleRows, customerOverview, customerFrequency, topCustomers, recRows, ticketsByDayRows] =
      await Promise.all([
      fetchReportsTotals(start, end),
      fetchReportsCashTotals(start, end),
      fetchReportsRepeatPlatesCount(start, end),
      fetchReportsServiceRows(start, end),
      fetchReportsHourRows(start, end),
      fetchReportsPaymentRows(start, end),
      fetchReportsVehicleRows(start, end),
      fetchReportsCustomerOverview(start, end),
      fetchReportsCustomerFrequency(start, end),
      fetchReportsTopCustomers(start, end, 10),
      fetchReportsReconciliationRows(start, end),
      fetchTicketsByDayRows(start, end),
    ])

    const peakHours = buildPeakHours(hourRows)
    const recMap = new Map(recRows.map((r) => [r.dayDate, r]))
    const ticketsByDay = new Map(ticketsByDayRows.map((r) => [r.dayDate, r]))
    const { series, statusCounts } = buildReportSeries({ days, group, ticketsByDay, recMap })

    const totalTickets = totals.ticketsCount ?? 0
    const totalRevenueCents = totals.totalRevenueCents ?? 0
    const avgTicketCents = totalTickets > 0 ? Math.round(totalRevenueCents / totalTickets) : 0
    const expectedCashCents = cashTotals.expectedCashCents ?? 0
    const declaredCashCents = cashTotals.declaredCashCents ?? 0
    const discrepancyCashCents = cashTotals.discrepancyCashCents ?? 0
    const leakagePct = expectedCashCents > 0 ? Math.round((Math.abs(discrepancyCashCents) / expectedCashCents) * 1000) / 10 : 0
    const repeatPlatesCount = repeat.repeatPlatesCount ?? 0
    const uniquePlatesCount = totals.uniquePlatesCount ?? 0
    const repeatRatePct = uniquePlatesCount > 0 ? Math.round((repeatPlatesCount / uniquePlatesCount) * 1000) / 10 : 0

    res.json({
      range: { start, end, days: days.length },
      type: parsed.data.type ?? 'overview',
      group,
      summary: {
        totalTickets,
        totalRevenueCents,
        avgTicketCents,
        uniquePlatesCount,
      },
      financial: {
        expectedCashCents,
        declaredCashCents,
        discrepancyCashCents,
        leakagePct,
      },
      behavioral: {
        repeatPlatesCount,
        repeatRatePct,
        peakHours,
        preferredServices: serviceRows,
        vehicleDistribution: vehicleRows,
      },
      customers: {
        overview: customerOverview,
        visitFrequency: customerFrequency,
        topReturningCustomers: topCustomers,
      },
      statusCounts,
      paymentBreakdown: paymentRows,
      series,
    })
  })

  app.get('/api/owner/day/:dayDate', requireRole('owner'), async (req, res) => {
    const schema = z.object({ dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' })

    const dayDate = parsed.data.dayDate
    const [tickets, reconciliation] = await Promise.all([fetchOwnerDayTickets(dayDate), fetchOwnerDayReconciliation(dayDate)])
    res.json({ dayDate, tickets, reconciliation })
  })

  app.get('/api/owner/cash-audit/:dayDate', requireRole('owner'), async (req, res) => {
    const schema = z.object({ dayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
    const parsed = schema.safeParse(req.params)
    if (!parsed.success) return res.status(400).json({ error: 'invalid_date' })
    const dayDate = parsed.data.dayDate
    const rows = await fetchCashAuditRows(dayDate)
    const active = rows.filter((r) => !r.voidedAt)
    let expectedRevenueCents = 0
    let expectedCashCents = 0
    for (const r of active) {
      expectedRevenueCents += r.priceCents
      if (r.paymentMethod === 'cash') expectedCashCents += r.priceCents
    }

    const ticketNumbers = rows.map((r) => r.ticketNumber)
    const minTicket = ticketNumbers.length ? Math.min(...ticketNumbers) : null
    const maxTicket = ticketNumbers.length ? Math.max(...ticketNumbers) : null
    const set = new Set(ticketNumbers)
    const missing = []
    if (minTicket !== null && maxTicket !== null) {
      for (let n = minTicket; n <= maxTicket; n += 1) {
        if (!set.has(n)) missing.push(n)
        if (missing.length >= 200) break
      }
    }

    const flagged = rows
      .filter((r) => r.priceOverridden || (r.discountCents ?? 0) > 0 || r.voidedAt)
      .slice(0, 200)

    res.json({
      dayDate,
      summary: {
        ticketsCount: active.length,
        expectedRevenueCents,
        expectedCashCents,
        minTicketNumber: minTicket,
        maxTicketNumber: maxTicket,
        missingTicketNumbers: missing,
        overridesCount: rows.filter((r) => r.priceOverridden).length,
        discountsCount: rows.filter((r) => (r.discountCents ?? 0) > 0).length,
        voidedCount: rows.filter((r) => r.voidedAt).length,
      },
      flaggedTickets: flagged,
    })
  })
}
