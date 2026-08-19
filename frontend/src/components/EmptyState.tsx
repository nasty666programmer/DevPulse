import { EmptyTrayIcon, RefreshIcon } from './icons';

type EmptyStateProps = {
  onRefresh: () => void;
  isRefreshing: boolean;
  title?: string;
  caption?: string;
  buttonLabel?: string;
};

export function EmptyState({
  onRefresh,
  isRefreshing,
  title = 'Новостей пока нет',
  caption = 'Нажмите «Обновить», чтобы собрать свежие статьи из источников.',
  buttonLabel = 'Обновить',
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
          {isRefreshing ? 'Обновляем…' : buttonLabel}
        </button>
      </div>
    </div>
  );
}
