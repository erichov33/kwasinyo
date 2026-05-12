import { z } from 'zod'
import { requireRole } from '../auth.js'
import { clampInt, getLocalDayDate } from '../util.js'
import { addDays, buildPeakHours, buildReportSeries, listDaysBetween, listLastDays } from '../services/ownerService.js'
import {
  fetchCashAuditRows,
  fetchLastConfirmedDiscrepancy,
  fetchOwnerDayReconciliation,
  fetchOwnerDayTickets,
  fetchReconciliationForDay,
  fetchReconciliationsByDayRange,
  fetchReportsCashTotals,
  fetchReportsHourRows,
  fetchReportsPaymentRows,
  fetchReportsReconciliationRows,
  fetchReportsRepeatPlatesCount,
  fetchReportsServiceRows,
  fetchReportsTotals,
  fetchTicketTotalsByDayRange,
  fetchTicketTotalsForDay,
  fetchTicketsByDayRows,
} from '../repos/ownerRepo.js'

export function attachOwnerRoutes(app) {
  app.get('/api/owner/today-snapshot', requireRole('owner'), async (_req, res) => {
    const dayDate = getLocalDayDate()
    const totals = await fetchTicketTotalsForDay(dayDate)
    const rec = await fetchReconciliationForDay(dayDate)

    let reconciliationStatus = 'pending'
    if (rec?.cashierSubmittedAt && !rec?.ownerConfirmedAt) reconciliationStatus = 'cashier_submitted'
    if (rec?.ownerConfirmedAt) reconciliationStatus = 'confirmed'

    const last = await fetchLastConfirmedDiscrepancy()

    res.json({
      dayDate,
      carsWashedToday: totals.ticketsCount ?? 0,
      expectedRevenueTodayCents: totals.expectedRevenueCents ?? 0,
      reconciliationStatus,
      todayDiscrepancyCashCents: rec?.discrepancyCashCents ?? null,
      lastConfirmedDiscrepancy: last,
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
    const [
      totals,
      cashTotals,
      repeat,
      serviceRows,
      hourRows,
      paymentRows,
      recRows,
      ticketsByDayRows,
    ] = await Promise.all([
      fetchReportsTotals(start, end),
      fetchReportsCashTotals(start, end),
      fetchReportsRepeatPlatesCount(start, end),
      fetchReportsServiceRows(start, end),
      fetchReportsHourRows(start, end),
      fetchReportsPaymentRows(start, end),
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
