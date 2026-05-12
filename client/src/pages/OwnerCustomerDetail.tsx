import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge } from '../components/Badge'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { formatDayDate } from '../lib/date'
import { formatMoneyCents } from '../lib/money'

type Customer = {
  id: number
  name: string
  phone: string | null
  notes: string | null
  active: number
  createdAt: string
  updatedAt: string
}

type Stats = {
  totalVisits: number
  lastVisitAt: string | null
  visitsLast30: number
  visitsLast90: number
  avgRevenueCents: number
}

type Loyalty = {
  earnedFreeWashes: number
  grantedFreeWashes: number
  redeemedFreeWashes: number
  availableFreeWashes: number
}

type RewardRow = {
  id: number
  type: 'free_wash'
  note: string | null
  grantedAt: string
  redeemedAt: string | null
}

type VisitRow = {
  ticketNumber: number
  dayDate: string
  plate: string
  vehicleTypeName: string
  serviceTypeName: string
  priceCents: number
  paymentMethod: 'cash' | 'card' | 'other'
  createdAt: string
}

type DetailRes = {
  customer: Customer
  plates: string[]
  stats: Stats
  loyalty: Loyalty
  rewards: RewardRow[]
}

type VisitsRes = { visits: VisitRow[] }

function phoneDigits(phone: string) {
  return phone.replaceAll(/[^\d]/g, '')
}

