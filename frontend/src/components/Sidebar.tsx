import { LogoutIcon, MoonIcon, SunIcon } from './icons';
import { NavIcon } from './NavIcon';
import { NAV_ITEMS } from '../nav';
import type { TabId } from '../nav';
import type { Theme } from '../hooks/useTheme';
import type { AuthUserDto } from '../types';
import { userInitial } from '../utils/text';

type SidebarProps = {
  activeTab: TabId;
  onChangeTab: (tab: TabId) => void;
  theme: Theme;
  onToggleTheme: () => void;
  user: AuthUserDto;
  onSignOut: () => void;
  lastUpdatedText: string | null;
};

export function Sidebar({
  activeTab,
  onChangeTab,
  theme,
  onToggleTheme,
  user,
  onSignOut,
  lastUpdatedText,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="dot" aria-hidden="true" />
        DevPulse
      </div>

      <nav className="sidebar-nav" aria-label="Разделы">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`sidebar-nav-item${activeTab === item.id ? ' is-active' : ''}`}
            aria-current={activeTab === item.id ? 'page' : undefined}
            onClick={() => onChangeTab(item.id)}
          >
            <NavIcon id={item.id} />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="sidebar-account">
        <div className="user-chip" title={user.email}>
          {user.avatarUrl ? (
            <img className="user-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="user-avatar user-avatar-fallback" aria-hidden="true">
              {userInitial(user.name)}
            </span>
          )}
          <span className="user-name">{user.name}</span>
        </div>
        <div className="sidebar-account-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label="Переключить тему"
            title="Переключить тему"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onSignOut}
            aria-label="Выйти"
            title="Выйти"
          >
            <LogoutIcon />
          </button>
          {lastUpdatedText && <span className="last-updated">{lastUpdatedText}</span>}
        </div>
      </div>
    </aside>
  );
}
