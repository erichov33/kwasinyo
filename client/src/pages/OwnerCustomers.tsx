import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { formatMoneyCents } from '../lib/money'

type CustomerRow = {
  id: number
  name: string
  phone: string | null
  notes: string | null
  plates: string[]
  stats: {
    totalVisits: number
    lastVisitAt: string | null
    visitsLast30: number
    visitsLast90: number
    avgRevenueCents: number
  }
}

type HighFreqRow = {
  customerId: number
  name: string
  phone: string | null
  visits: number
  revenueCents: number
  lastVisitAt: string | null
}

export function OwnerCustomers() {
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newPlate, setNewPlate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [highFreq, setHighFreq] = useState<HighFreqRow[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await api<{ customers: CustomerRow[] }>(`/api/owner/customers?q=${encodeURIComponent(query)}`)
      setCustomers(res.customers)
      const hf = await api<{ rows: HighFreqRow[] }>(`/api/owner/customers/high-frequency?days=30&limit=8`)
      setHighFreq(hf.rows)
    } catch (err: any) {
      setError(err?.message ?? 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load('')
  }, [])

  const shown = useMemo(() => customers, [customers])

  const createCustomer = async () => {
    setCreating(true)
    setError(null)
    try {
      const plates = newPlate.trim() ? [newPlate.trim()] : []
      const res = await api<{ ok: true; id: number }>('/api/owner/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim() || undefined,
          phone: newPhone.trim() || undefined,
          plates: plates.length ? plates : undefined,
        }),
      })
      setNewName('')
      setNewPhone('')
      setNewPlate('')
      await load(q)
      window.location.href = `/owner/customers/${res.id}`
    } catch (err: any) {
      setError(err?.message ?? 'create_failed')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppShell
      section="Customers"
      nav={[
        { to: '/owner', label: 'Dashboard', icon: '⌂', end: true },
        { to: '/owner/reports', label: 'Reports', icon: '▦' },
        { to: '/owner/customers', label: 'Customers', icon: '◎' },
        { to: '/owner/price-board', label: 'Price Board', icon: '≡' },
      ]}
    >
      <div className="shellInner stack">
        <div className="card">
          <div className="row">
            <div>
              <h1 className="h1">Customers</h1>
              <div className="muted">Customer database, visit history, and loyalty tracking</div>
            </div>
          </div>

          <div className="filterBar">
            <div className="filterBar__grid filterBar__grid--customers">
              <div className="field">
                <label>Search</label>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Name, phone, or plate"
                  inputMode="search"
                />
              </div>
              <div className="field filterBar__action">
                <label>&nbsp;</label>
                <button type="button" className="btn btn--solid btn--small" onClick={() => load(q)} disabled={loading}>
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>

        {error ? <div className="alert alert--bad">{error}</div> : null}

        <div className="dashGrid">
          <div className="card">
            <div className="row">
              <h2 className="h2">Create Customer</h2>
              <div className="muted">Save details and link plates</div>
            </div>
            <div className="grid2">
              <div className="field">
                <label>Name</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Thabo" />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="e.g. +27..." inputMode="tel" />
              </div>
            </div>
            <div className="grid2">
              <div className="field">
                <label>Plate (optional)</label>
                <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="e.g. ABC123GP" />
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <button type="button" className="btn btn--solid" onClick={createCustomer} disabled={creating}>
                  Save Customer
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="row">
              <h2 className="h2">High-frequency (30 days)</h2>
              <div className="muted">Top returning customers</div>
            </div>
            {highFreq.length ? (
              <div className="list">
                {highFreq.map((c) => (
                  <div key={c.customerId} className="listrow">
                    <div>
                      <div className="listrow__title">
                        <Link className="link" to={`/owner/customers/${c.customerId}`}>
                          {c.name || 'Unknown'}
                        </Link>
                      </div>
                      <div className="listrow__sub">
                        {c.phone ?? 'No phone'} • Last visit {c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString() : '—'}
                      </div>
                    </div>
                    <div className="listrow__amount">
                      {c.visits} visits • {formatMoneyCents(c.revenueCents)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="muted">No data.</div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="row">
            <h2 className="h2">Customer Database</h2>
            <div className="muted">{shown.length} customers</div>
          </div>
          {shown.length ? (
            <div className="table">
              <div className="trow trow--head">
                <div className="trow__cell">Customer</div>
                <div className="trow__cell">Plates</div>
                <div className="trow__cell trow__right">Visits</div>
                <div className="trow__cell trow__right">Avg / visit</div>
                <div className="trow__cell">Last visit</div>
              </div>
              {shown.map((c) => (
                <div key={c.id} className="trow">
                  <div className="trow__cell">
                    <div className="trow__title">
                      <Link className="link" to={`/owner/customers/${c.id}`}>
                        {c.name || 'Unknown'}
                      </Link>
                    </div>
                    <div className="trow__sub">{c.phone ?? 'No phone'}</div>
                  </div>
                  <div className="trow__cell">{c.plates.join(', ') || '—'}</div>
                  <div className="trow__cell trow__right">{c.stats.totalVisits}</div>
                  <div className="trow__cell trow__right">{formatMoneyCents(c.stats.avgRevenueCents)}</div>
                  <div className="trow__cell">{c.stats.lastVisitAt ? new Date(c.stats.lastVisitAt).toLocaleDateString() : '—'}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No customers yet.</div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
