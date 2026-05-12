import { useEffect, useMemo, useState } from 'react'
import { BottomBar } from '../components/BottomBar'
import { Badge } from '../components/Badge'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { cashierNav } from '../lib/nav'
import { useTodaySummary } from '../hooks/useTodaySummary'
import { formatMoneyCents, parseMoneyToCents } from '../lib/money'

export function CashierCloseout() {
  const { data: summary, error: loadError, reload } = useTodaySummary()
  const [declaredInput, setDeclaredInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const showError = error ?? loadError

  useEffect(() => {
    if (!summary?.reconciliation) return
    setDeclaredInput(String((summary.reconciliation.declaredCashCents / 100).toFixed(2)))
  }, [summary?.reconciliation])

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
      await reload()
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
    <AppShell section="Cashier" nav={cashierNav}>
      <div className="shellInner page--with-bottom">
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
            {showError ? <div className="alert alert--bad">{showError}</div> : null}

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
      </div>
    </AppShell>
  )
}
