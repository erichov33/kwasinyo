import { useEffect, useMemo, useState } from 'react'
import { BottomBar } from '../components/BottomBar'
import { Badge } from '../components/Badge'
import { api } from '../lib/api'
import { formatMoneyCents, parseMoneyToCents } from '../lib/money'

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

type Summary = {
  dayDate: string
  ticketsCount: number
  expectedRevenueCents: number
  expectedCashCents: number
  reconciliation: Reconciliation | null
}

export function CashierCloseout() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [declaredInput, setDeclaredInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const s = await api<Summary>('/api/closeout/today-summary')
    setSummary(s)
    if (s.reconciliation) setDeclaredInput(String((s.reconciliation.declaredCashCents / 100).toFixed(2)))
  }

  useEffect(() => {
    load()
  }, [])

  const declaredCashCents = useMemo(() => parseMoneyToCents(declaredInput), [declaredInput])

  const canSubmit = Boolean(summary && !summary.reconciliation && declaredCashCents >= 0)

  const submit = async () => {
    if (!summary) return
    setError(null)
    try {
      await api('/api/closeout/cashier-submit', {
        method: 'POST',
        body: JSON.stringify({ declaredCashCents }),
      })
      await load()
    } catch (err: any) {
      setError(err?.message ?? 'submit_failed')
    }
  }

  const discrepancyTone = (discrepancyCashCents: number): 'good' | 'warn' | 'bad' => {
    const abs = Math.abs(discrepancyCashCents)
    if (abs === 0) return 'good'
    if (abs <= 5000) return 'warn'
    return 'bad'
  }

  return (
    <main className="page page--with-bottom">
      <div className="stack">
        <div className="card">
          <div className="row">
            <h1 className="h1">Close Day</h1>
            {summary?.reconciliation?.ownerConfirmedAt ? (
              <Badge tone="good">Confirmed</Badge>
            ) : summary?.reconciliation ? (
              <Badge tone="warn">Submitted</Badge>
            ) : (
              <Badge tone="neutral">Pending</Badge>
            )}
          </div>
          {error ? <div className="alert alert--bad">{error}</div> : null}

          {summary ? (
            <>
              <div className="kv">
                <div className="kv__row">
                  <div className="muted">Tickets</div>
                  <div className="big">{summary.ticketsCount}</div>
                </div>
                <div className="kv__row">
                  <div className="muted">Expected cash</div>
                  <div className="big">{formatMoneyCents(summary.expectedCashCents)}</div>
                </div>
                <div className="kv__row">
                  <div className="muted">Total revenue</div>
                  <div className="big">{formatMoneyCents(summary.expectedRevenueCents)}</div>
                </div>
              </div>

              {summary.reconciliation ? (
                <div className="card card--sub">
                  <div className="row">
                    <div className="muted">Declared cash</div>
                    <div className="big">{formatMoneyCents(summary.reconciliation.declaredCashCents)}</div>
                  </div>
                  <div className="row">
                    <div className="muted">Discrepancy</div>
                    <Badge tone={discrepancyTone(summary.reconciliation.discrepancyCashCents)}>
                      {formatMoneyCents(summary.reconciliation.discrepancyCashCents)}
                    </Badge>
                  </div>
                  <div className="muted">Day is locked for cashier.</div>
                </div>
              ) : (
                <div className="card card--sub">
                  <div className="field">
                    <label>Actual cash on hand</label>
                    <input
                      className="money"
                      inputMode="decimal"
                      value={declaredInput}
                      onChange={(e) => setDeclaredInput(e.target.value)}
                      placeholder="Amount"
                    />
                  </div>
                  <button type="button" className="primary" disabled={!canSubmit} onClick={() => submit()}>
                    Submit declaration (locks the day)
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="muted">Loading…</div>
          )}
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
