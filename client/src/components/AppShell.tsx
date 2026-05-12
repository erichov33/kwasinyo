import { NavLink } from 'react-router-dom'
import type React from 'react'
import { useAuth } from '../state/auth'

type NavItem = { to: string; label: string; icon: string; end?: boolean }

export function AppShell({
  section,
  nav,
  children,
}: {
  section: string
  nav: NavItem[]
  children: React.ReactNode
}) {
  const { user, logout } = useAuth()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo">K</div>
          <div className="sidebar__brandText">
            <div className="sidebar__name">KwaSinyo</div>
            <div className="sidebar__role">{user?.role === 'owner' ? 'Owner' : 'Cashier'}</div>
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
                {item.icon}
              </span>
              <span className="sideItem__label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__footer">
          <button type="button" className="sideItem sideItem--danger" onClick={() => logout()}>
            <span className="sideItem__icon" aria-hidden="true">
              ⎋
            </span>
            <span className="sideItem__label">Logout</span>
          </button>
        </div>
      </aside>

      <div className="shell__main">
        <header className="header">
          <div className="header__left">
            <div className="header__section">{section}</div>
          </div>
          <div className="header__center">
            <div className="search">
              <input className="search__input" placeholder="Search tickets, days, plates…" />
              <div className="search__icon" aria-hidden="true">
                ⌕
              </div>
            </div>
          </div>
          <div className="header__right">
            <div className="userPill">
              <div className="userPill__dot" aria-hidden="true"></div>
              <div className="userPill__name">{user?.username ?? '—'}</div>
            </div>
          </div>
        </header>

        <div className="shell__content">{children}</div>
      </div>
    </div>
  )
}
