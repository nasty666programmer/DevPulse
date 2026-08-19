import { EmptyTrayIcon, RefreshIcon } from './icons';

type EmptyStateProps = {
  onRefresh: () => void;
  isRefreshing: boolean;
  title?: string;
  caption?: string;
};

export function EmptyState({
  onRefresh,
  isRefreshing,
  title = 'Новостей пока нет',
  caption = 'Нажмите «Обновить дайджест», чтобы собрать свежие статьи из источников.',
}: EmptyStateProps) {
  return (
    <div className="card">
      <div className="empty-state">
        <EmptyTrayIcon />
        <h3 className="empty-title">{title}</h3>
        <p className="empty-caption">{caption}</p>
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
