export type NavItem = { to: string; label: string; icon: string; end?: boolean }

export const ownerNav: NavItem[] = [
  { to: '/owner', label: 'Home', icon: 'home', end: true },
  { to: '/owner/new-ticket', label: 'New Ticket', icon: 'plus' },
  { to: '/owner/day/today', label: 'Tickets', icon: 'tickets' },
  { to: '/owner/customers', label: 'Customers', icon: 'customers' },
  { to: '/owner/price-board', label: 'Services', icon: 'services' },
  { to: '/owner/reports', label: 'Reports', icon: 'reports' },
  { to: '/owner/vehicle-models', label: 'Vehicle Models', icon: 'vehicle-models' },
  { to: '/owner/users', label: 'Users', icon: 'users' },
  { to: '/owner/settings', label: 'Settings', icon: 'settings' },
]

export const cashierNav: NavItem[] = [
  { to: '/cashier', label: 'New Ticket', icon: 'plus', end: true },
  { to: '/cashier/kitchen', label: 'Kitchen', icon: 'kitchen' },
  { to: '/cashier/closeout', label: 'Close Day', icon: 'closeout' },
]
