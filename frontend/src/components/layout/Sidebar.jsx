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

function NavItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all relative',
          isActive
            ? 'bg-arc/10 text-arc arc-glow-text'
            : 'text-ink-200 hover:text-ink-50 hover:bg-obsidian-700'
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={16} className={isActive ? 'text-arc' : 'text-ink-300 group-hover:text-ink-200'} />
          <span className="flex-1">{label}</span>
          {isActive && <ChevronRight size={14} className="text-arc" />}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside className="flex flex-col w-60 h-full bg-obsidian-900 border-r border-obsidian-600">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-obsidian-600">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-arc/10 arc-glow">
          <Map size={16} className="text-arc" />
        </div>
        <span className="font-display font-bold text-ink-50 tracking-tight">RoadMap</span>
        {onClose && (
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
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {NAV_SECTIONS.map((section, i) => (
          <div key={i} className={i > 0 ? 'mt-4' : ''}>
            {section.label && (
              <p className="section-label px-3 mb-1">{section.label}</p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-4 border-t border-obsidian-600 space-y-1">
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ink-200 hover:text-ink-50 hover:bg-obsidian-700 transition-all"
        >
          <Settings size={16} className="text-ink-300" />
          Settings
        </NavLink>

        {/* User footer */}
        <div className="mt-2 px-3 py-2">
          <p className="text-xs text-ink-300 truncate">{user?.sub ?? 'User'}</p>
          <p className="section-label">{user?.role ?? ''}</p>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-ink-200 hover:text-error hover:bg-error/10 transition-all"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
