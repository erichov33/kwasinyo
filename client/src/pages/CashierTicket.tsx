import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomBar } from '../components/BottomBar'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { cashierNav } from '../lib/nav'
import { usePriceBoard } from '../hooks/usePriceBoard'
import { formatMoneyCents } from '../lib/money'

export function CashierTicket() {
  const [plate, setPlate] = useState('')
  const { data: board, error: boardError } = usePriceBoard({ activeOnly: true })
  const [vehicleTypeId, setVehicleTypeId] = useState<number | null>(null)
  const [serviceTypeId, setServiceTypeId] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash')
  const [lastTicket, setLastTicket] = useState<{ ticketNumber: number; ticketLabel: string; priceCents: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const showError = error ?? boardError

  const vehicleTypes = board?.vehicleTypes ?? []
  const serviceTypes = board?.serviceTypes ?? []
  const prices = board?.prices ?? []

  const vehicleOptions = useMemo(() => {
    const preferred = ['Sedan', 'SUV', 'Bakkie', 'Minivan']
    if (vehicleTypes.length === 0) return []
    const byName = new Map(vehicleTypes.map((v) => [v.name.toLowerCase(), v]))
    const ordered = preferred
      .map((n) => byName.get(n.toLowerCase()))
      .filter((v): v is (typeof vehicleTypes)[number] => Boolean(v))
    return ordered.length >= 2 ? ordered : vehicleTypes
  }, [vehicleTypes])

  const serviceOptions = useMemo(() => {
    const preferred = ['Basic Wash', 'Full Wash', 'Premium wash']
    if (serviceTypes.length === 0) return []
    const byName = new Map(serviceTypes.map((s) => [s.name.toLowerCase(), s]))
    const ordered = preferred
      .map((n) => byName.get(n.toLowerCase()))
      .filter((s): s is (typeof serviceTypes)[number] => Boolean(s))
    return ordered.length >= 2 ? ordered : serviceTypes
  }, [serviceTypes])

  const priceKey = useMemo(() => {
    if (!vehicleTypeId || !serviceTypeId) return null
    return `${vehicleTypeId}|${serviceTypeId}`
  }, [vehicleTypeId, serviceTypeId])

  const basePriceCents = useMemo(() => {
    if (!priceKey) return null
    const row = prices.find((p) => p.vehicleTypeId === vehicleTypeId && p.serviceTypeId === serviceTypeId)
    return row ? row.priceCents : null
  }, [priceKey, prices, vehicleTypeId, serviceTypeId])

  const finalPriceCents = basePriceCents
  const canIssue = Boolean(plate.trim() && vehicleTypeId && serviceTypeId && finalPriceCents !== null && finalPriceCents > 0)

  const resetForm = () => {
    setPlate('')
    setVehicleTypeId(null)
    setServiceTypeId(null)
    setPaymentMethod('cash')
    setError(null)
  }

  const issue = async () => {
    setError(null)
    try {
      const res = await api<{ ticket: { ticketNumber: number; ticketLabel: string; priceCents: number } }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          plate,
          vehicleTypeId,
          serviceTypeId,
          paymentMethod,
          priceCents: finalPriceCents,
        }),
      })
      setLastTicket(res.ticket)
      resetForm()
      await printReceipt(res.ticket.ticketNumber)
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
        <div className="heroBanner heroBanner--carwash heroBanner--compact">
          <div className="heroBanner__text">
            <div className="heroBanner__kicker">New wash ticket</div>
            <div className="heroBanner__title">
              <span className="heroBanner__brand">KWA SINYO</span>
              <span className="heroBanner__brandAccent">CAR WASH</span>
            </div>
            <div className="heroBanner__subTitle">Fast check-in. Accurate pricing.</div>
            <div className="heroBanner__actions">
              <Link className="btn btn--ghost" to="/cashier/closeout">
                Close Day
              </Link>
            </div>
          </div>

          <div className="heroBanner__art" aria-hidden="true">
            <svg viewBox="0 0 560 280" role="presentation" focusable="false">
              <defs>
                <linearGradient id="kw-car2" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="rgba(96,165,250,0.85)" />
                  <stop offset="1" stopColor="rgba(59,130,246,0.2)" />
                </linearGradient>
                <linearGradient id="kw-foam2" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" stopColor="rgba(255,255,255,0.85)" />
                  <stop offset="1" stopColor="rgba(255,255,255,0.12)" />
                </linearGradient>
              </defs>

              <g opacity="0.95">
                <path
                  d="M132 170c6-26 16-44 31-54 19-13 70-19 117-19 45 0 88 4 114 14 19 8 34 26 46 56 9 1 17 6 23 14 6 9 9 20 9 32 0 11-3 21-9 30-7 10-17 15-30 15h-24c-6 0-10-3-12-9l-5-13H167l-5 13c-2 6-7 9-12 9h-24c-13 0-23-5-30-15-6-9-9-19-9-30 0-12 3-23 9-32 6-8 14-13 23-14z"
                  fill="url(#kw-car2)"
                />
                <path
                  d="M178 143c22-18 58-25 102-25 47 0 87 7 111 25 9 7 14 18 16 33H162c2-15 7-26 16-33z"
                  fill="rgba(255,255,255,0.14)"
                />
                <circle cx="198" cy="220" r="26" fill="rgba(15,23,42,0.35)" />
                <circle cx="198" cy="220" r="16" fill="rgba(15,23,42,0.65)" />
                <circle cx="374" cy="220" r="26" fill="rgba(15,23,42,0.35)" />
                <circle cx="374" cy="220" r="16" fill="rgba(15,23,42,0.65)" />
                <path d="M152 178h256" stroke="rgba(255,255,255,0.22)" strokeWidth="6" strokeLinecap="round" />
              </g>

              <g opacity="0.95">
                <path
                  d="M126 92c16-10 36-16 58-18 29-3 66 4 87 14 12 6 25 7 39 0 22-10 58-17 87-14 21 2 41 8 57 18-20-4-41-4-63-1-31 4-55 15-81 25-18 7-43 7-62 0-26-10-50-21-81-25-22-3-43-3-63 1z"
                  fill="url(#kw-foam2)"
                />
                <circle cx="130" cy="86" r="12" fill="rgba(255,255,255,0.55)" />
                <circle cx="170" cy="62" r="10" fill="rgba(255,255,255,0.4)" />
                <circle cx="208" cy="86" r="8" fill="rgba(255,255,255,0.35)" />
                <circle cx="410" cy="70" r="12" fill="rgba(255,255,255,0.45)" />
                <circle cx="444" cy="90" r="9" fill="rgba(255,255,255,0.35)" />
                <circle cx="470" cy="62" r="8" fill="rgba(255,255,255,0.3)" />
              </g>
            </svg>
          </div>
        </div>

        <div className="stack">
          <div className="card ticketCard">
            <div className="row">
              <h1 className="h1">New Ticket</h1>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => {
                  resetForm()
                  setLastTicket(null)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                Return Home
              </button>
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
                    Print receipt again
                  </button>
                </div>
              </div>
            ) : null}

            <div className="ticketForm">
              <div className="field">
                <label>Plate Number</label>
                <input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder="e.g. KWA 123 GP"
                  autoCapitalize="characters"
                  required
                />
              </div>

              <div className="field">
                <label>Vehicle Type</label>
                <select
                  className="select"
                  value={vehicleTypeId ?? ''}
                  onChange={(e) => setVehicleTypeId(e.target.value ? Number(e.target.value) : null)}
                  required
                >
                  <option value="" disabled>
                    Select vehicle type
                  </option>
                  {vehicleOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Services</label>
                <select
                  className="select"
                  value={serviceTypeId ?? ''}
                  onChange={(e) => setServiceTypeId(e.target.value ? Number(e.target.value) : null)}
                  required
                >
                  <option value="" disabled>
                    Select service
                  </option>
                  {serviceOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Cash or Card Payment</label>
                <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'card')} required>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                </select>
              </div>
            </div>

            <div className="ticketFooter">
              <div className="ticketPrice" aria-live="polite">
                <div className="ticketPrice__label">Price</div>
                <div className="ticketPrice__value">{finalPriceCents === null ? '—' : formatMoneyCents(finalPriceCents)}</div>
              </div>
              <button type="button" className="primary" disabled={!canIssue} onClick={() => issue()}>
                Confirm payment & issue receipt
              </button>
            </div>
          </div>
        </div>

        <BottomBar
          items={[
            { to: '/cashier', label: 'New Ticket', end: true },
            { to: '/cashier/kitchen', label: 'Kitchen' },
            { to: '/cashier/closeout', label: 'Close Day' },
          ]}
        />
      </div>
    </AppShell>
  )
}
