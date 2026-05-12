import { useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/AppShell'
import { BarChart } from '../components/BarChart'
import { api } from '../lib/api'
import { formatMoneyCents } from '../lib/money'

type DailyRow = {
  dayDate: string
  ticketsCount: number
  revenueCents: number
  discrepancyCashCents: number | null
  status: 'pending' | 'cashier_submitted' | 'confirmed'
}

type ReportsRes = {
  range: { start: string; end: string; days: number }
  type: string
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
  }
  statusCounts: {
    pending: number
    cashier_submitted: number
    confirmed: number
  }
  paymentBreakdown: Array<{ paymentMethod: string; ticketsCount: number; revenueCents: number }>
  daily: DailyRow[]
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
  const [data, setData] = useState<ReportsRes | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (next?: { start: string; end: string; type: string }) => {
    const s = next?.start ?? start
    const e = next?.end ?? end
    const t = next?.type ?? type
    setLoading(true)
    setError(null)
    try {
      const res = await api<ReportsRes>(`/api/owner/reports?start=${encodeURIComponent(s)}&end=${encodeURIComponent(e)}&type=${encodeURIComponent(t)}`)
      setData(res)
    } catch (err: any) {
      setError(err?.message ?? 'load_failed')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load({ start: defaultStart, end: today, type: 'overview' })
  }, [defaultStart, today])

  const revenuePoints = useMemo(
    () => (data?.daily ?? []).map((r) => ({ label: r.dayDate, value: r.revenueCents })),
    [data],
  )

  const peakHourPoints = useMemo(
    () => (data?.behavioral.peakHours ?? []).map((h) => ({ label: String(h.hour).padStart(2, '0'), value: h.ticketsCount })),
    [data],
  )

  const topServices = useMemo(() => {
    const list = data?.behavioral.preferredServices ?? []
    return list.slice(0, 6)
  }, [data])

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
    lines.push(['Total Tickets', String(data.summary.totalTickets)].join(','))
    lines.push(['Total Revenue', String(data.summary.totalRevenueCents)].join(','))
    lines.push(['Avg Ticket', String(data.summary.avgTicketCents)].join(','))
    lines.push(['Unique Plates', String(data.summary.uniquePlatesCount)].join(','))
    lines.push('')
    lines.push(['Day', 'Tickets', 'RevenueCents', 'DiscrepancyCashCents', 'Status'].join(','))
    for (const r of data.daily) {
      lines.push([r.dayDate, String(r.ticketsCount), String(r.revenueCents), String(r.discrepancyCashCents ?? ''), r.status].join(','))
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
    <AppShell
      section="Reports"
      nav={[
        { to: '/owner', label: 'Dashboard', icon: '⌂', end: true },
        { to: '/owner/reports', label: 'Reports', icon: '▦' },
        { to: '/owner/price-board', label: 'Price Board', icon: '≡' },
      ]}
    >
      <div className="shellInner stack">
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
              <div className="field filterBar__action">
                <label>&nbsp;</label>
                <button type="button" className="btn btn--solid btn--small" onClick={() => load()} disabled={loading}>
                  Apply Filter
                </button>
              </div>
            </div>
          </div>
        </div>

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
            <h2 className="h2">Reconciliation Status</h2>
            <div className="muted">Days in range</div>
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
      </div>
    </AppShell>
  )
}
