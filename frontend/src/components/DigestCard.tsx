import { useState } from 'react';
import { ArticleCard } from './ArticleCard';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { ChevronDownIcon, ChevronUpIcon, RefreshIcon } from './icons';
import { useRelativeTime } from '../hooks/useRelativeTime';
import type { ListStatus } from './FeedList';
import type { DigestDto } from '../types';

type DigestCardProps = {
  status: ListStatus;
  digest: DigestDto | null;
  errorMessage: string;
  onRetry: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
};

export function DigestCard({ status, digest, errorMessage, onRetry, onRefresh, isRefreshing }: DigestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const generatedText = useRelativeTime(digest ? new Date(digest.generatedAt) : null);

  if (status === 'loading') {
    return (
      <div className="digest-card" aria-hidden="true">
        <div className="digest-card-header">
          <span className="digest-card-heading">
            <span className="digest-card-title">Дайджест</span>
            <span className="digest-card-meta">Загрузка…</span>
          </span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  if (!digest || digest.articles.length === 0) {
    return (
      <EmptyState
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        title="Дайджест пока пуст"
        caption="Нажмите «Обновить дайджест», чтобы собрать его из уже имеющихся новостей."
        buttonLabel="Обновить дайджест"
      />
    );
  }

  return (
    <div className="digest-card">
      <div className="digest-card-header">
        <button
          type="button"
          className="digest-card-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          <span className="digest-card-heading">
            <span className="digest-card-title">Дайджест</span>
            <span className="digest-card-meta">
              {digest.articles.length} новостей
              {generatedText && <span className="sep">·</span>}
              {generatedText}
            </span>
          </span>
          {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
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

      {expanded && (
        <div className="digest-card-body digest-card-items">
          {digest.articles.map((item) => (
            <ArticleCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
