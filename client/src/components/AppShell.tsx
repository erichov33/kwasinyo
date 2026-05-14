import { NavLink } from 'react-router-dom'
import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../state/auth'
import type { NavItem } from '../lib/nav'

function renderIcon(name: string) {
  switch (name) {
    case 'home':
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M3 11.5 12 4l9 7.5V20a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 20v-8.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path
            d="M9 21.5v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'plus':
      return (
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
      )
    case 'tickets':
      return (
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
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'customers':
      return (
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
      )
    case 'services':
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M12 2.5c-2.4 3.2-6.5 6.9-6.5 11A6.5 6.5 0 0 0 12 20a6.5 6.5 0 0 0 6.5-6.5c0-4.1-4.1-7.8-6.5-11Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'reports':
      return (
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
      )
    case 'vehicle-models':
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M4 13.5V17a2 2 0 0 0 2 2h1m11-5.5V17a2 2 0 0 1-2 2h-1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.2 13.5 7.8 9.3A3 3 0 0 1 10.6 7.5h2.8a3 3 0 0 1 2.8 1.8l1.6 4.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'users':
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M15 10a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4.5 20c2.2-3.4 5-5 7.5-5s5.3 1.6 7.5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M19.4 12a7.7 7.7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L15 3h-6l-.2 3.1c-.6.3-1.2.6-1.7 1l-2.4-1-2 3.4 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1c.5.4 1.1.7 1.7 1L9 21h6l.2-3.1c.6-.3 1.2-.6 1.7-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'kitchen':
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M7 3v8a3 3 0 0 0 3 3v7M7 7h6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17 3v18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'closeout':
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M20 6 9 17l-5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    default:
      return (
        <svg viewBox="0 0 24 24" role="presentation" focusable="false">
          <path
            d="M12 3v18M3 12h18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
  }
}

export function AppShell({
  section,
  nav,
  children,
}: {
  section?: string
  nav: NavItem[]
  children: React.ReactNode
}) {
  const { user, logout } = useAuth()
  const [now, setNow] = useState(() => new Date())
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      if (!t) return
      if (t.closest('.sidebarUser')) return
      setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const meta = useMemo(() => {
    const date = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    return { date, time }
  }, [now])

  const avatarLetter = useMemo(() => {
    const u = (user?.username ?? '').trim()
    return (u ? u[0] : 'U').toUpperCase()
  }, [user?.username])

  const shellClass = section === 'Dashboard' ? 'shell shell--dashboard' : 'shell'

  return (
    <div className={shellClass}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo" aria-hidden="true">
            <svg viewBox="0 0 92 52" role="presentation" focusable="false">
              <path
                d="M8 33c7-10 16-16 27-18 14-2 26 1 34 7 8 6 14 14 18 25"
                fill="none"
                stroke="rgba(255,255,255,0.95)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M16 26c7-5 15-7 25-7 9 0 18 2 26 7"
                fill="none"
                stroke="rgba(96,165,250,0.95)"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <circle cx="64" cy="12" r="5" fill="rgba(96,165,250,0.95)" />
              <circle cx="76" cy="8" r="3.5" fill="rgba(96,165,250,0.75)" />
              <circle cx="82" cy="18" r="2.8" fill="rgba(96,165,250,0.65)" />
            </svg>
          </div>
          <div className="sidebar__brandText">
            <div className="sidebar__name">KWA SINYO</div>
            <div className="sidebar__tagline">CAR WASH</div>
          </div>
        </div>

        <nav className="sidebar__nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'sideItem sideItem--active' : 'sideItem')}
            >
              <span className="sideItem__icon" aria-hidden="true">
                {renderIcon(item.icon)}
              </span>
              <span className="sideItem__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <div
            className="sidebarUser"
            role="button"
            tabIndex={0}
            onClick={() => setMenuOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setMenuOpen((v) => !v)
            }}
          >
            <div className="sidebarUser__avatar" aria-hidden="true">
              {avatarLetter}
            </div>
            <div className="sidebarUser__meta">
              <div className="sidebarUser__name">{user?.username ?? '—'}</div>
              <div className="sidebarUser__role">{user?.role === 'owner' ? 'Administrator' : 'Cashier'}</div>
            </div>
            <div className="sidebarUser__chev" aria-hidden="true">
              ▾
            </div>
            {menuOpen ? (
              <div className="sidebarUserMenu">
                <button type="button" className="sidebarUserMenu__btn" onClick={() => logout()}>
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <div className="shell__main">
        <header className="header">
          <div className="header__left">
            <div className="header__greeting">
              <div className="header__hello">
                Welcome back, {user?.role === 'owner' ? 'Admin' : 'Cashier'}{' '}
                <span aria-hidden="true">👋</span>
              </div>
            </div>
          </div>
          <div className="header__right">
            <div className="header__meta">
              <div className="header__metaItem" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}>
                <span className="header__metaIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M7 3v3M17 3v3M4.5 8h15M6 6h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>{meta.date}</span>
              </div>
              <div style={{ width: 1, height: 16, backgroundColor: 'rgba(148,163,184,0.4)', margin: '0 8px' }}></div>
              <div className="header__metaItem" style={{ border: 'none', background: 'transparent', boxShadow: 'none' }}>
                <span className="header__metaIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                    <path
                      d="M12 7v6l4 2"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span>{meta.time}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="shell__content">{children}</div>

        <footer style={{ display: 'flex', justifyContent: 'space-between', padding: '24px 18px', borderTop: '1px solid rgba(148,163,184,0.2)', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
          <div>© 2026 Kwa Sinyo Car Wash System. All rights reserved.</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#3b82f6', fontSize: 14 }}>🚙</span> Built for performance. Driven by service.
          </div>
        </footer>
      </div>
    </div>
  )
}
