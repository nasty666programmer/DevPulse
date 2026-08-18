import { EmptyTrayIcon, RefreshIcon } from './icons';

type EmptyStateProps = {
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function EmptyState({ onRefresh, isRefreshing }: EmptyStateProps) {
  return (
    <div className="card">
      <div className="empty-state">
        <EmptyTrayIcon />
        <h3 className="empty-title">Новостей пока нет</h3>
        <p className="empty-caption">
          Нажмите «Обновить дайджест», чтобы собрать свежие статьи из источников.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
        >
          <RefreshIcon className={isRefreshing ? 'spin-icon' : undefined} />
          {isRefreshing ? 'Обновляем…' : 'Обновить дайджест'}
        </button>
      </div>
    </div>
  );
}
