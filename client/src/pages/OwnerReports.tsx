import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { BarChart } from '../components/BarChart'
import { DivergingBarChart } from '../components/DivergingBarChart'
import { api } from '../lib/api'
import { formatMoneyCents } from '../lib/money'
import { ownerNav } from '../lib/nav'

type SeriesRow = {
  key: string
  label: string
  start: string
  end: string
  ticketsCount: number
  revenueCents: number
  discrepancyCashCents: number | null
  status: 'pending' | 'cashier_submitted' | 'confirmed'
}

type ReportsRes = {
  range: { start: string; end: string; days: number }
  type: string
  group: 'day' | 'week' | 'month'
  summary: {
    totalTickets: number
    totalRevenueCents: number
    avgTicketCents: number
    uniquePlatesCount: number
  }
  financial: {
    expectedCashCents: number
    declaredCashCents: number
    discrepancyCashCents: number
    leakagePct: number
  }
  behavioral: {
    repeatPlatesCount: number
    repeatRatePct: number
    peakHours: Array<{ hour: number; ticketsCount: number; revenueCents: number }>
    preferredServices: Array<{ serviceTypeName: string; ticketsCount: number; revenueCents: number }>
    vehicleDistribution: Array<{ vehicleTypeName: string; ticketsCount: number; revenueCents: number }>
  }
  customers: {
    overview: { customersVisited: number; newCustomers: number; returningCustomers: number; avgVisitsPerCustomer: number }
    visitFrequency: { once: number; twoToThree: number; fourToNine: number; tenPlus: number }
    topReturningCustomers: Array<{
      customerId: number
      name: string
      phone: string | null
      visits: number
      revenueCents: number
      lastVisitAt: string | null
    }>
  }
  statusCounts: {
    pending: number
    cashier_submitted: number
    confirmed: number
  }
  paymentBreakdown: Array<{ paymentMethod: string; ticketsCount: number; revenueCents: number }>
  series: SeriesRow[]
}

type KitchenTodayRes = {
  dayDate: string
  ordersCount: number
  revenueCents: number
  mostOrderedMeal: string | null
  mealsSold: number
}

type KitchenAnalyticsRes = {
  range: { start: string; end: string; days: number }
  summary: { ordersCount: number; revenueCents: number; mealsSold: number; drinksSold: number }
  topMeals: Array<{ itemName: string; qtySold: number; revenueCents: number }>
  topDrinks: Array<{ itemName: string; qtySold: number; revenueCents: number }>
  spotlight: { steakQty: number; hardbodyChickenQty: number; drinksSold: number }
}

type CombinedMetricsRes = {
  range: { start: string; end: string; days: number }
  today: {
    dayDate: string
    totalRevenueCents: number
    totalTransactions: number
    carWashRevenueCents: number
    kitchenRevenueCents: number
    carWashTransactions: number
    kitchenTransactions: number
  }
  monthToDate: { start: string; end: string; revenueCents: number; targetCents: number | null; progressPct: number | null }
  estimate: { asOf: string; avgProgress: number | null; estimatedEndOfDayRevenueCents: number | null }
  trends: {
    daily: Array<{
      dayDate: string
      carWashTxCount: number
      carWashRevenueCents: number
      kitchenTxCount: number
      kitchenRevenueCents: number
      totalTxCount: number
      totalRevenueCents: number
    }>
    weekly: Array<{ weekStart: string; carWashRevenueCents: number; kitchenRevenueCents: number; totalRevenueCents: number }>
    monthly: Array<{ monthStart: string; carWashRevenueCents: number; kitchenRevenueCents: number; totalRevenueCents: number }>
  }
  comparison: { carWashRevenueCents: number; kitchenRevenueCents: number }
  peakDays: Array<{ dayDate: string; totalRevenueCents: number }>
  forecast: {
    next7Days: Array<{ dayDate: string; expectedRevenueCents: number }>
    predictedBusyDays: Array<{ dow: number; avgRevenueCents: number }>
    predictedSlowDays: Array<{ dow: number; avgRevenueCents: number }>
  }
}

