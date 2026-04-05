import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Car,
  Briefcase,
  DollarSign,
  Settings,
  LogOut,
  ChevronRight,
  Map,
  CalendarDays,
  Database,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Shift Log', icon: LayoutDashboard, end: true },
      { to: '/schedule', label: 'Schedule', icon: CalendarDays },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { to: '/driving', label: 'Driving', icon: Car },
      { to: '/jobs',    label: 'Contract Work', icon: Briefcase },
    ],
  },
  {
    label: 'Financial',
    items: [
      { to: '/finances', label: 'Finances', icon: DollarSign },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/data', label: 'Data', icon: Database },
    ],
  },
];

function NavItem({ to, label, icon: Icon, end, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg text-sm font-medium transition-all relative',
          collapsed ? 'px-2.5 py-2 justify-center' : 'px-3 py-2',
          isActive
            ? 'bg-arc/10 text-arc arc-glow-text'
            : 'text-ink-200 hover:text-ink-50 hover:bg-obsidian-700'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={isActive ? 'text-arc' : 'text-ink-300 group-hover:text-ink-200'} />
          {!collapsed && <span className="flex-1">{label}</span>}
          {!collapsed && isActive && <ChevronRight size={14} className="text-arc" />}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ onClose, collapsed = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside className={`flex flex-col h-full bg-obsidian-900 border-r border-obsidian-600 transition-all duration-200 ${collapsed ? 'w-14' : 'w-60'}`}>
      {/* Logo */}
      <div className={`flex items-center gap-2 py-5 border-b border-obsidian-600 ${collapsed ? 'px-2.5 justify-center' : 'px-4'}`}>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-arc/10 arc-glow shrink-0">
          <Map size={16} className="text-arc" />
        </div>
        {!collapsed && <span className="font-display font-bold text-ink-50 tracking-tight">ArcGenerator</span>}
        {!collapsed && onClose && (
          <button
            onClick={onClose}
            className="ml-auto text-ink-300 hover:text-ink-50 transition-colors lg:hidden"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        )}
      </div>

      {/* Main nav */}
      <nav className={`flex-1 py-4 overflow-y-auto ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {NAV_SECTIONS.map((section, i) => (
          <div key={i} className={i > 0 ? 'mt-4' : ''}>
            {!collapsed && section.label && (
              <p className="section-label px-3 mb-1">{section.label}</p>
            )}
            {collapsed && section.label && (
              <div className="border-t border-obsidian-700/50 my-2" />
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} collapsed={collapsed} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className={`py-4 border-t border-obsidian-600 space-y-1 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {!collapsed && (
          <NavLink
            to="/settings"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ink-200 hover:text-ink-50 hover:bg-obsidian-700 transition-all"
          >
            <Settings size={16} className="text-ink-300" />
            Settings
          </NavLink>
        )}
        {collapsed && (
          <NavLink
            to="/settings"
            title="Settings"
            className="flex items-center justify-center px-2.5 py-2 rounded-lg text-sm font-medium text-ink-200 hover:text-ink-50 hover:bg-obsidian-700 transition-all"
          >
            <Settings size={16} className="text-ink-300" />
          </NavLink>
        )}

        {!collapsed && (
          <div className="mt-2 px-3 py-2">
            <p className="text-xs text-ink-300 truncate">{user?.sub ?? 'User'}</p>
            <p className="section-label">{user?.role ?? ''}</p>
          </div>
        )}

        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-ink-200 hover:text-error hover:bg-error/10 transition-all ${collapsed ? 'px-2.5 py-2 justify-center' : 'px-3 py-2'}`}
        >
          <LogOut size={16} />
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
