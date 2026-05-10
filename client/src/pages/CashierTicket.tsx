import { useEffect, useMemo, useState } from 'react'
import { ButtonGrid } from '../components/ButtonGrid'
import { BottomBar } from '../components/BottomBar'
import { Badge } from '../components/Badge'
import { api } from '../lib/api'
import { formatMoneyCents, parseMoneyToCents } from '../lib/money'

type VehicleType = { id: number; name: string; active: number }
type ServiceType = { id: number; name: string; active: number }
type PriceRow = { vehicleTypeId: number; serviceTypeId: number; priceCents: number }

type Ticket = {
  ticketNumber: number
  plate: string
  vehicleTypeName: string
  serviceTypeName: string
  priceCents: number
  paymentMethod: 'cash' | 'card' | 'other'
  priceOverridden: number
  createdAt: string
}

export function CashierTicket() {
  const [plate, setPlate] = useState('')
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([])
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([])
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [vehicleTypeId, setVehicleTypeId] = useState<number | null>(null)
  const [serviceTypeId, setServiceTypeId] = useState<number | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'other'>('cash')
  const [override, setOverride] = useState(false)
  const [overrideInput, setOverrideInput] = useState('')
  const [lastTicket, setLastTicket] = useState<{ ticketLabel: string; priceCents: number } | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [error, setError] = useState<string | null>(null)

  const priceKey = useMemo(() => {
    if (!vehicleTypeId || !serviceTypeId) return null
    return `${vehicleTypeId}|${serviceTypeId}`
  }, [vehicleTypeId, serviceTypeId])

  const basePriceCents = useMemo(() => {
    if (!priceKey) return null
    const row = prices.find((p) => p.vehicleTypeId === vehicleTypeId && p.serviceTypeId === serviceTypeId)
    return row ? row.priceCents : null
  }, [priceKey, prices, vehicleTypeId, serviceTypeId])

  const priceCents = useMemo(() => {
    if (basePriceCents === null) return null
    if (!override) return basePriceCents
    return parseMoneyToCents(overrideInput)
  }, [basePriceCents, override, overrideInput])

  const canIssue = Boolean(plate.trim() && vehicleTypeId && serviceTypeId && priceCents !== null && priceCents > 0)

  const load = async () => {
    const board = await api<{ vehicleTypes: VehicleType[]; serviceTypes: ServiceType[]; prices: PriceRow[] }>(
      '/api/price-board?activeOnly=1',
    )
    setVehicleTypes(board.vehicleTypes)
    setServiceTypes(board.serviceTypes)
    setPrices(board.prices)
    const today = await api<{ tickets: Ticket[] }>('/api/tickets/today')
    setTickets(today.tickets)
  }

  useEffect(() => {
    load()
  }, [])

  const issue = async () => {
    setError(null)
    setLastTicket(null)
    try {
      const res = await api<{ ticket: { ticketLabel: string; priceCents: number } }>('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          plate,
          vehicleTypeId,
          serviceTypeId,
          paymentMethod,
          priceCents,
          override,
        }),
      })
      setLastTicket(res.ticket)
      setPlate('')
      setVehicleTypeId(null)
      setServiceTypeId(null)
      setOverride(false)
      setOverrideInput('')
      setPaymentMethod('cash')
      const today = await api<{ tickets: Ticket[] }>('/api/tickets/today')
      setTickets(today.tickets)
    } catch (err: any) {
      setError(err?.message ?? 'ticket_failed')
    }
  }

  return (
    <main className="page page--with-bottom">
      <div className="stack">
        <div className="card">
          <div className="row">
            <h1 className="h1">New Ticket</h1>
            {override ? <Badge tone="warn">Override</Badge> : null}
          </div>
          {error ? <div className="alert alert--bad">{error}</div> : null}
          {lastTicket ? (
            <div className="alert alert--good">
              <div className="row">
                <div className="big">{lastTicket.ticketLabel}</div>
                <div>{formatMoneyCents(lastTicket.priceCents)}</div>
              </div>
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
              <div className="big">{priceCents === null ? '—' : formatMoneyCents(priceCents)}</div>
            </div>
            {basePriceCents !== null && override ? (
              <div className="muted">Base: {formatMoneyCents(basePriceCents)}</div>
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
              <button type="button" className={override ? 'chip chip--warn' : 'chip'} onClick={() => setOverride(!override)}>
                Manual price
              </button>
              {override ? (
                <input
                  className="money"
                  inputMode="decimal"
                  value={overrideInput}
                  onChange={(e) => setOverrideInput(e.target.value)}
                  placeholder="Amount"
                />
              ) : null}
            </div>
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
    </main>
  )
}
