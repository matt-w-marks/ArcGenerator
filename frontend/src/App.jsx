import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DashboardLayout from './components/layout/DashboardLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SchedulePage from './pages/SchedulePage';
import ChecklistsPage from './pages/ChecklistsPage';
import ZonesPage from './pages/ZonesPage';
import RolesPage from './pages/RolesPage';
import EngagementsPage from './pages/EngagementsPage';
import FinancesPage from './pages/FinancesPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import FleetPage from './pages/FleetPage';
import InvitePage from './pages/InvitePage';

function ProtectedRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-arc border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}

function HomeRoute() {
  const { user } = useAuth();
  if (user?.role === 'VIEWER') return <Navigate to="/reports" replace />;
  return <DashboardPage />;
}

function RoleGate({ allow, children }) {
  const { user } = useAuth();
  if (!allow.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

function PublicRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/invite/:token" element={<InvitePage />} />
          </Route>
          <Route element={<ProtectedRoutes />}>
            <Route index element={<HomeRoute />} />
            <Route path="/calendar" element={<RoleGate allow={['ADMIN', 'OPERATOR']}><SchedulePage /></RoleGate>} />
            <Route path="/checklists" element={<RoleGate allow={['ADMIN', 'OPERATOR']}><ChecklistsPage /></RoleGate>} />
            <Route path="/zones" element={<RoleGate allow={['ADMIN', 'OPERATOR']}><ZonesPage /></RoleGate>} />
            <Route path="/roles" element={<RoleGate allow={['ADMIN', 'OPERATOR']}><RolesPage /></RoleGate>} />
            <Route path="/engagements" element={<RoleGate allow={['ADMIN', 'OPERATOR']}><EngagementsPage /></RoleGate>} />
            <Route path="/finances" element={<RoleGate allow={['ADMIN', 'OPERATOR']}><FinancesPage /></RoleGate>} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/fleet" element={<RoleGate allow={['ADMIN', 'OPERATOR']}><FleetPage /></RoleGate>} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
