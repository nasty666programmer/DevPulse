import { LogoutIcon, MoonIcon, RefreshIcon, SunIcon } from './icons';
import type { Theme } from '../hooks/useTheme';
import type { AuthUserDto } from '../types';

type HeaderProps = {
  theme: Theme;
  onToggleTheme: () => void;
  lastUpdatedText: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  user: AuthUserDto;
  onSignOut: () => void;
};

function initials(name: string): string {
  return name.trim().slice(0, 1).toUpperCase() || '?';
}

export function Header({
  theme,
  onToggleTheme,
  lastUpdatedText,
  onRefresh,
  isRefreshing,
  user,
  onSignOut,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="wrap">
        <div className="brand">
          <span className="dot" aria-hidden="true" />
          DevPulse
        </div>
        <div className="header-right">
          {lastUpdatedText && <span className="last-updated">{lastUpdatedText}</span>}
          <div className="user-chip" title={user.email}>
            {user.avatarUrl ? (
              <img className="user-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              <span className="user-avatar user-avatar-fallback" aria-hidden="true">
                {initials(user.name)}
              </span>
            )}
            <span className="user-name">{user.name}</span>
          </div>
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <RefreshIcon className={isRefreshing ? 'spin-icon' : undefined} />
            <span className="btn-label">{isRefreshing ? 'Обновляем…' : 'Обновить'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
