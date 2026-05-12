import './App.css'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './state/auth'
import { Bootstrap } from './pages/Bootstrap'
import { Login } from './pages/Login'
import { CashierTicket } from './pages/CashierTicket'
import { CashierCloseout } from './pages/CashierCloseout'
import { OwnerDashboard } from './pages/OwnerDashboard'
import { OwnerPriceBoard } from './pages/OwnerPriceBoard'
import { OwnerDay } from './pages/OwnerDay'
import { OwnerReports } from './pages/OwnerReports'
import { OwnerCustomers } from './pages/OwnerCustomers'
import { OwnerCustomerDetail } from './pages/OwnerCustomerDetail'

function App() {
  const { bootstrapped, apiError, user, refresh } = useAuth()

  if (bootstrapped === null) {
    return (
      <main className="page">
        <div className="card">Loading…</div>
      </main>
    )
  }

  if (apiError) {
    return (
      <main className="page">
        <div className="card">
          <div className="h1">Cannot reach server</div>
          <div className="muted">{apiError}</div>
          <div className="spacer12"></div>
          <button type="button" className="primary" onClick={() => refresh()}>
            Retry
          </button>
        </div>
      </main>
    )
  }

  return (
    <Routes>
      {!bootstrapped ? (
        <>
          <Route path="/bootstrap" element={<Bootstrap />} />
          <Route path="*" element={<Navigate to="/bootstrap" replace />} />
        </>
      ) : !user ? (
        <>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : user.role === 'cashier' ? (
        <>
          <Route path="/cashier" element={<CashierTicket />} />
          <Route path="/cashier/closeout" element={<CashierCloseout />} />
          <Route path="*" element={<Navigate to="/cashier" replace />} />
        </>
      ) : (
        <>
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/owner/reports" element={<OwnerReports />} />
          <Route path="/owner/customers" element={<OwnerCustomers />} />
          <Route path="/owner/customers/:id" element={<OwnerCustomerDetail />} />
          <Route path="/owner/price-board" element={<OwnerPriceBoard />} />
          <Route path="/owner/day/:date" element={<OwnerDay />} />
          <Route path="*" element={<Navigate to="/owner" replace />} />
        </>
      )}
    </Routes>
  )
}

export default App
