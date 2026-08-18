import { MoonIcon, RefreshIcon, SunIcon } from './icons';
import type { Theme } from '../hooks/useTheme';

type HeaderProps = {
  theme: Theme;
  onToggleTheme: () => void;
  lastUpdatedText: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function Header({ theme, onToggleTheme, lastUpdatedText, onRefresh, isRefreshing }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="wrap">
        <div className="brand">
          <span className="dot" aria-hidden="true" />
          DevPulse
        </div>
        <div className="header-right">
          {lastUpdatedText && <span className="last-updated">{lastUpdatedText}</span>}
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
            className="btn btn-primary"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
          >
            <RefreshIcon className={isRefreshing ? 'spin-icon' : undefined} />
            <span className="btn-label">{isRefreshing ? 'Обновляем…' : 'Обновить дайджест'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