export function OwnerCustomerDetail() {
  const { id } = useParams()
  const customerId = Number(id)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailRes | null>(null)
  const [visits, setVisits] = useState<VisitRow[]>([])

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)

  const [newPlate, setNewPlate] = useState('')
  const [rewardNote, setRewardNote] = useState('')
  const [notifText, setNotifText] = useState('')
  const [notifStatus, setNotifStatus] = useState<string | null>(null)

  const load = async () => {
    if (!Number.isFinite(customerId)) return
    setLoading(true)
    setError(null)
    try {
      const [d, v] = await Promise.all([
        api<DetailRes>(`/api/owner/customers/${customerId}`),
        api<VisitsRes>(`/api/owner/customers/${customerId}/visits`),
      ])
      setDetail(d)
      setVisits(v.visits)
      setName(d.customer.name ?? '')
      setPhone(d.customer.phone ?? '')
      setNotes(d.customer.notes ?? '')
      setActive(Boolean(d.customer.active))
    } catch (e: any) {
      setError(e?.message ?? 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [customerId])

  const loyaltySummary = useMemo(() => {
    const total = detail?.stats.totalVisits ?? 0
    const mod = total % 10
    const untilNext = total === 0 ? 10 : mod === 0 ? 0 : 10 - mod
    const earned = detail?.loyalty.earnedFreeWashes ?? 0
    const granted = detail?.loyalty.grantedFreeWashes ?? 0
    const pendingGrant = Math.max(0, earned - granted)
    return { untilNext, pendingGrant }
  }, [detail])

  useEffect(() => {
    if (!detail) return
    const first = detail.customer.name?.trim() ? detail.customer.name.trim().split(/\s+/)[0] : 'there'
    const available = detail.loyalty.availableFreeWashes
    const untilNext = loyaltySummary.untilNext
    const msg =
      available > 0
        ? `Hi ${first}, you have a free wash available at KwaSinyo. See you soon!`
        : `Hi ${first}, thanks for choosing KwaSinyo. Your next free wash is in ${untilNext} visit${untilNext === 1 ? '' : 's'}.`
    setNotifText(msg)
  }, [detail, loyaltySummary.untilNext])

  const saveDetails = async () => {
    if (!Number.isFinite(customerId)) return
    setError(null)
    try {
      await api(`/api/owner/customers/${customerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() ? phone.trim() : null,
          notes: notes.trim() ? notes.trim() : null,
          active: active ? 1 : 0,
        }),
      })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'save_failed')
    }
  }

  const addPlate = async () => {
    if (!Number.isFinite(customerId)) return
    setError(null)
    try {
      await api(`/api/owner/customers/${customerId}/plates`, { method: 'POST', body: JSON.stringify({ plate: newPlate }) })
      setNewPlate('')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'plate_add_failed')
    }
  }

  const removePlate = async (plate: string) => {
    if (!Number.isFinite(customerId)) return
    setError(null)
    try {
      await api(`/api/owner/customers/${customerId}/plates/${encodeURIComponent(plate)}`, { method: 'DELETE' })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'plate_remove_failed')
    }
  }

  const grantFreeWash = async () => {
    if (!Number.isFinite(customerId)) return
    setError(null)
    try {
      await api(`/api/owner/customers/${customerId}/rewards/free-wash`, {
        method: 'POST',
        body: JSON.stringify({ note: rewardNote.trim() ? rewardNote.trim() : undefined }),
      })
      setRewardNote('')
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'grant_failed')
    }
  }

  const redeemReward = async (rewardId: number) => {
    if (!Number.isFinite(customerId)) return
    setError(null)
    try {
      await api(`/api/owner/customers/${customerId}/rewards/${rewardId}/redeem`, { method: 'POST', body: '{}' })
      await load()
    } catch (e: any) {
      setError(e?.message ?? 'redeem_failed')
    }
  }

  const copyNotif = async () => {
    setNotifStatus(null)
    try {
      await navigator.clipboard.writeText(notifText)
      setNotifStatus('Copied.')
    } catch {
      setNotifStatus('Copy failed.')
    }
  }

  const openWhatsApp = () => {
    const p = phone.trim() ? phoneDigits(phone.trim()) : ''
    if (!p) return
    const url = `https://wa.me/${encodeURIComponent(p)}?text=${encodeURIComponent(notifText)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const openSms = () => {
    const p = phone.trim()
    if (!p) return
    window.location.href = `sms:${encodeURIComponent(p)}?body=${encodeURIComponent(notifText)}`
  }

  const pageTitle = detail?.customer.name?.trim() ? detail.customer.name.trim() : 'Customer'

  const unredeemedRewards = useMemo(() => (detail?.rewards ?? []).filter((r) => !r.redeemedAt), [detail])

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
        {error ? <div className="alert alert--bad">{error}</div> : null}

        <div className="card">
          <div className="row">
            <div>
              <div className="muted">
                <Link className="link" to="/owner/customers">
                  Customers
                </Link>{' '}
                / {pageTitle}
              </div>
              <h1 className="h1">{pageTitle}</h1>
            </div>
            {loading ? <Badge tone="neutral">Loading</Badge> : active ? <Badge tone="good">Active</Badge> : <Badge tone="warn">Inactive</Badge>}
          </div>

          {detail ? (
            <div className="statRow">
              <div className="statCard">
                <div className="statCard__label">Total visits</div>
                <div className="statCard__value">{detail.stats.totalVisits}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Visits (30d)</div>
                <div className="statCard__value">{detail.stats.visitsLast30}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Avg / visit</div>
                <div className="statCard__value">{formatMoneyCents(detail.stats.avgRevenueCents)}</div>
              </div>
              <div className="statCard">
                <div className="statCard__label">Last visit</div>
                <div className="statCard__value">
                  {detail.stats.lastVisitAt ? new Date(detail.stats.lastVisitAt).toLocaleDateString() : '—'}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="dashGrid">
          <div className="card">
            <div className="row">
              <h2 className="h2">Customer Details</h2>
              <button type="button" className="btn btn--solid btn--small" onClick={() => saveDetails()} disabled={!detail}>
                Save
              </button>
            </div>
            <div className="grid2">
              <div className="field">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27..." inputMode="tel" />
              </div>
            </div>
            <div className="field">
              <label>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any notes about this customer" />
            </div>
            <div className="row">
              <div className="field">
                <label>Status</label>
                <select className="select" value={active ? '1' : '0'} onChange={(e) => setActive(e.target.value === '1')}>
                  <option value="1">Active</option>
                  <option value="0">Inactive</option>
                </select>
              </div>
              <div className="muted tiny">Created: {detail ? new Date(detail.customer.createdAt).toLocaleString() : '—'}</div>
            </div>
          </div>

          <div className="card">
            <div className="row">
              <h2 className="h2">Plates</h2>
              <div className="muted">{detail?.plates.length ?? 0}</div>
            </div>

            <div className="tags">
              {(detail?.plates ?? []).length ? (
                (detail?.plates ?? []).map((p) => (
                  <button key={p} type="button" className="tag" onClick={() => removePlate(p)}>
                    {p} <span className="tag__x">×</span>
                  </button>
                ))
              ) : (
                <div className="muted">No plates linked.</div>
              )}
            </div>

            <div className="grid2">
              <div className="field">
                <label>Add plate</label>
                <input value={newPlate} onChange={(e) => setNewPlate(e.target.value)} placeholder="ABC123GP" />
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <button type="button" className="btn btn--outline" onClick={() => addPlate()} disabled={!newPlate.trim()}>
                  Add
                </button>
              </div>
            </div>
            <div className="muted tiny">Click a plate to remove it.</div>
          </div>
        </div>

        <div className="dashGrid">
          <div className="card">
            <div className="row">
              <h2 className="h2">Loyalty</h2>
              <Badge tone={detail?.loyalty.availableFreeWashes ? 'good' : 'neutral'}>
                {detail ? `${detail.loyalty.availableFreeWashes} free wash${detail.loyalty.availableFreeWashes === 1 ? '' : 'es'} available` : '—'}
              </Badge>
            </div>

            {detail ? (
              <>
                <div className="kv">
                  <div className="listrow">
                    <div>
                      <div className="listrow__title">Earned (every 10 visits)</div>
                      <div className="listrow__sub">
                        {detail.stats.totalVisits} visits → {detail.loyalty.earnedFreeWashes} earned
                      </div>
                    </div>
                    <div className="listrow__amount">{detail.loyalty.earnedFreeWashes}</div>
                  </div>
                  <div className="listrow">
                    <div>
                      <div className="listrow__title">Manual grants</div>
                      <div className="listrow__sub">Owner-granted free washes (“10th wash free”)</div>
                    </div>
                    <div className="listrow__amount">{detail.loyalty.grantedFreeWashes}</div>
                  </div>
                  <div className="listrow">
                    <div>
                      <div className="listrow__title">Redeemed</div>
                      <div className="listrow__sub">Already used</div>
                    </div>
                    <div className="listrow__amount">{detail.loyalty.redeemedFreeWashes}</div>
                  </div>
                </div>

                <div className="callout callout--warn">
                  <div>
                    <div className="listrow__title">Next “10th wash free”</div>
                    <div className="listrow__sub">
                      {loyaltySummary.untilNext === 0
                        ? 'Eligible now'
                        : `In ${loyaltySummary.untilNext} visit${loyaltySummary.untilNext === 1 ? '' : 's'}`}
                      {loyaltySummary.pendingGrant > 0 ? ` • ${loyaltySummary.pendingGrant} ungranted earned reward${loyaltySummary.pendingGrant === 1 ? '' : 's'}` : ''}
                    </div>
                  </div>
                  <button type="button" className="btn btn--solid btn--small" onClick={() => grantFreeWash()}>
                    Grant free wash
                  </button>
                </div>

                <div className="field">
                  <label>Grant note (optional)</label>
                  <input value={rewardNote} onChange={(e) => setRewardNote(e.target.value)} placeholder="e.g. 10th wash reward" />
                </div>

                <div className="row">
                  <div className="muted">Rewards history</div>
                  <div className="muted tiny">{detail.rewards.length} rows</div>
                </div>
                {(detail.rewards ?? []).length ? (
                  <div className="table">
                    {(detail.rewards ?? []).map((r) => (
                      <div key={r.id} className="trow">
                        <div className="trow__cell">
                          <div className="trow__title">Free wash</div>
                          <div className="trow__sub">{r.note ?? '—'}</div>
                        </div>
                        <div className="trow__cell">{new Date(r.grantedAt).toLocaleDateString()}</div>
                        <div className="trow__cell">
                          {r.redeemedAt ? (
                            <Badge tone="neutral">Redeemed</Badge>
                          ) : (
                            <button type="button" className="btn btn--outline btn--small" onClick={() => redeemReward(r.id)}>
                              Redeem
                            </button>
                          )}
                        </div>
                        <div className="trow__cell">{r.redeemedAt ? new Date(r.redeemedAt).toLocaleDateString() : '—'}</div>
                        <div className="trow__cell trow__right"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">No rewards yet.</div>
                )}
              </>
            ) : (
              <div className="muted">Loading loyalty…</div>
            )}
          </div>

          <div className="card">
            <div className="row">
              <h2 className="h2">Notifications</h2>
              <div className="muted">SMS / WhatsApp</div>
            </div>

            <div className="field">
              <label>Message</label>
              <textarea value={notifText} onChange={(e) => setNotifText(e.target.value)} rows={4} />
            </div>

            <div className="row">
              <button type="button" className="btn btn--outline" onClick={() => copyNotif()} disabled={!notifText.trim()}>
                Copy message
              </button>
              <button type="button" className="btn btn--solid" onClick={() => openWhatsApp()} disabled={!phone.trim()}>
                WhatsApp
              </button>
              <button type="button" className="btn btn--outline" onClick={() => openSms()} disabled={!phone.trim()}>
                SMS
              </button>
            </div>
            {notifStatus ? <div className="muted tiny">{notifStatus}</div> : null}
            {!phone.trim() ? <div className="muted tiny">Add a phone number to enable WhatsApp/SMS actions.</div> : null}
            {unredeemedRewards.length ? (
              <div className="muted tiny">
                Tip: {unredeemedRewards.length} unredeemed free wash{unredeemedRewards.length === 1 ? '' : 'es'} available.
              </div>
            ) : null}
          </div>
        </div>

        <div className="card">
          <div className="row">
            <h2 className="h2">Visit History</h2>
            <div className="muted">{visits.length} visits</div>
          </div>

          {visits.length ? (
            <div className="table">
              {visits.map((v) => (
                <div key={`${v.ticketNumber}-${v.createdAt}`} className="trow">
                  <div className="trow__cell">
                    <div className="trow__title">
                      <Link className="link" to={`/owner/day/${v.dayDate}`}>
                        {formatDayDate(v.dayDate)}
                      </Link>{' '}
                      • #{v.ticketNumber}
                    </div>
                    <div className="trow__sub">
                      {v.plate} • {v.vehicleTypeName} • {v.serviceTypeName}
                    </div>
                  </div>
                  <div className="trow__cell">{v.paymentMethod}</div>
                  <div className="trow__cell trow__right">{formatMoneyCents(v.priceCents)}</div>
                  <div className="trow__cell">{new Date(v.createdAt).toLocaleTimeString()}</div>
                  <div className="trow__cell trow__right"></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="muted">No visits yet (visits appear once plates are linked).</div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
