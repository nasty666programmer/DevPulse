import { useCallback, useEffect, useState } from 'react';
import { collectFeed, fetchFeedItems } from './api/feed';
import { ArticleCard } from './components/ArticleCard';
import { EmptyState } from './components/EmptyState';
import { ErrorState } from './components/ErrorState';
import { Header } from './components/Header';
import { SkeletonCard } from './components/SkeletonCard';
import { useRelativeTime } from './hooks/useRelativeTime';
import { useTheme } from './hooks/useTheme';
import type { FeedItemDto } from './types';

type Status = 'loading' | 'ready' | 'error';

const FEED_LIMIT = 20;

function describeError(err: unknown): string {
  // A network-level failure (backend not running, CORS, DNS, etc.) surfaces as a
  // generic TypeError from fetch with no HTTP status attached.
  if (err instanceof TypeError) {
    return 'Сервер недоступен. Проверьте, что backend запущен на порту 3000, и повторите попытку.';
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return 'Сбор новостей занял слишком много времени. Проверьте backend и повторите попытку.';
  }
  if (err instanceof Error) {
    return err.message;
  }
  return 'Неизвестная ошибка. Повторите попытку.';
}

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<FeedItemDto[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const lastUpdatedText = useRelativeTime(lastUpdated);

  const loadItems = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await fetchFeedItems(FEED_LIMIT);
      setItems(data);
      setLastUpdated(new Date());
      setStatus('ready');
    } catch (err) {
      setErrorMessage(describeError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await collectFeed();
      const data = await fetchFeedItems(FEED_LIMIT);
      setItems(data);
      setLastUpdated(new Date());
      setStatus('ready');
    } catch (err) {
      setErrorMessage(describeError(err));
      setStatus('error');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing]);

  const handleRetry = useCallback(() => {
    void loadItems();
  }, [loadItems]);

  return (
    <>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        lastUpdatedText={lastUpdatedText}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />
      <main>
        <div className="wrap">
          {status === 'loading' && (
            <div className="feed">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {status === 'error' && <ErrorState message={errorMessage} onRetry={handleRetry} />}

          {status === 'ready' && items.length === 0 && (
            <EmptyState onRefresh={handleRefresh} isRefreshing={isRefreshing} />
          )}

          {status === 'ready' && items.length > 0 && (
            <div className="feed">
              {items.map((item) => (
                <ArticleCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
