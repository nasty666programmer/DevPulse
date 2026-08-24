import { LogoutIcon, MoonIcon, SunIcon } from './icons';
import type { Theme } from '../hooks/useTheme';
import type { AuthUserDto } from '../types';
import { userInitial } from '../utils/text';

type MobileTopBarProps = {
  theme: Theme;
  onToggleTheme: () => void;
  user: AuthUserDto;
  onSignOut: () => void;
};

export function MobileTopBar({ theme, onToggleTheme, user, onSignOut }: MobileTopBarProps) {
  return (
    <div className="mobile-topbar">
      <div className="brand">
        <span className="dot" aria-hidden="true" />
        DevPulse
      </div>
      <div className="mobile-topbar-actions">
        {user.avatarUrl ? (
          <img className="user-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="user-avatar user-avatar-fallback" aria-hidden="true">
            {userInitial(user.name)}
          </span>
        )}
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
      </div>
    </div>
  );
}
