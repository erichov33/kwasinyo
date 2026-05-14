import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { api } from '../lib/api'
import { ownerNav } from '../lib/nav'
import heroImg from '../assets/dashboard-hero.png'

type Snapshot = {
  dayDate: string
  carsWashedToday: number
  expectedRevenueTodayCents: number
  newCustomersToday: number
  reconciliationStatus: 'pending' | 'cashier_submitted' | 'confirmed'
  todayDiscrepancyCashCents: number | null
  lastConfirmedDiscrepancy: { dayDate: string; discrepancyCashCents: number } | null
}

export function OwnerDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const s = await api<Snapshot>('/api/owner/today-snapshot')
    setSnapshot(s)
  }

  useEffect(() => {
    load().catch((e: any) => setError(e?.message ?? 'load_failed'))
  }, [])

  const formatZarNoDecimals = useMemo(() => {
    const fmt = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 })
    return (cents: number) => fmt.format((cents ?? 0) / 100)
  }, [])

  return (
    <AppShell section="Dashboard" nav={ownerNav}>
      <div className="shellInner">
        {error ? <div className="alert alert--bad">{error}</div> : null}

        {snapshot ? (
          <div className="dashHero" style={{ backgroundImage: `url(${heroImg})` }}>
            <div className="dashHero__shade" aria-hidden="true"></div>
            <div className="dashHero__content">
              <div className="dashHero__title">
                <div className="dashHero__brand">KWA SINYO</div>
                <div className="dashHero__brandAccent">CAR WASH</div>
              </div>
              <div className="dashHero__underline" aria-hidden="true"></div>
              <div className="dashHero__subTitle">Clean Car. Great Experience.</div>
              <div className="dashHero__sub">Efficient. Reliable. Professional.</div>
              <div className="dashHero__sub">Managing every wash with care.</div>
              <Link className="dashHero__btn" to="/owner/new-ticket">
                <span className="dashHero__btnIcon" aria-hidden="true">
                  +
                </span>
                New Ticket
              </Link>
              <div className="dashHero__hint">Create a new wash ticket for a walk-in customer.</div>
            </div>
          </div>
        ) : (
          <div className="heroBanner heroBanner--loading">
            <div className="heroBanner__title">Loading…</div>
          </div>
        )}

        {snapshot ? (
          <div className="dashTiles">
            <Link className="dashTile dashTile--tickets" to={`/owner/day/${snapshot.dayDate}`}>
              <div className="dashTile__icon dashTile__icon--blue" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path
                    d="M3 13.5V17a2 2 0 0 0 2 2h1m13-5.5V17a2 2 0 0 1-2 2h-1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5.5 13.5 7.2 8.8A3 3 0 0 1 10 7h4a3 3 0 0 1 2.8 1.8l1.7 4.7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="dashTile__body">
                <div className="dashTile__label">Today’s Tickets</div>
                <div className="dashTile__value">{snapshot.carsWashedToday}</div>
                <div className="dashTile__link">
                  View all tickets <span aria-hidden="true">→</span>
                </div>
              </div>
            </Link>

            <Link className="dashTile dashTile--revenue" to="/owner/reports">
              <div className="dashTile__icon dashTile__icon--green" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path
                    d="M4 7h16v10H4z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 14.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M6 9.5c1.1 0 2-.9 2-2m10 0c0 1.1.9 2 2 2m0 5c-1.1 0-2 .9-2 2M8 16.5c0-1.1-.9-2-2-2"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="dashTile__body">
                <div className="dashTile__label">Today’s Revenue</div>
                <div className="dashTile__value">{formatZarNoDecimals(snapshot.expectedRevenueTodayCents)}</div>
                <div className="dashTile__link">
                  View reports <span aria-hidden="true">→</span>
                </div>
              </div>
            </Link>

            <Link className="dashTile dashTile--customers" to="/owner/customers">
              <div className="dashTile__icon dashTile__icon--orange" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path
                    d="M16 11a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M5 20c1.7-3 4.2-4.5 7-4.5s5.3 1.5 7 4.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="dashTile__body">
                <div className="dashTile__label">New Customers</div>
                <div className="dashTile__value">{snapshot.newCustomersToday}</div>
                <div className="dashTile__link">
                  View customers <span aria-hidden="true">→</span>
                </div>
              </div>
            </Link>
          </div>
        ) : null}

        <div className="dashMain">
          <div className="card">
            <div className="row">
              <h2 className="h2">Our Wash Services</h2>
            </div>
            <div className="dashServices">
              <div className="dashServiceCard">
                <div className="dashServiceCard__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M4 14v3a2 2 0 0 0 2 2h1m11-5v3a2 2 0 0 1-2 2h-1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6.2 14 7.6 9.9A3 3 0 0 1 10.4 8h3.2a3 3 0 0 1 2.8 1.9l1.4 4.1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8.2 19.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm7.6 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashServiceCard__title">Full Wash</div>
                <div className="dashServiceCard__sub">Exterior & Interior</div>
                <div className="dashServiceCard__sub">Deep Clean</div>
              </div>
              <div className="dashServiceCard">
                <div className="dashServiceCard__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M5 14v3a2 2 0 0 0 2 2h1m9-5v3a2 2 0 0 1-2 2h-1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7.2 14 8.2 10.6A3 3 0 0 1 11.1 8.5h1.8a3 3 0 0 1 2.9 2.1l1 3.4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 19.3a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Zm6 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 6.8c.8-1.3 2.2-2 3.9-2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashServiceCard__title">Standard Wash</div>
                <div className="dashServiceCard__sub">Exterior Wash</div>
                <div className="dashServiceCard__sub">& Vacuum</div>
              </div>
              <div className="dashServiceCard">
                <div className="dashServiceCard__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M7 17c1.5 1 3.2 1.5 5 1.5s3.5-.5 5-1.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8.2 10.5c.4-1.8 1.9-3.2 3.8-3.2s3.4 1.4 3.8 3.2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 13.5c0 1.2 1.3 2.2 3 2.2s3-1 3-2.2-1.3-2.2-3-2.2-3 1-3 2.2Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashServiceCard__title">Body Wash</div>
                <div className="dashServiceCard__sub">Exterior Wash</div>
                <div className="dashServiceCard__sub">& Dry</div>
              </div>
              <div className="dashServiceCard">
                <div className="dashServiceCard__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M12 5v14M5 12h14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashServiceCard__title">Additional Services</div>
                <div className="dashServiceCard__sub">Wax, Polish, Tyre Shine</div>
                <div className="dashServiceCard__sub">& More</div>
              </div>
            </div>
            <div className="dashServices__link">
              <Link to="/owner/price-board">View all services →</Link>
            </div>
          </div>

          <div className="card">
            <h2 className="h2">Quick Actions</h2>
            <div className="dashActions">
              <Link className="dashAction" to="/owner/new-ticket">
                <div className="dashAction__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M12 5v14M5 12h14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashAction__body">
                  <div className="dashAction__title">New Ticket</div>
                  <div className="dashAction__sub">Create a new wash ticket</div>
                </div>
                <div className="dashAction__chev" aria-hidden="true">
                  ›
                </div>
              </Link>
              <Link className="dashAction" to="/owner/day/today">
                <div className="dashAction__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M8 6h8M8 10h8M8 14h6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashAction__body">
                  <div className="dashAction__title">View Tickets</div>
                  <div className="dashAction__sub">View all wash tickets</div>
                </div>
                <div className="dashAction__chev" aria-hidden="true">
                  ›
                </div>
              </Link>
              <Link className="dashAction" to="/owner/customers">
                <div className="dashAction__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M16 10.5a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5.5 20c1.8-3 4.3-4.5 6.5-4.5s4.7 1.5 6.5 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashAction__body">
                  <div className="dashAction__title">Customers</div>
                  <div className="dashAction__sub">Manage customer profiles</div>
                </div>
                <div className="dashAction__chev" aria-hidden="true">
                  ›
                </div>
              </Link>
              <Link className="dashAction" to="/owner/reports">
                <div className="dashAction__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M5 19V5M5 19h14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 16V12M13 16V8M17 16v-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div className="dashAction__body">
                  <div className="dashAction__title">Reports</div>
                  <div className="dashAction__sub">View sales and performance</div>
                </div>
                <div className="dashAction__chev" aria-hidden="true">
                  ›
                </div>
              </Link>
            </div>

            {snapshot?.reconciliationStatus === 'cashier_submitted' ? (
              <div className="callout callout--warn">
                Cashier submitted closeout. Review and confirm.
                <Link className="btn btn--solid btn--small" to={`/owner/day/${snapshot.dayDate}`}>
                  Review
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