function isoDayDate(dt: Date) {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDaysIso(dayDate: string, delta: number) {
  const [y, m, d] = dayDate.split('-').map((n) => Number(n))
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return isoDayDate(dt)
}

export function OwnerReports() {
  const today = useMemo(() => isoDayDate(new Date()), [])
  const defaultStart = useMemo(() => addDaysIso(today, -90), [today])

  const [start, setStart] = useState(defaultStart)
  const [end, setEnd] = useState(today)
  const [type, setType] = useState<'overview'>('overview')
  const [group, setGroup] = useState<'day' | 'week' | 'month'>('day')
  const [data, setData] = useState<ReportsRes | null>(null)
  const [todayData, setTodayData] = useState<ReportsRes | null>(null)
  const [kitchenToday, setKitchenToday] = useState<KitchenTodayRes | null>(null)
  const [kitchenAnalytics, setKitchenAnalytics] = useState<KitchenAnalyticsRes | null>(null)
  const [combined, setCombined] = useState<CombinedMetricsRes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (next?: { start: string; end: string; type: string; group: 'day' | 'week' | 'month' }) => {
    const s = next?.start ?? start
    const e = next?.end ?? end
    const t = next?.type ?? type
    const g = next?.group ?? group
    setLoading(true)
    setError(null)
    try {
      const res = await api<ReportsRes>(
        `/api/owner/reports?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}&type=${encodeURIComponent(t)}&group=${encodeURIComponent(g)}`,
      )
      setData(res)
    } catch (err: any) {
      setError(err?.message ?? 'load_failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load({ start: defaultStart, end: today, type: 'overview', group: 'day' })
  }, [defaultStart, today])

  useEffect(() => {
    api<ReportsRes>(`/api/owner/reports?start=${encodeURIComponent(today)}&end=${encodeURIComponent(today)}&type=overview&group=day`)
      .then((res) => setTodayData(res))
      .catch(() => setTodayData(null))
  }, [today])

  useEffect(() => {
    api<KitchenTodayRes>('/api/owner/kitchen/today-metrics')
      .then((res) => setKitchenToday(res))
      .catch(() => setKitchenToday(null))
  }, [])

  useEffect(() => {
    if (!data) {
      setKitchenAnalytics(null)
      return
    }
    api<KitchenAnalyticsRes>(
      `/api/owner/kitchen/analytics?start=${encodeURIComponent(data.range.start)}&end=${encodeURIComponent(data.range.end)}`,
    )
      .then((res) => setKitchenAnalytics(res))
      .catch(() => setKitchenAnalytics(null))
  }, [data?.range.start, data?.range.end])

  useEffect(() => {
    const s = data?.range.start ?? defaultStart
    const e = data?.range.end ?? today
    api<CombinedMetricsRes>(`/api/owner/business/combined-metrics?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}`)
      .then((res) => setCombined(res))
      .catch(() => setCombined(null))
  }, [data?.range.start, data?.range.end, defaultStart, today])

  const todayMostPopularWash = useMemo(() => {
    const rows = todayData?.behavioral.preferredServices ?? []
    const max = rows.reduce(
      (acc, r) => (r.ticketsCount > acc.ticketsCount ? r : acc),
      { serviceTypeName: '—', ticketsCount: -1, revenueCents: 0 },
    )
    return max.ticketsCount >= 0 ? max.serviceTypeName : '—'
  }, [todayData])

  const todayRepeatCustomerPct = useMemo(() => {
    const o = todayData?.customers.overview
    if (!o || o.customersVisited <= 0) return null
    return Math.round((o.returningCustomers / o.customersVisited) * 1000) / 10
  }, [todayData])

  const todayPayment = useMemo(() => {
    const rows = todayData?.paymentBreakdown ?? []
    let cash = 0
    let card = 0
    let total = 0
    for (const r of rows) {
      total += r.revenueCents
      if (r.paymentMethod === 'cash') cash += r.revenueCents
      if (r.paymentMethod === 'card') card += r.revenueCents
    }
    const cashPct = total > 0 ? Math.round((cash / total) * 1000) / 10 : null
    const cardPct = total > 0 ? Math.round((card / total) * 1000) / 10 : null
    return { cash, card, total, cashPct, cardPct }
  }, [todayData])

  const rangePayment = useMemo(() => {
    const rows = data?.paymentBreakdown ?? []
    let cash = 0
    let card = 0
    let total = 0
    for (const r of rows) {
      total += r.revenueCents
      if (r.paymentMethod === 'cash') cash += r.revenueCents
      if (r.paymentMethod === 'card') card += r.revenueCents
    }
    const cashPct = total > 0 ? Math.round((cash / total) * 1000) / 10 : null
    const cardPct = total > 0 ? Math.round((card / total) * 1000) / 10 : null
    return { cash, card, total, cashPct, cardPct }
  }, [data])

  const revenuePoints = useMemo(
    () => (data?.series ?? []).map((r) => ({ label: r.label, value: r.revenueCents })),
    [data],
  )

  const peakHourPoints = useMemo(
    () => (data?.behavioral.peakHours ?? []).map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.ticketsCount })),
    [data],
  )

  const volumePoints = useMemo(
    () => (data?.series ?? []).map((r) => ({ label: r.label, value: r.ticketsCount })),
    [data],
  )

  const discrepancyPoints = useMemo(
    () => (data?.series ?? []).map((r) => ({ label: r.label, value: r.discrepancyCashCents ?? 0 })),
    [data],
  )

  const topServices = useMemo(() => {
    const list = data?.behavioral.preferredServices ?? []
    return list.slice(0, 6)
  }, [data])

  const totalServiceTickets = useMemo(() => {
    const list = data?.behavioral.preferredServices ?? []
    return list.reduce((sum, r) => sum + (r.ticketsCount ?? 0), 0)
  }, [data])

  const serviceMix = useMemo(() => {
    const list = data?.behavioral.preferredServices ?? []
    const total = Math.max(1, list.reduce((sum, r) => sum + (r.ticketsCount ?? 0), 0))
    return list
      .map((r) => ({
        name: r.serviceTypeName,
        ticketsCount: r.ticketsCount,
        pct: Math.round((r.ticketsCount / total) * 1000) / 10,
      }))
      .sort((a, b) => b.ticketsCount - a.ticketsCount)
      .slice(0, 6)
  }, [data])

  const vehicleMix = useMemo(() => {
    const list = data?.behavioral.vehicleDistribution ?? []
    const total = Math.max(1, list.reduce((sum, r) => sum + (r.ticketsCount ?? 0), 0))
    return list
      .map((r) => ({
        name: r.vehicleTypeName,
        ticketsCount: r.ticketsCount,
        pct: Math.round((r.ticketsCount / total) * 1000) / 10,
      }))
      .sort((a, b) => b.ticketsCount - a.ticketsCount)
      .slice(0, 6)
  }, [data])

  const maxMixTickets = useMemo(() => Math.max(1, ...serviceMix.map((x) => x.ticketsCount), ...vehicleMix.map((x) => x.ticketsCount)), [serviceMix, vehicleMix])

  const kitchenTopMeals = useMemo(() => (kitchenAnalytics?.topMeals ?? []).slice(0, 6), [kitchenAnalytics])
  const kitchenTopDrinks = useMemo(() => (kitchenAnalytics?.topDrinks ?? []).slice(0, 6), [kitchenAnalytics])
  const maxKitchenQty = useMemo(
    () => Math.max(1, ...kitchenTopMeals.map((x) => x.qtySold), ...kitchenTopDrinks.map((x) => x.qtySold)),
    [kitchenTopMeals, kitchenTopDrinks],
  )

  const kitchenSpotlightPoints = useMemo(() => {
    const s = kitchenAnalytics?.spotlight
    if (!s) return []
    return [
      { label: 'Steak', value: s.steakQty ?? 0 },
      { label: 'Hardbody', value: s.hardbodyChickenQty ?? 0 },
      { label: 'Drinks', value: s.drinksSold ?? 0 },
    ]
  }, [kitchenAnalytics])

  const combinedDailyPoints = useMemo(
    () => (combined?.trends.daily ?? []).map((r) => ({ label: r.dayDate, value: r.totalRevenueCents ?? 0 })),
    [combined],
  )
  const combinedWeeklyPoints = useMemo(
    () => (combined?.trends.weekly ?? []).map((r) => ({ label: r.weekStart, value: r.totalRevenueCents ?? 0 })),
    [combined],
  )
  const combinedMonthlyPoints = useMemo(
    () => (combined?.trends.monthly ?? []).map((r) => ({ label: r.monthStart, value: r.totalRevenueCents ?? 0 })),
    [combined],
  )
  const comparisonPoints = useMemo(() => {
    if (!combined) return []
    return [
      { label: 'Car Wash', value: combined.comparison.carWashRevenueCents ?? 0 },
      { label: 'Kitchen', value: combined.comparison.kitchenRevenueCents ?? 0 },
    ]
  }, [combined])
  const peakDaysPoints = useMemo(
    () => (combined?.peakDays ?? []).map((r) => ({ label: r.dayDate, value: r.totalRevenueCents ?? 0 })),
    [combined],
  )
  const forecast7Points = useMemo(
    () => (combined?.forecast.next7Days ?? []).map((r) => ({ label: r.dayDate, value: r.expectedRevenueCents ?? 0 })),
    [combined],
  )
  const dowLabel = (dow: number) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow] ?? String(dow)
  const avgDailyRevenueInRange = useMemo(() => {
    const rows = combined?.trends.daily ?? []
    if (!rows.length) return null
    const sum = rows.reduce((a, r) => a + (r.totalRevenueCents ?? 0), 0)
    return Math.round(sum / rows.length)
  }, [combined])

  const maxServiceRevenue = useMemo(() => {
    const list = topServices
    return Math.max(1, ...list.map((s) => s.revenueCents))
  }, [topServices])

  const maxStatus = useMemo(() => {
    const sc = data?.statusCounts
    if (!sc) return 1
    return Math.max(1, sc.pending, sc.cashier_submitted, sc.confirmed)
  }, [data])

  const exportCsv = () => {
    if (!data) return
    const lines: string[] = []
    lines.push(['Start', data.range.start].join(','))
    lines.push(['End', data.range.end].join(','))
    lines.push(['Group', data.group].join(','))
    lines.push(['Total Tickets', String(data.summary.totalTickets)].join(','))
    lines.push(['Total Revenue', String(data.summary.totalRevenueCents)].join(','))
    lines.push(['Avg Ticket', String(data.summary.avgTicketCents)].join(','))
    lines.push(['Unique Plates', String(data.summary.uniquePlatesCount)].join(','))
    lines.push(['Expected Cash', String(data.financial.expectedCashCents)].join(','))
    lines.push(['Declared Cash', String(data.financial.declaredCashCents)].join(','))
    lines.push(['Discrepancy Cash', String(data.financial.discrepancyCashCents)].join(','))
    lines.push(['Leakage %', String(data.financial.leakagePct)].join(','))
    lines.push('')
    lines.push(['Bucket', 'Start', 'End', 'Tickets', 'RevenueCents', 'DiscrepancyCashCents', 'Status'].join(','))
    for (const r of data.series) {
      lines.push(
        [
          r.label,
          r.start,
          r.end,
          String(r.ticketsCount),
          String(r.revenueCents),
          String(r.discrepancyCashCents ?? ''),
          r.status,
        ].join(','),
      )
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kwasinyo-reports-${data.range.start}-to-${data.range.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppShell section="Reports" nav={ownerNav}>
      <div className="shellInner stack">
        {combined ? (
          <div className="card">
            <div className="row">
              <div>
                <h2 className="h2">Combined Business Metrics</h2>
                <div className="muted">{combined.today.dayDate}</div>
              </div>
            </div>
            <div className="statRow">
              <div className="statCard">
                <div className="statCard__label">Total revenue today</div>
                <div className="statCard__value">{formatMoneyCents(combined.today.totalRevenueCents)}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Total transactions today</div>
                <div className="statCard__value">{combined.today.totalTransactions}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Combined monthly revenue</div>
                <div className="statCard__value">{formatMoneyCents(combined.monthToDate.revenueCents)}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Revenue target progress %</div>
                <div className="statCard__value">
                  {combined.monthToDate.progressPct === null ? '—' : `${combined.monthToDate.progressPct.toFixed(1)}%`}
                </div>
              </div>
            </div>
            <div className="grid2">
              <div className="stat">
                <div className="muted">Estimated end-of-day revenue</div>
                <div className="big">
                  {combined.estimate.estimatedEndOfDayRevenueCents === null
                    ? '—'
                    : formatMoneyCents(combined.estimate.estimatedEndOfDayRevenueCents)}
                </div>
                <div className="muted tiny">{combined.estimate.avgProgress === null ? 'Needs more history' : `Based on historical progress (${Math.round(combined.estimate.avgProgress * 100)}%)`}</div>
              </div>
              <div className="stat">
                <div className="muted">Revenue comparison (range)</div>
                <div className="big">
                  {formatMoneyCents(combined.comparison.carWashRevenueCents)} · {formatMoneyCents(combined.comparison.kitchenRevenueCents)}
                </div>
                <div className="muted tiny">Car Wash vs Kitchen</div>
              </div>
            </div>
          </div>
        ) : null}

        {todayData ? (
          <div className="card">
            <div className="row">
              <div>
                <h2 className="h2">Car Wash Metrics</h2>
                <div className="muted">{today}</div>
              </div>
            </div>
            <div className="statRow">
              <div className="statCard">
                <div className="statCard__label">Today’s tickets</div>
                <div className="statCard__value">{todayData.summary.totalTickets}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Today’s revenue</div>
                <div className="statCard__value">{formatMoneyCents(todayData.summary.totalRevenueCents)}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Most popular wash</div>
                <div className="statCard__value">{todayMostPopularWash}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">New customers today</div>
                <div className="statCard__value">{todayData.customers.overview.newCustomers}</div>
              </div>
            </div>
            <div className="grid2">
              <div className="stat">
                <div className="muted">Repeat customer %</div>
                <div className="big">{todayRepeatCustomerPct === null ? '—' : `${todayRepeatCustomerPct.toFixed(1)}%`}</div>
                <div className="muted tiny">Returning / customers visited today</div>
              </div>
              <div className="stat">
                <div className="muted">Payment method split</div>
                <div className="big">
                  {todayPayment.cashPct === null || todayPayment.cardPct === null ? '—' : `Cash ${todayPayment.cashPct.toFixed(1)}% · Card ${todayPayment.cardPct.toFixed(1)}%`}
                </div>
                <div className="muted tiny">{todayPayment.total > 0 ? `${formatMoneyCents(todayPayment.cash)} cash · ${formatMoneyCents(todayPayment.card)} card` : '—'}</div>
              </div>
            </div>
          </div>
        ) : null}

        {kitchenToday ? (
          <div className="card">
            <div className="row">
              <div>
                <h2 className="h2">Kitchen Metrics</h2>
                <div className="muted">{kitchenToday.dayDate}</div>
              </div>
            </div>
            <div className="statRow">
              <div className="statCard">
                <div className="statCard__label">Today’s orders</div>
                <div className="statCard__value">{kitchenToday.ordersCount}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Today’s kitchen revenue</div>
                <div className="statCard__value">{formatMoneyCents(kitchenToday.revenueCents)}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Most ordered meal</div>
                <div className="statCard__value">{kitchenToday.mostOrderedMeal ?? '—'}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Total meals sold today</div>
                <div className="statCard__value">{kitchenToday.mealsSold}</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="row">
            <div>
              <h1 className="h1">Reports & Analytics</h1>
              <div className="muted">Business insights and performance metrics</div>
            </div>
            <div className="row">
              <button type="button" className="btn btn--outline btn--small" onClick={() => exportCsv()} disabled={!data}>
                Export Report
              </button>
              <button type="button" className="btn btn--outline btn--small" onClick={() => window.print()}>
                Print Report
              </button>
            </div>
          </div>

          <div className="filterBar">
            <div className="filterBar__grid">
              <div className="field">
                <label>Start Date</label>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label>End Date</label>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <div className="field">
                <label>Report Type</label>
                <select className="select" value={type} onChange={(e) => setType(e.target.value as any)}>
                  <option value="overview">Overview</option>
                </select>
              </div>
              <div className="field">
                <label>Group by</label>
                <select className="select" value={group} onChange={(e) => setGroup(e.target.value as any)}>
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                </select>
              </div>
              <div className="field filterBar__action">
                <label>&nbsp;</label>
                <button type="button" className="btn btn--solid btn--small" onClick={() => load()} disabled={loading}>
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>

        {combined ? (
          <div className="dashGrid">
            <div className="card">
              <div className="row">
                <h2 className="h2">Revenue & Sales analytics</h2>
                <div className="muted">Daily revenue trend</div>
              </div>
              <BarChart points={combinedDailyPoints} />
            </div>
            <div className="card">
              <div className="row">
                <h2 className="h2">Weekly revenue trend</h2>
                <div className="muted">Combined</div>
              </div>
              <BarChart points={combinedWeeklyPoints} />
            </div>
          </div>
        ) : null}

        {combined ? (
          <div className="dashGrid">
            <div className="card">
              <div className="row">
                <h2 className="h2">Monthly revenue trend</h2>
                <div className="muted">Combined</div>
              </div>
              <BarChart points={combinedMonthlyPoints} />
            </div>
            <div className="card">
              <div className="row">
                <h2 className="h2">Revenue comparison</h2>
                <div className="muted">Car Wash vs Kitchen</div>
              </div>
              <BarChart points={comparisonPoints} height={140} />
              <div className="spacer12"></div>
              <div className="row">
                <div className="muted">Peak revenue days</div>
              </div>
              <BarChart points={peakDaysPoints} height={120} />
            </div>
          </div>
        ) : null}

        {combined ? (
          <div className="dashGrid">
            <div className="card">
              <div className="row">
                <h2 className="h2">Revenue Forecasting</h2>
                <div className="muted">Next 7 days (expected)</div>
              </div>
              <BarChart points={forecast7Points} />
              <div className="metaLine muted">
                Predicted busy days:{' '}
                {combined.forecast.predictedBusyDays.length
                  ? combined.forecast.predictedBusyDays.map((d) => `${dowLabel(d.dow)} (${formatMoneyCents(d.avgRevenueCents)})`).join(' · ')
                  : '—'}
              </div>
              <div className="metaLine muted">
                Predicted slow days:{' '}
                {combined.forecast.predictedSlowDays.length
                  ? combined.forecast.predictedSlowDays.map((d) => `${dowLabel(d.dow)} (${formatMoneyCents(d.avgRevenueCents)})`).join(' · ')
                  : '—'}
              </div>
            </div>
            <div className="card">
              <div className="row">
                <h2 className="h2">Expected Revenue</h2>
                <div className="muted">Based on historical weekday averages</div>
              </div>
              <div className="kv">
                <div className="kv__row">
                  <div className="muted">Expected End-of-Day Revenue</div>
                  <div className="big">
                    {combined.estimate.estimatedEndOfDayRevenueCents === null
                      ? '—'
                      : formatMoneyCents(combined.estimate.estimatedEndOfDayRevenueCents)}
                  </div>
                </div>
                <div className="kv__row">
                  <div className="muted">Expected Weekly Revenue</div>
                  <div className="big">
                    {avgDailyRevenueInRange === null ? '—' : formatMoneyCents(avgDailyRevenueInRange * 7)}
                  </div>
                </div>
                <div className="kv__row">
                  <div className="muted">Expected Monthly Revenue</div>
                  <div className="big">
                    {avgDailyRevenueInRange === null ? '—' : formatMoneyCents(avgDailyRevenueInRange * 30)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {error ? <div className="alert alert--bad">{error}</div> : null}

        {data ? (
          <div className="statRow">
            <div className="statCard">
              <div className="statCard__label">Total tickets</div>
              <div className="statCard__value">{data.summary.totalTickets}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Total revenue</div>
              <div className="statCard__value">{formatMoneyCents(data.summary.totalRevenueCents)}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Avg ticket</div>
              <div className="statCard__value">{formatMoneyCents(data.summary.avgTicketCents)}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Unique plates</div>
              <div className="statCard__value">{data.summary.uniquePlatesCount}</div>
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="statRow">
            <div className="statCard">
              <div className="statCard__label">Expected cash</div>
              <div className="statCard__value">{formatMoneyCents(data.financial.expectedCashCents)}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Declared cash</div>
              <div className="statCard__value">{formatMoneyCents(data.financial.declaredCashCents)}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Discrepancy</div>
              <div className="statCard__value">{formatMoneyCents(data.financial.discrepancyCashCents)}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Leakage %</div>
              <div className="statCard__value">{data.financial.expectedCashCents > 0 ? `${data.financial.leakagePct.toFixed(1)}%` : '—'}</div>
            </div>
          </div>
        ) : null}

        <div className="dashGrid">
          <div className="card">
            <div className="row">
              <h2 className="h2">Revenue Trend</h2>
              <div className="muted">
                {data ? `${data.range.start} → ${data.range.end}` : '—'}
              </div>
            </div>
            <BarChart points={revenuePoints} />
          </div>

          <div className="card">
            <h2 className="h2">Wash Volume</h2>
            <div className="muted">Cars washed per {data?.group ?? 'day'}</div>
            <BarChart points={volumePoints} />
          </div>
        </div>

        <div className="dashGrid">
          <div className="card">
            <h2 className="h2">Leakage / Discrepancy</h2>
            <div className="muted">Cash discrepancy per {data?.group ?? 'day'}</div>
            <DivergingBarChart points={discrepancyPoints} />
          </div>

          <div className="card">
            <h2 className="h2">Reconciliation Status</h2>
            <div className="muted">Buckets in range</div>
            {data ? (
              <div className="statusBars">
                <div className="statusRow">
                  <div className="statusRow__label">Pending</div>
                  <div className="statusRow__bar">
                    <div className="statusRow__fill statusRow__fill--neutral" style={{ width: `${(data.statusCounts.pending / maxStatus) * 100}%` }} />
                  </div>
                  <div className="statusRow__value">{data.statusCounts.pending}</div>
                </div>
                <div className="statusRow">
                  <div className="statusRow__label">Cashier submitted</div>
                  <div className="statusRow__bar">
                    <div className="statusRow__fill statusRow__fill--warn" style={{ width: `${(data.statusCounts.cashier_submitted / maxStatus) * 100}%` }} />
                  </div>
                  <div className="statusRow__value">{data.statusCounts.cashier_submitted}</div>
                </div>
                <div className="statusRow">
                  <div className="statusRow__label">Confirmed</div>
                  <div className="statusRow__bar">
                    <div className="statusRow__fill statusRow__fill--good" style={{ width: `${(data.statusCounts.confirmed / maxStatus) * 100}%` }} />
                  </div>
                  <div className="statusRow__value">{data.statusCounts.confirmed}</div>
                </div>
              </div>
            ) : (
              <div className="muted">No data.</div>
            )}
          </div>
        </div>

        <div className="dashGrid">
          <div className="card">
            <div className="row">
              <h2 className="h2">Peak Hours</h2>
              <div className="muted">Tickets per hour (server time)</div>
            </div>
            <BarChart points={peakHourPoints} />
          </div>

          <div className="card">
            <div className="row">
              <h2 className="h2">Preferred Services</h2>
              <div className="muted">Top services by revenue</div>
            </div>
            {topServices.length ? (
              <div className="miniBars">
                {topServices.map((s) => (
                  <div key={s.serviceTypeName} className="miniRow">
                    <div className="miniRow__label">{s.serviceTypeName}</div>
                    <div className="miniRow__bar">
                      <div className="miniRow__fill" style={{ width: `${(s.revenueCents / maxServiceRevenue) * 100}%` }} />
                    </div>
                    <div className="miniRow__value">{formatMoneyCents(s.revenueCents)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No data.</div>
            )}
            {data ? (
              <div className="metaLine muted">
                Repeat customers (by plate): {data.behavioral.repeatPlatesCount} ({data.behavioral.repeatRatePct.toFixed(1)}%)
              </div>
            ) : null}
          </div>
        </div>

        {data ? (
          <div className="dashGrid">
            <div className="card">
              <div className="row">
                <h2 className="h2">Wash Type Performance</h2>
                <div className="muted">{totalServiceTickets} tickets</div>
              </div>
              {serviceMix.length ? (
                <div className="miniBars">
                  {serviceMix.map((x) => (
                    <div key={x.name} className="miniRow">
                      <div className="miniRow__label">{x.name}</div>
                      <div className="miniRow__bar">
                        <div className="miniRow__fill" style={{ width: `${(x.ticketsCount / maxMixTickets) * 100}%` }} />
                      </div>
                      <div className="miniRow__value">{x.pct.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">No data.</div>
              )}
            </div>

            <div className="card">
              <div className="row">
                <h2 className="h2">Vehicle Type Distribution</h2>
                <div className="muted">SUV vs Sedan vs Bakkie</div>
              </div>
              {vehicleMix.length ? (
                <div className="miniBars">
                  {vehicleMix.map((x) => (
                    <div key={x.name} className="miniRow">
                      <div className="miniRow__label">{x.name}</div>
                      <div className="miniRow__bar">
                        <div className="miniRow__fill" style={{ width: `${(x.ticketsCount / maxMixTickets) * 100}%` }} />
                      </div>
                      <div className="miniRow__value">{x.pct.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">No data.</div>
              )}
            </div>
          </div>
        ) : null}

        {data ? (
          <div className="dashGrid">
            <div className="card">
              <div className="row">
                <h2 className="h2">Customer Analytics</h2>
                <div className="muted">New vs Returning</div>
              </div>
              <div className="grid2">
                <div className="stat">
                  <div className="muted">New customers</div>
                  <div className="big">{data.customers.overview.newCustomers}</div>
                </div>
                <div className="stat">
                  <div className="muted">Returning customers</div>
                  <div className="big">{data.customers.overview.returningCustomers}</div>
                </div>
              </div>
              <div className="grid2">
                <div className="stat">
                  <div className="muted">Customers visited</div>
                  <div className="big">{data.customers.overview.customersVisited}</div>
                </div>
                <div className="stat">
                  <div className="muted">Average visits per customer</div>
                  <div className="big">{data.customers.overview.avgVisitsPerCustomer}</div>
                </div>
              </div>
              <div className="metaLine muted">
                Visit frequency: 1 ({data.customers.visitFrequency.once}) · 2–3 ({data.customers.visitFrequency.twoToThree}) · 4–9 ({data.customers.visitFrequency.fourToNine}) · 10+ ({data.customers.visitFrequency.tenPlus})
              </div>
              <div className="metaLine muted">
                Payment method split:{' '}
                {rangePayment.cashPct === null || rangePayment.cardPct === null
                  ? '—'
                  : `Cash ${rangePayment.cashPct.toFixed(1)}% · Card ${rangePayment.cardPct.toFixed(1)}%`}
              </div>
            </div>

            <div className="card">
              <div className="row">
                <h2 className="h2">Top Returning Customers</h2>
                <div className="muted">By visits in range</div>
              </div>
              {data.customers.topReturningCustomers.length ? (
                <div className="table">
                  {data.customers.topReturningCustomers.map((c) => (
                    <div key={c.customerId} className="trow">
                      <div className="trow__cell">
                        <div className="trow__title">{c.name || `Customer #${c.customerId}`}</div>
                        <div className="trow__sub">{c.phone ?? '—'}</div>
                      </div>
                      <div className="trow__cell trow__right">
                        <div className="trow__title">{c.visits}</div>
                        <div className="trow__sub">visits</div>
                      </div>
                      <div className="trow__cell trow__right">
                        <div className="trow__title">{formatMoneyCents(c.revenueCents)}</div>
                        <div className="trow__sub">spend</div>
                      </div>
                      <div className="trow__cell">{c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString() : '—'}</div>
                      <div className="trow__cell trow__right"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">No data.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>
        {kitchenAnalytics ? (
          <div className="dashGrid">
            <div className="card">
              <div className="row">
                <h2 className="h2">Kitchen Analytics</h2>
                <div className="muted">
                  {kitchenAnalytics.range.start} → {kitchenAnalytics.range.end}
                </div>
              </div>
              <div className="grid2">
                <div className="stat">
                  <div className="muted">Orders</div>
                  <div className="big">{kitchenAnalytics.summary.ordersCount}</div>
                </div>
                <div className="stat">
                  <div className="muted">Revenue</div>
                  <div className="big">{formatMoneyCents(kitchenAnalytics.summary.revenueCents)}</div>
                </div>
              </div>
              <div className="grid2">
                <div className="stat">
                  <div className="muted">Meals sold</div>
                  <div className="big">{kitchenAnalytics.summary.mealsSold}</div>
                </div>
                <div className="stat">
                  <div className="muted">Drinks sold</div>
                  <div className="big">{kitchenAnalytics.summary.drinksSold}</div>
                </div>
              </div>
              {kitchenSpotlightPoints.length ? (
                <>
                  <div className="spacer12"></div>
                  <div className="muted">Example chart</div>
                  <BarChart points={kitchenSpotlightPoints} />
                </>
              ) : null}
            </div>

            <div className="card">
              <div className="row">
                <h2 className="h2">Menu Performance</h2>
                <div className="muted">Top selling items</div>
              </div>

              <div className="row">
                <div className="muted">Top Selling Food Items</div>
              </div>
              {kitchenTopMeals.length ? (
                <div className="miniBars">
                  {kitchenTopMeals.map((x) => (
                    <div key={x.itemName} className="miniRow">
                      <div className="miniRow__label">{x.itemName}</div>
                      <div className="miniRow__bar">
                        <div className="miniRow__fill" style={{ width: `${(x.qtySold / maxKitchenQty) * 100}%` }} />
                      </div>
                      <div className="miniRow__value">{x.qtySold}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">No data.</div>
              )}

              <div className="spacer12"></div>
              <div className="row">
                <div className="muted">Top Selling Drinks</div>
              </div>
              {kitchenTopDrinks.length ? (
                <div className="miniBars">
                  {kitchenTopDrinks.map((x) => (
                    <div key={x.itemName} className="miniRow">
                      <div className="miniRow__label">{x.itemName}</div>
                      <div className="miniRow__bar">
                        <div className="miniRow__fill" style={{ width: `${(x.qtySold / maxKitchenQty) * 100}%` }} />
                      </div>
                      <div className="miniRow__value">{x.qtySold}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">No data.</div>
              )}
            </div>
          </div>
        ) : null}
    </AppShell>
  )
}
