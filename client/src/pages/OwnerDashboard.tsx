import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { BarChart } from '../components/BarChart'
import { DivergingBarChart } from '../components/DivergingBarChart'
import { TopBar } from '../components/TopBar'
import { api } from '../lib/api'
import { formatDayDate } from '../lib/date'
import { formatMoneyCents } from '../lib/money'

type Snapshot = {
  dayDate: string
  carsWashedToday: number
  expectedRevenueTodayCents: number
  reconciliationStatus: 'pending' | 'cashier_submitted' | 'confirmed'
  todayDiscrepancyCashCents: number | null
  lastConfirmedDiscrepancy: { dayDate: string; discrepancyCashCents: number } | null
}

type HistoryRow = {
  dayDate: string
  ticketsCount: number
  expectedRevenueCents: number
  declaredCashCents: number | null
  discrepancyCashCents: number | null
  status: 'pending' | 'cashier_submitted' | 'confirmed'
}

export function OwnerDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<'date' | 'revenue' | 'discrepancy'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const load = async () => {
    const s = await api<Snapshot>('/api/owner/today-snapshot')
    const h = await api<{ rows: HistoryRow[] }>('/api/owner/history?days=30')
    setSnapshot(s)
    setRows(h.rows)
  }

  useEffect(() => {
    load().catch((e: any) => setError(e?.message ?? 'load_failed'))
  }, [])

  const statusTone = (status: HistoryRow['status']): 'neutral' | 'warn' | 'good' => {
    if (status === 'confirmed') return 'good'
    if (status === 'cashier_submitted') return 'warn'
    return 'neutral'
  }

  const discrepancyTone = (v: number | null): 'neutral' | 'good' | 'warn' | 'bad' => {
    if (v === null) return 'neutral'
    const abs = Math.abs(v)
    if (abs === 0) return 'good'
    if (abs <= 5000) return 'warn'
    return 'bad'
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      let av = 0
      let bv = 0
      if (sort === 'date') {
        av = Number(a.dayDate.replaceAll('-', ''))
        bv = Number(b.dayDate.replaceAll('-', ''))
      } else if (sort === 'revenue') {
        av = a.expectedRevenueCents
        bv = b.expectedRevenueCents
      } else {
        av = a.discrepancyCashCents ?? -Infinity
        bv = b.discrepancyCashCents ?? -Infinity
      }
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return copy
  }, [rows, sort, sortDir])

  const revenuePoints = useMemo(
    () =>
      rows.map((r) => ({
        label: r.dayDate,
        value: r.expectedRevenueCents,
      })),
    [rows],
  )

  const discrepancyPoints = useMemo(
    () =>
      rows.map((r) => ({
        label: r.dayDate,
        value: r.discrepancyCashCents ?? 0,
      })),
    [rows],
  )

  return (
    <main className="page">
      <TopBar title="Owner" links={[{ to: '/owner', label: 'Dashboard' }, { to: '/owner/price-board', label: 'Price Board' }]} />

      <div className="stack">
        {error ? <div className="alert alert--bad">{error}</div> : null}

        {snapshot ? (
          <div className="card">
            <div className="row">
              <h1 className="h1">Today</h1>
              <Badge tone={snapshot.reconciliationStatus === 'confirmed' ? 'good' : snapshot.reconciliationStatus === 'cashier_submitted' ? 'warn' : 'neutral'}>
                {snapshot.reconciliationStatus === 'confirmed'
                  ? 'Confirmed'
                  : snapshot.reconciliationStatus === 'cashier_submitted'
                    ? 'Cashier submitted'
                    : 'Pending'}
              </Badge>
            </div>

            <div className="grid2">
              <div className="stat">
                <div className="muted">Cars washed</div>
                <div className="big">{snapshot.carsWashedToday}</div>
              </div>
              <div className="stat">
                <div className="muted">Expected revenue</div>
                <div className="big">{formatMoneyCents(snapshot.expectedRevenueTodayCents)}</div>
              </div>
              <div className="stat">
                <div className="muted">Today discrepancy</div>
                <Badge tone={discrepancyTone(snapshot.todayDiscrepancyCashCents)}>
                  {snapshot.todayDiscrepancyCashCents === null ? '—' : formatMoneyCents(snapshot.todayDiscrepancyCashCents)}
                </Badge>
              </div>
              <div className="stat">
                <div className="muted">Last confirmed</div>
                <div className="row">
                  <div className="muted">{snapshot.lastConfirmedDiscrepancy ? snapshot.lastConfirmedDiscrepancy.dayDate : '—'}</div>
                  <Badge tone={discrepancyTone(snapshot.lastConfirmedDiscrepancy?.discrepancyCashCents ?? null)}>
                    {snapshot.lastConfirmedDiscrepancy ? formatMoneyCents(snapshot.lastConfirmedDiscrepancy.discrepancyCashCents) : '—'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="row">
              <Link className="chip" to={`/owner/day/${snapshot.dayDate}`}>
                View today’s ticket log
              </Link>
              {snapshot.reconciliationStatus === 'cashier_submitted' ? (
                <Link className="chip chip--warn" to={`/owner/day/${snapshot.dayDate}`}>
                  Review & confirm closeout
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="card">Loading…</div>
        )}

        <div className="card">
          <h2 className="h2">Last 30 days</h2>
          <div className="muted">Expected revenue</div>
          <BarChart points={revenuePoints} />
          <div className="muted">Discrepancy (cash)</div>
          <DivergingBarChart points={discrepancyPoints} />
        </div>

        <div className="card">
          <div className="row">
            <h2 className="h2">Summary</h2>
            <div className="row">
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setSort('date')
                  setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                }}
              >
                Sort: Date
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setSort('revenue')
                  setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                }}
              >
                Sort: Revenue
              </button>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setSort('discrepancy')
                  setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                }}
              >
                Sort: Discrepancy
              </button>
            </div>
          </div>

          <div className="table">
            {sortedRows.map((r) => (
              <Link key={r.dayDate} to={`/owner/day/${r.dayDate}`} className="trow">
                <div className="trow__cell">
                  <div className="trow__title">{formatDayDate(r.dayDate)}</div>
                  <div className="trow__sub">{r.dayDate}</div>
                </div>
                <div className="trow__cell trow__right">
                  <div className="trow__title">{r.ticketsCount}</div>
                  <div className="trow__sub">tickets</div>
                </div>
                <div className="trow__cell trow__right">
                  <div className="trow__title">{formatMoneyCents(r.expectedRevenueCents)}</div>
                  <div className="trow__sub">expected</div>
                </div>
                <div className="trow__cell trow__right">
                  <Badge tone={discrepancyTone(r.discrepancyCashCents)}>
                    {r.discrepancyCashCents === null ? '—' : formatMoneyCents(r.discrepancyCashCents)}
                  </Badge>
                </div>
                <div className="trow__cell trow__right">
                  <Badge tone={statusTone(r.status)}>{r.status === 'cashier_submitted' ? 'Submitted' : r.status === 'confirmed' ? 'Confirmed' : 'Pending'}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
