import { useState } from 'react';
import { Database, Users, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DataPage from './DataPage';
import UsersPage from './UsersPage';

const TABS = [
  { id: 'data', label: 'Data', icon: Database, roles: ['ADMIN', 'OPERATOR'] },
  { id: 'users', label: 'Users', icon: Users, roles: ['ADMIN'] },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const visibleTabs = TABS.filter((t) => t.roles.includes(user?.role));
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.id || 'data');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="text-xs text-ink-400 mt-0.5">System configuration, reference data, and user management</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-obsidian-700">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-arc text-arc'
                  : 'border-transparent text-ink-400 hover:text-ink-200'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'data' && <DataPage />}
      {activeTab === 'users' && <UsersPage />}
    </div>
  );
}
