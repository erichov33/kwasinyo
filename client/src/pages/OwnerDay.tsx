import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { TopBar } from '../components/TopBar'
import { api } from '../lib/api'
import { formatDayDate } from '../lib/date'
import { formatMoneyCents } from '../lib/money'

type Ticket = {
  ticketNumber: number
  plate: string
  vehicleTypeName: string
  serviceTypeName: string
  priceCents: number
  basePriceCents: number
  priceOverridden: number
  paymentMethod: 'cash' | 'card' | 'other'
  createdAt: string
}

type Reconciliation = {
  dayDate: string
  ticketsCount: number
  expectedRevenueCents: number
  expectedCashCents: number
  declaredCashCents: number
  discrepancyCashCents: number
  cashierSubmittedAt: string
  ownerConfirmedAt: string | null
  ownerNote: string | null
}

type DayRes = {
  dayDate: string
  tickets: Ticket[]
  reconciliation: Reconciliation | null
}

export function OwnerDay() {
  const { date } = useParams()
  const dayDate = date ?? ''
  const [data, setData] = useState<DayRes | null>(null)
  const [ownerNote, setOwnerNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const res = await api<DayRes>(`/api/owner/day/${dayDate}`)
    setData(res)
    setOwnerNote(res.reconciliation?.ownerNote ?? '')
  }

  useEffect(() => {
    if (!dayDate) return
    load().catch((e: any) => setError(e?.message ?? 'load_failed'))
  }, [dayDate])

  const totals = useMemo(() => {
    const ticketsCount = data?.tickets.length ?? 0
    const expectedRevenueCents = data?.tickets.reduce((sum, t) => sum + t.priceCents, 0) ?? 0
    const expectedCashCents =
      data?.tickets.reduce((sum, t) => sum + (t.paymentMethod === 'cash' ? t.priceCents : 0), 0) ?? 0
    return { ticketsCount, expectedRevenueCents, expectedCashCents }
  }, [data])

  const discrepancyTone = (v: number): 'good' | 'warn' | 'bad' => {
    const abs = Math.abs(v)
    if (abs === 0) return 'good'
    if (abs <= 5000) return 'warn'
    return 'bad'
  }

  const canConfirm = Boolean(data?.reconciliation && !data.reconciliation.ownerConfirmedAt)

  const confirm = async () => {
    if (!data?.reconciliation) return
    setError(null)
    try {
      await api('/api/closeout/owner-confirm', {
        method: 'POST',
        body: JSON.stringify({ dayDate, ownerNote: ownerNote.trim() ? ownerNote.trim() : undefined }),
      })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'confirm_failed')
    }
  }

  return (
    <main className="page">
      <TopBar
        title="Owner"
        links={[
          { to: '/owner', label: 'Dashboard' },
          { to: '/owner/price-board', label: 'Price Board' },
        ]}
      />

      <div className="stack">
        {error ? <div className="alert alert--bad">{error}</div> : null}

        <div className="card">
          <div className="row">
            <h1 className="h1">{formatDayDate(dayDate)}</h1>
            {data?.reconciliation?.ownerConfirmedAt ? (
              <Badge tone="good">Confirmed</Badge>
            ) : data?.reconciliation ? (
              <Badge tone="warn">Submitted</Badge>
            ) : (
              <Badge tone="neutral">Pending</Badge>
            )}
          </div>
          <div className="grid2">
            <div className="stat">
              <div className="muted">Tickets</div>
              <div className="big">{totals.ticketsCount}</div>
            </div>
            <div className="stat">
              <div className="muted">Expected revenue</div>
              <div className="big">{formatMoneyCents(totals.expectedRevenueCents)}</div>
            </div>
            <div className="stat">
              <div className="muted">Expected cash</div>
              <div className="big">{formatMoneyCents(totals.expectedCashCents)}</div>
            </div>
            <div className="stat">
              <div className="muted">Quick</div>
              <Link className="chip" to="/owner">
                Back to dashboard
              </Link>
            </div>
          </div>

          {data?.reconciliation ? (
            <div className="card card--sub">
              <div className="row">
                <div className="muted">Declared cash</div>
                <div className="big">{formatMoneyCents(data.reconciliation.declaredCashCents)}</div>
              </div>
              <div className="row">
                <div className="muted">Discrepancy (cash)</div>
                <Badge tone={discrepancyTone(data.reconciliation.discrepancyCashCents)}>
                  {formatMoneyCents(data.reconciliation.discrepancyCashCents)}
                </Badge>
              </div>
              <div className="field">
                <label>Owner note</label>
                <textarea value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} rows={3} />
              </div>
              <button type="button" className="primary" disabled={!canConfirm} onClick={() => confirm()}>
                Confirm closeout
              </button>
            </div>
          ) : (
            <div className="muted">Cashier has not submitted closeout yet.</div>
          )}
        </div>

        <div className="card">
          <h2 className="h2">Tickets</h2>
          <div className="list">
            {(data?.tickets ?? []).map((t) => (
              <div key={t.ticketNumber} className="listrow">
                <div className="listrow__main">
                  <div className="listrow__title">
                    #{String(t.ticketNumber).padStart(4, '0')} {t.plate}
                  </div>
                  <div className="listrow__sub">
                    {t.vehicleTypeName} · {t.serviceTypeName} · {t.paymentMethod.toUpperCase()}
                    {t.priceOverridden ? ' · OVERRIDE' : ''}
                  </div>
                </div>
                <div className="listrow__amount">{formatMoneyCents(t.priceCents)}</div>
              </div>
            ))}
            {(data?.tickets ?? []).length === 0 ? <div className="muted">No tickets.</div> : null}
          </div>
        </div>
      </div>
    </main>
  )
}

