export type NavItem = { to: string; label: string; icon: string; end?: boolean }

export const ownerNav: NavItem[] = [
  { to: '/owner', label: 'Dashboard', icon: '⌂', end: true },
  { to: '/owner/reports', label: 'Reports', icon: '▦' },
  { to: '/owner/customers', label: 'Customers', icon: '◎' },
  { to: '/owner/price-board', label: 'Price Board', icon: '≡' },
]

export const cashierNav: NavItem[] = [
  { to: '/cashier', label: 'New Ticket', icon: '+', end: true },
  { to: '/cashier/closeout', label: 'Close Day', icon: '✓' },
]

