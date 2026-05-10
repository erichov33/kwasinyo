import { Link } from 'react-router-dom'
import { useAuth } from '../state/auth'

export function TopBar({
  title,
  links,
}: {
  title: string
  links: Array<{ to: string; label: string }>
}) {
  const { logout, user } = useAuth()

  return (
    <header className="topbar">
      <div className="topbar__title">{title}</div>
      <nav className="topbar__nav">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="chip">
            {l.label}
          </Link>
        ))}
        {user ? (
          <button type="button" className="chip chip--danger" onClick={() => logout()}>
            Logout
          </button>
        ) : null}
      </nav>
    </header>
  )
}

