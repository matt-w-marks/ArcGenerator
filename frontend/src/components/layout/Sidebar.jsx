import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  MapPin,
  Building2,
  Handshake,
  DollarSign,
  Settings,
  LogOut,
  ChevronRight,
  Map,
  CalendarDays,
  ClipboardCheck,
  BarChart3,
  Truck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../lib/utils';

// roles: which roles can see this nav item. If omitted, ADMIN+OPERATOR only by default.
const NAV_SECTIONS = [
  {
    label: null,
    items: [
      { to: '/', label: 'Daily Log', icon: LayoutDashboard, end: true, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/checklists', label: 'Checklists', icon: ClipboardCheck, roles: ['ADMIN', 'OPERATOR'] },
    ],
  },
  {
    label: 'Ventures',
    roles: ['ADMIN', 'OPERATOR'],
    items: [
      { to: '/zones', label: 'Zones', icon: MapPin },
    ],
  },
  {
    label: 'Roles',
    roles: ['ADMIN', 'OPERATOR'],
    items: [
      { to: '/roles', label: 'Positions', icon: Building2 },
    ],
  },
  {
    label: 'Engagements',
    roles: ['ADMIN', 'OPERATOR'],
    items: [
      { to: '/engagements', label: 'Clients', icon: Handshake },
    ],
  },
  {
    label: 'Financial',
    items: [
      { to: '/finances', label: 'Finances', icon: DollarSign, roles: ['ADMIN', 'OPERATOR'] },
      { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN', 'OPERATOR', 'VIEWER'] },
    ],
  },
  {
    label: 'Fleet',
    roles: ['ADMIN', 'OPERATOR'],
    items: [
      { to: '/fleet', label: 'Vehicles', icon: Truck },
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
        {NAV_SECTIONS.map((section, i) => {
          // Hide entire section if role doesn't match
          if (section.roles && !section.roles.includes(user?.role)) return null;
          // Filter items by role
          const visibleItems = section.items.filter((item) => !item.roles || item.roles.includes(user?.role));
          if (visibleItems.length === 0) return null;
          return (
            <div key={i} className={i > 0 ? 'mt-4' : ''}>
              {!collapsed && section.label && (
                <p className="section-label px-3 mb-1">{section.label}</p>
              )}
              {collapsed && section.label && (
                <div className="border-t border-obsidian-700/50 my-2" />
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => (
                  <NavItem key={item.to} {...item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          );
        })}
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
            <p className="text-xs text-ink-100 truncate">
              {user?.first_name || user?.last_name
                ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                : 'User'}
            </p>
            <p className="text-[10px] text-ink-400 truncate">{user?.email || ''}</p>
            <p className="text-[9px] text-ink-500 uppercase tracking-wide">{user?.role ?? ''}</p>
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
