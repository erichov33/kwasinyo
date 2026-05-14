import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BottomBar } from '../components/BottomBar'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { cashierNav } from '../lib/nav'
import { formatMoneyCents } from '../lib/money'

type KitchenItem = { id: number; name: string; category: 'meal' | 'drink'; priceCents: number }
type CartLine = { item: KitchenItem; quantity: number }

export function CashierKitchen() {
  const [menu, setMenu] = useState<KitchenItem[]>([])
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash')
  const [cart, setCart] = useState<Record<string, CartLine>>({})
  const [error, setError] = useState<string | null>(null)
  const [lastOrder, setLastOrder] = useState<{ orderNumber: number; orderLabel: string; totalCents: number } | null>(null)

  useEffect(() => {
    api<{ items: KitchenItem[] }>('/api/kitchen/menu')
      .then((res) => setMenu(res.items ?? []))
      .catch((e: any) => setError(e?.message ?? 'load_failed'))
  }, [])

  const meals = useMemo(() => menu.filter((i) => i.category === 'meal'), [menu])
  const drinks = useMemo(() => menu.filter((i) => i.category === 'drink'), [menu])

  const cartLines = useMemo(() => Object.values(cart).sort((a, b) => a.item.name.localeCompare(b.item.name)), [cart])

  const totalCents = useMemo(() => {
    let t = 0
    for (const l of cartLines) t += l.item.priceCents * l.quantity
    return t
  }, [cartLines])

  const canConfirm = cartLines.length > 0 && totalCents > 0

  const reset = () => {
    setCart({})
    setPaymentMethod('cash')
    setError(null)
  }

  const addItem = (item: KitchenItem) => {
    setCart((prev) => {
      const key = String(item.id)
      const existing = prev[key]
      const nextQty = (existing?.quantity ?? 0) + 1
      return { ...prev, [key]: { item, quantity: nextQty } }
    })
  }

  const setQty = (itemId: number, quantity: number) => {
    setCart((prev) => {
      const key = String(itemId)
      if (!prev[key]) return prev
      if (quantity <= 0) {
        const { [key]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [key]: { ...prev[key], quantity } }
    })
  }

  const printReceipt = async (orderNumber: number) => {
    const res = await api<{
      order: {
        orderNumber: number
        orderLabel: string
        dayDate: string
        paymentMethod: 'cash' | 'card'
        totalCents: number
        createdAt: string
        cashierUsername: string
        items: Array<{ itemName: string; unitPriceCents: number; quantity: number; lineTotalCents: number }>
        printedAt: string
      }
    }>(`/api/kitchen/orders/${orderNumber}/receipt`)

    const o = res.order
    const w = window.open('', '_blank', 'noopener,noreferrer,width=420,height=720')
    if (!w) return
    const title = `KwaSinyo Kitchen Receipt ${o.orderLabel}`
    const lines = (o.items ?? [])
      .map(
        (it) =>
          `<div class="line"><span>${it.quantity}× ${it.itemName}</span><span>${formatMoneyCents(it.lineTotalCents)}</span></div><div class="muted">${formatMoneyCents(it.unitPriceCents)} each</div>`,
      )
      .join('')

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
        <div class="h">KwaSinyo Car Wash • Kitchen</div>
        <div class="muted">Receipt • ${new Date(o.printedAt).toLocaleString()}</div>
      </div>
      <div class="sp"></div>
      <div class="line"><span>Order</span><span>${o.orderLabel}</span></div>
      <div class="line"><span>Date</span><span>${o.dayDate}</span></div>
      <div class="line"><span>Payment</span><span>${o.paymentMethod.toUpperCase()}</span></div>
      <div class="line"><span>Cashier</span><span>${o.cashierUsername}</span></div>
      <div class="sp"></div>
      ${lines}
      <div class="sp"></div>
      <div class="line total"><span>Total</span><span>${formatMoneyCents(o.totalCents)}</span></div>
      <div class="sp"></div>
      <div class="center muted">Thank you!</div>
    </div>
    <script>window.focus(); window.print();<\/script>
  </body>
</html>`)
    w.document.close()
  }

  const confirm = async () => {
    setError(null)
    try {
      const items = cartLines.map((l) => ({ itemId: l.item.id, quantity: l.quantity }))
      const res = await api<{ order: { orderNumber: number; orderLabel: string; totalCents: number } }>('/api/kitchen/orders', {
        method: 'POST',
        body: JSON.stringify({ paymentMethod, items }),
      })
      setLastOrder(res.order)
      reset()
      await printReceipt(res.order.orderNumber)
    } catch (e: any) {
      setError(e?.message ?? 'order_failed')
    }
  }

  return (
    <AppShell section="Kitchen" nav={cashierNav}>
      <div className="shellInner page--with-bottom">
        <div className="heroBanner heroBanner--carwash heroBanner--compact">
          <div className="heroBanner__text">
            <div className="heroBanner__kicker">New order</div>
            <div className="heroBanner__title">
              <span className="heroBanner__brand">KWA SINYO</span>
              <span className="heroBanner__brandAccent">KITCHEN</span>
            </div>
            <div className="heroBanner__subTitle">Tap items to add to cart.</div>
            <div className="heroBanner__actions">
              <Link className="btn btn--ghost" to="/cashier">
                Car wash
              </Link>
              <Link className="btn btn--ghost" to="/cashier/closeout">
                Close Day
              </Link>
            </div>
          </div>
          <div className="heroBanner__art" aria-hidden="true">
            <svg viewBox="0 0 560 280" role="presentation" focusable="false">
              <defs>
                <linearGradient id="kw-kitchen" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="rgba(96,165,250,0.85)" />
                  <stop offset="1" stopColor="rgba(59,130,246,0.18)" />
                </linearGradient>
              </defs>
              <g opacity="0.95">
                <path
                  d="M190 70c30-22 70-22 100 0 10 7 18 16 22 28l18 56c3 10-4 20-15 20H165c-11 0-18-10-15-20l18-56c4-12 12-21 22-28z"
                  fill="url(#kw-kitchen)"
                />
                <path d="M165 174h170" stroke="rgba(255,255,255,0.26)" strokeWidth="10" strokeLinecap="round" />
                <path d="M220 50h80" stroke="rgba(255,255,255,0.22)" strokeWidth="10" strokeLinecap="round" />
                <circle cx="192" cy="208" r="18" fill="rgba(255,255,255,0.14)" />
                <circle cx="360" cy="92" r="14" fill="rgba(255,255,255,0.12)" />
                <circle cx="398" cy="128" r="10" fill="rgba(255,255,255,0.1)" />
              </g>
            </svg>
          </div>
        </div>

        <div className="stack">
          <div className="card ticketCard">
            <div className="row">
              <h1 className="h1">Kitchen Order</h1>
              <button
                type="button"
                className="btn btn--outline btn--small"
                onClick={() => {
                  reset()
                  setLastOrder(null)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                Return Home
              </button>
            </div>

            {error ? <div className="alert alert--bad">{error}</div> : null}

            {lastOrder ? (
              <div className="alert alert--good">
                <div className="row">
                  <div className="big">{lastOrder.orderLabel}</div>
                  <div>{formatMoneyCents(lastOrder.totalCents)}</div>
                </div>
                <div className="row">
                  <button type="button" className="btn btn--outline btn--small" onClick={() => printReceipt(lastOrder.orderNumber)}>
                    Print receipt again
                  </button>
                </div>
              </div>
            ) : null}

            <div className="dashGrid">
              <div className="card card--sub">
                <div className="row">
                  <h2 className="h2">Meals</h2>
                  <div className="muted">{meals.length}</div>
                </div>
                <div className="grid">
                  {meals.map((i) => (
                    <button key={i.id} type="button" className="gridbtn" onClick={() => addItem(i)}>
                      {i.name}
                      <div className="muted tiny">{formatMoneyCents(i.priceCents)}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card card--sub">
                <div className="row">
                  <h2 className="h2">Drinks</h2>
                  <div className="muted">{drinks.length}</div>
                </div>
                <div className="grid">
                  {drinks.map((i) => (
                    <button key={i.id} type="button" className="gridbtn" onClick={() => addItem(i)}>
                      {i.name}
                      <div className="muted tiny">{formatMoneyCents(i.priceCents)}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="card card--sub">
              <div className="row">
                <h2 className="h2">Shopping Cart</h2>
                <div className="muted">{cartLines.length} items</div>
              </div>

              {cartLines.length ? (
                <div className="list">
                  {cartLines.map((l) => (
                    <div key={l.item.id} className="listrow">
                      <div className="listrow__main">
                        <div className="listrow__title">{l.item.name}</div>
                        <div className="listrow__sub">{formatMoneyCents(l.item.priceCents)} each</div>
                        <div className="row">
                          <button type="button" className="btn btn--outline btn--small" onClick={() => setQty(l.item.id, l.quantity - 1)}>
                            −
                          </button>
                          <div className="big">{l.quantity}</div>
                          <button type="button" className="btn btn--outline btn--small" onClick={() => setQty(l.item.id, l.quantity + 1)}>
                            +
                          </button>
                          <button type="button" className="btn btn--outline btn--small" onClick={() => setQty(l.item.id, 0)}>
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="listrow__amount">{formatMoneyCents(l.item.priceCents * l.quantity)}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted">Tap a food or drink item to add it to the cart.</div>
              )}
            </div>

            <div className="ticketForm">
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
                <div className="ticketPrice__value">{formatMoneyCents(totalCents)}</div>
              </div>
              <button type="button" className="primary" disabled={!canConfirm} onClick={() => confirm()}>
                Confirm payment & issue receipt
              </button>
            </div>
          </div>
        </div>

        <BottomBar
          items={[
            { to: '/cashier', label: 'New Ticket' },
            { to: '/cashier/kitchen', label: 'Kitchen', end: true },
            { to: '/cashier/closeout', label: 'Close Day' },
          ]}
        />
      </div>
    </AppShell>
  )
}

