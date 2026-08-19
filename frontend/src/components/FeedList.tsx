import { ArticleCard } from './ArticleCard';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { SkeletonCard } from './SkeletonCard';
import type { FeedItemDto } from '../types';

export type ListStatus = 'loading' | 'ready' | 'error';

type FeedListProps = {
  status: ListStatus;
  items: FeedItemDto[];
  errorMessage: string;
  onRetry: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  emptyTitle?: string;
  emptyCaption?: string;
};

export function FeedList({
  status,
  items,
  errorMessage,
  onRetry,
  onRefresh,
  isRefreshing,
  emptyTitle,
  emptyCaption,
}: FeedListProps) {
  if (status === 'loading') {
    return (
      <div className="feed">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        title={emptyTitle}
        caption={emptyCaption}
      />
    );
  }

  return (
    <div className="feed">
      {items.map((item) => (
        <ArticleCard key={item.id} item={item} />
      ))}
    </div>
  );
}
