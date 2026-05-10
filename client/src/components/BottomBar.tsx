import { NavLink } from 'react-router-dom'
import { useAuth } from '../state/auth'

export function BottomBar({
  items,
}: {
  items: Array<{ to: string; label: string; end?: boolean }>
}) {
  const { logout } = useAuth()

  return (
    <footer className="bottombar">
      <nav className="bottombar__nav">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.end}
            className={({ isActive }) => (isActive ? 'tab tab--active' : 'tab')}
          >
            {i.label}
          </NavLink>
        ))}
        <button type="button" className="tab tab--danger" onClick={() => logout()}>
          Logout
        </button>
      </nav>
    </footer>
  )
}

