import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { AppShell } from '../components/AppShell'
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
  discountCents: number
  discountReason: string | null
  overrideNote: string | null
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

type CashAudit = {
  dayDate: string
  summary: {
    ticketsCount: number
    expectedRevenueCents: number
    expectedCashCents: number
    minTicketNumber: number | null
    maxTicketNumber: number | null
    missingTicketNumbers: number[]
    overridesCount: number
    discountsCount: number
    voidedCount: number
  }
}

export function OwnerDay() {
  const { date } = useParams()
  const dayDate = date ?? ''
  const [data, setData] = useState<DayRes | null>(null)
  const [audit, setAudit] = useState<CashAudit | null>(null)
  const [ownerNote, setOwnerNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const [res, aud] = await Promise.all([api<DayRes>(`/api/owner/day/${dayDate}`), api<CashAudit>(`/api/owner/cash-audit/${dayDate}`)])
    setData(res)
    setAudit(aud)
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
  const canEditTickets = Boolean(!data?.reconciliation)

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

  const voidTicket = async (ticketNumber: number) => {
    if (!canEditTickets) return
    const reason = window.prompt(`Void ticket #${String(ticketNumber).padStart(4, '0')} — reason?`)
    if (!reason || !reason.trim()) return
    setError(null)
    try {
      await api(`/api/owner/tickets/${ticketNumber}/void`, { method: 'POST', body: JSON.stringify({ reason: reason.trim() }) })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'void_failed')
    }
  }

  return (
    <AppShell
      section="Day View"
      nav={[
        { to: '/owner', label: 'Dashboard', icon: '⌂', end: true },
        { to: '/owner/reports', label: 'Reports', icon: '▦' },
        { to: '/owner/customers', label: 'Customers', icon: '◎' },
        { to: '/owner/price-board', label: 'Price Board', icon: '≡' },
      ]}
    >
      <div className="shellInner stack">
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
          <div className="statRow">
            <div className="statCard">
              <div className="statCard__label">Tickets</div>
              <div className="statCard__value">{totals.ticketsCount}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Expected revenue</div>
              <div className="statCard__value">{formatMoneyCents(totals.expectedRevenueCents)}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Expected cash</div>
              <div className="statCard__value">{formatMoneyCents(totals.expectedCashCents)}</div>
            </div>
            <div className="statCard">
              <div className="statCard__label">Navigation</div>
              <Link className="btn btn--outline btn--small" to="/owner">
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
              <button type="button" className="btn btn--solid" disabled={!canConfirm} onClick={() => confirm()}>
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
                    {t.discountCents > 0 ? ` · DISCOUNT -${formatMoneyCents(t.discountCents)}` : ''}
                    {t.priceOverridden ? ' · OVERRIDE' : ''}
                    {t.overrideNote ? ` · ${t.overrideNote}` : t.discountReason ? ` · ${t.discountReason}` : ''}
                  </div>
                </div>
                <div className="listrow__amount">
                  {formatMoneyCents(t.priceCents)}
                  {canEditTickets ? (
                    <div>
                      <button type="button" className="btn btn--outline btn--small" onClick={() => voidTicket(t.ticketNumber)}>
                        Void
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {(data?.tickets ?? []).length === 0 ? <div className="muted">No tickets.</div> : null}
          </div>

          {audit ? (
            <div className="callout callout--warn">
              <div>
                <div className="listrow__title">Cash audit</div>
                <div className="listrow__sub">
                  Missing tickets: {audit.summary.missingTicketNumbers.length || '0'} • Overrides: {audit.summary.overridesCount} • Discounts: {audit.summary.discountsCount} • Voids: {audit.summary.voidedCount}
                </div>
                {audit.summary.missingTicketNumbers.length ? (
                  <div className="muted tiny">Missing: {audit.summary.missingTicketNumbers.slice(0, 24).map((n) => `#${String(n).padStart(4, '0')}`).join(', ')}{audit.summary.missingTicketNumbers.length > 24 ? '…' : ''}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </AppShell>
  )
}
