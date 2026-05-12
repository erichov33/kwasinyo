import { useMemo, useState } from 'react'
import { ButtonGrid } from '../components/ButtonGrid'
import { BottomBar } from '../components/BottomBar'
import { Badge } from '../components/Badge'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { cashierNav } from '../lib/nav'
import { usePriceBoard } from '../hooks/usePriceBoard'
import { useTodaySummary } from '../hooks/useTodaySummary'
import { useTodayTickets } from '../hooks/useTodayTickets'
import { formatMoneyCents, parseMoneyToCents } from '../lib/money'

export function CashierTicket() {
  const [plate, setPlate] = useState('')
  const { data: board, error: boardError } = usePriceBoard({ activeOnly: true })
  const [vehicleTypeId, setVehicleTypeId] = useState<number | null>(null)
  const [serviceTypeId, setServiceTypeId] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'other'>('cash')
  const [override, setOverride] = useState(false)
  const [overrideInput, setOverrideInput] = useState('')
  const [overrideNote, setOverrideNote] = useState('')
  const [discountOn, setDiscountOn] = useState(false)
  const [discountInput, setDiscountInput] = useState('')
  const [discountReason, setDiscountReason] = useState('')
  const [lastTicket, setLastTicket] = useState<{ ticketNumber: number; ticketLabel: string; priceCents: number } | null>(null)
  const { data: summary, error: summaryError, reload: reloadSummary } = useTodaySummary()
  const { tickets, error: ticketsError, reload: reloadTickets } = useTodayTickets()
  const [error, setError] = useState<string | null>(null)
  const showError = error ?? boardError ?? summaryError ?? ticketsError

  const vehicleTypes = board?.vehicleTypes ?? []
  const serviceTypes = board?.serviceTypes ?? []
  const prices = board?.prices ?? []

  const priceKey = useMemo(() => {
    if (!vehicleTypeId || !serviceTypeId) return null
    return `${vehicleTypeId}|${serviceTypeId}`
  }, [vehicleTypeId, serviceTypeId])

  const basePriceCents = useMemo(() => {
    if (!priceKey) return null
    const row = prices.find((p) => p.vehicleTypeId === vehicleTypeId && p.serviceTypeId === serviceTypeId)
    return row ? row.priceCents : null
  }, [priceKey, prices, vehicleTypeId, serviceTypeId])

  const discountCents = useMemo(() => {
    if (basePriceCents === null) return 0
    if (override) return 0
    if (!discountOn) return 0
    const d = parseMoneyToCents(discountInput)
    if (!Number.isFinite(d) || d < 0) return 0
    return d
  }, [basePriceCents, discountInput, discountOn, override])

  const finalPriceCents = useMemo(() => {
    if (basePriceCents === null) return null
    if (override) return parseMoneyToCents(overrideInput)
    return basePriceCents - discountCents
  }, [basePriceCents, discountCents, override, overrideInput])

  const discountValid = basePriceCents === null ? true : discountCents <= basePriceCents
  const finalValid = finalPriceCents !== null && finalPriceCents > 0
  const canIssue = Boolean(plate.trim() && vehicleTypeId && serviceTypeId && finalValid && discountValid)

  const issue = async () => {
    setError(null)
    setLastTicket(null)
    try {
      const res = await api<{ ticket: { ticketNumber: number; ticketLabel: string; priceCents: number } }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          plate,
          vehicleTypeId,
          serviceTypeId,
          paymentMethod,
          priceCents: finalPriceCents,
          override,
          overrideNote: override && overrideNote.trim() ? overrideNote.trim() : undefined,
          discountCents: !override && discountCents > 0 ? discountCents : undefined,
          discountReason: !override && discountCents > 0 && discountReason.trim() ? discountReason.trim() : undefined,
        }),
      })
      setLastTicket(res.ticket)
      setPlate('')
      setVehicleTypeId(null)
      setServiceTypeId(null)
      setOverride(false)
      setOverrideInput('')
      setOverrideNote('')
      setDiscountOn(false)
      setDiscountInput('')
      setDiscountReason('')
      setPaymentMethod('cash')
      await Promise.all([reloadSummary(), reloadTickets()])
    } catch (err: any) {
      setError(err?.message ?? 'ticket_failed')
    }
  }

  const printReceipt = async (ticketNumber: number) => {
    setError(null)
    try {
      const res = await api<{
        ticket: {
          ticketNumber: number
          ticketLabel: string
          dayDate: string
          plate: string
          vehicleTypeName: string
          serviceTypeName: string
          basePriceCents: number
          discountCents: number
          discountReason: string | null
          overrideNote: string | null
          priceCents: number
          priceOverridden: number
          paymentMethod: 'cash' | 'card' | 'other'
          createdAt: string
          cashierUsername: string
          printedAt: string
          voidedAt: string | null
          voidReason: string | null
        }
      }>(`/api/tickets/${ticketNumber}/receipt`)

      const t = res.ticket
      const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720')
      if (!w) return
      const title = `KwaSinyo Receipt ${t.ticketLabel}`
      const discountLine = t.discountCents > 0 ? `<div class="line"><span>Discount</span><span>-${formatMoneyCents(t.discountCents)}</span></div>` : ''
      const discountReasonLine = t.discountReason ? `<div class="muted">${t.discountReason}</div>` : ''
      const overrideLine = t.priceOverridden ? `<div class="muted">Manual price${t.overrideNote ? `: ${t.overrideNote}` : ''}</div>` : ''

      w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:18px;color:#0b0c10}
      .box{border:1px dashed #9ca3af;border-radius:12px;padding:14px}
      .center{text-align:center}
      .h{font-weight:900;font-size:18px}
      .muted{color:#4b5563;font-size:12px}
      .sp{height:10px}
      .line{display:flex;justify-content:space-between;gap:10px;font-size:14px;margin:6px 0}
      .total{font-weight:900;font-size:18px}
      @media print{body{margin:0} .box{border:0}}
    </style>
  </head>
  <body>
    <div class="box">
      <div class="center">
        <div class="h">KwaSinyo Car Wash</div>
        <div class="muted">Receipt • ${new Date(t.printedAt).toLocaleString()}</div>
      </div>
      <div class="sp"></div>
      <div class="line"><span>Ticket</span><span>${t.ticketLabel}</span></div>
      <div class="line"><span>Plate</span><span>${t.plate}</span></div>
      <div class="line"><span>Date</span><span>${t.dayDate}</span></div>
      <div class="line"><span>Service</span><span>${t.vehicleTypeName} • ${t.serviceTypeName}</span></div>
      <div class="line"><span>Payment</span><span>${t.paymentMethod.toUpperCase()}</span></div>
      <div class="line"><span>Cashier</span><span>${t.cashierUsername}</span></div>
      <div class="sp"></div>
      <div class="line"><span>Base</span><span>${formatMoneyCents(t.basePriceCents)}</span></div>
      ${discountLine}
      ${discountReasonLine}
      ${overrideLine}
      <div class="line total"><span>Total</span><span>${formatMoneyCents(t.priceCents)}</span></div>
      <div class="sp"></div>
      <div class="center muted">Thank you!</div>
    </div>
    <script>window.focus(); window.print();<\/script>
  </body>
</html>`)
      w.document.close()
    } catch (e: any) {
      setError(e?.message ?? 'receipt_failed')
    }
  }

  return (
    <AppShell section="Cashier" nav={cashierNav}>
      <div className="shellInner page--with-bottom">
        <div className="stack">
          <div className="card">
            <div className="row">
              <h1 className="h1">New Ticket</h1>
              {override ? <Badge tone="warn">Override</Badge> : discountCents > 0 ? <Badge tone="warn">Discount</Badge> : null}
            </div>
            {showError ? <div className="alert alert--bad">{showError}</div> : null}
            {lastTicket ? (
              <div className="alert alert--good">
                <div className="row">
                  <div className="big">{lastTicket.ticketLabel}</div>
                  <div>{formatMoneyCents(lastTicket.priceCents)}</div>
                </div>
                <div className="row">
                  <button type="button" className="btn btn--outline btn--small" onClick={() => printReceipt(lastTicket.ticketNumber)}>
                    Print receipt
                  </button>
                </div>
              </div>
            ) : null}

            {summary ? (
              <div className="card card--sub">
                <div className="row">
                  <div className="muted">Today sales</div>
                  {summary.reconciliation ? (
                    summary.reconciliation.ownerConfirmedAt ? (
                      <Badge tone="good">Confirmed</Badge>
                    ) : (
                      <Badge tone="warn">Submitted</Badge>
                    )
                  ) : (
                    <Badge tone="neutral">Open</Badge>
                  )}
                </div>
                <div className="row">
                  <div className="muted">{summary.ticketsCount} tickets</div>
                  <div className="big">{formatMoneyCents(summary.expectedRevenueCents)}</div>
                </div>
                <div className="muted">Expected cash: {formatMoneyCents(summary.expectedCashCents)}</div>
              </div>
            ) : null}

            <div className="field">
              <label>Plate number</label>
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="e.g. KWA 123 GP"
                autoCapitalize="characters"
              />
            </div>

            <div className="field">
              <label>Vehicle type</label>
              <ButtonGrid items={vehicleTypes} selectedId={vehicleTypeId} onSelect={(v) => setVehicleTypeId(v.id)} />
            </div>

            <div className="field">
              <label>Service</label>
              <ButtonGrid items={serviceTypes} selectedId={serviceTypeId} onSelect={(s) => setServiceTypeId(s.id)} />
            </div>

            <div className="card card--sub">
              <div className="row">
                <div className="muted">Price</div>
                <div className="big">{finalPriceCents === null ? '—' : formatMoneyCents(finalPriceCents)}</div>
              </div>
              {basePriceCents !== null ? (
                <div className="muted">
                  Base: {formatMoneyCents(basePriceCents)}
                  {discountCents > 0 ? ` • Discount: -${formatMoneyCents(discountCents)}` : ''}
                </div>
              ) : null}

              <div className="row">
                <button
                  type="button"
                  className={paymentMethod === 'cash' ? 'seg seg--active' : 'seg'}
                  onClick={() => setPaymentMethod('cash')}
                >
                  Cash
                </button>
                <button
                  type="button"
                  className={paymentMethod === 'card' ? 'seg seg--active' : 'seg'}
                  onClick={() => setPaymentMethod('card')}
                >
                  Card
                </button>
                <button
                  type="button"
                  className={paymentMethod === 'other' ? 'seg seg--active' : 'seg'}
                  onClick={() => setPaymentMethod('other')}
                >
                  Other
                </button>
              </div>

              <div className="row">
                <button
                  type="button"
                  className={override ? 'chip chip--warn' : 'chip'}
                  onClick={() => {
                    const next = !override
                    setOverride(next)
                    if (next) {
                      setDiscountOn(false)
                      setDiscountInput('')
                      setDiscountReason('')
                    }
                  }}
                >
                  Manual price
                </button>
                {override ? (
                  <>
                    <input
                      className="money"
                      inputMode="decimal"
                      value={overrideInput}
                      onChange={(e) => setOverrideInput(e.target.value)}
                      placeholder="Amount"
                    />
                    <input
                      className="money"
                      value={overrideNote}
                      onChange={(e) => setOverrideNote(e.target.value)}
                      placeholder="Reason (optional)"
                    />
                  </>
                ) : null}
              </div>

              <div className="row">
                <button
                  type="button"
                  className={discountOn ? 'chip chip--warn' : 'chip'}
                  onClick={() => {
                    const next = !discountOn
                    setDiscountOn(next)
                    if (next) {
                      setOverride(false)
                      setOverrideInput('')
                      setOverrideNote('')
                    } else {
                      setDiscountInput('')
                      setDiscountReason('')
                    }
                  }}
                >
                  Discount
                </button>
                {discountOn ? (
                  <>
                    <input
                      className="money"
                      inputMode="decimal"
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="Amount"
                    />
                    <input
                      className="money"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="Reason (optional)"
                    />
                  </>
                ) : null}
              </div>

              {!discountValid ? <div className="muted">Discount cannot exceed base price.</div> : null}
            </div>

            <button type="button" className="primary" disabled={!canIssue} onClick={() => issue()}>
              Confirm payment & issue ticket
            </button>
          </div>

          <div className="card">
            <div className="row">
              <h2 className="h2">Today</h2>
              <div className="muted">{tickets.length} tickets</div>
            </div>
            <div className="list">
              {tickets.slice(0, 10).map((t) => (
                <div key={t.ticketNumber} className="listrow">
                  <div className="listrow__main">
                    <div className="listrow__title">
                      #{String(t.ticketNumber).padStart(4, '0')} {t.plate}
                    </div>
                    <div className="listrow__sub">
                      {t.vehicleTypeName} · {t.serviceTypeName} · {t.paymentMethod.toUpperCase()}
                      {t.discountCents > 0 ? ` · DISCOUNT -${formatMoneyCents(t.discountCents)}` : ''}
                      {t.priceOverridden ? ' · OVERRIDE' : ''}
                    </div>
                  </div>
                  <div className="listrow__amount">{formatMoneyCents(t.priceCents)}</div>
                </div>
              ))}
              {tickets.length === 0 ? <div className="muted">No tickets yet.</div> : null}
            </div>
          </div>
        </div>

        <BottomBar
          items={[
            { to: '/cashier', label: 'New Ticket', end: true },
            { to: '/cashier/closeout', label: 'Close Day' },
          ]}
        />
      </div>
    </AppShell>
  )
}
