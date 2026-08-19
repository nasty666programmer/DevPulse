import { useCallback, useEffect, useState } from 'react';
import { collectFeed, fetchFeedItems } from './api/feed';
import { fetchLatestDigest } from './api/digest';
import { FeedList } from './components/FeedList';
import type { ListStatus } from './components/FeedList';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import type { TabId } from './components/Tabs';
import { useRelativeTime } from './hooks/useRelativeTime';
import { useTheme } from './hooks/useTheme';
import type { FeedItemDto } from './types';

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
  const [activeTab, setActiveTab] = useState<TabId>('digest');

  const [digestStatus, setDigestStatus] = useState<ListStatus>('loading');
  const [digestArticles, setDigestArticles] = useState<FeedItemDto[]>([]);
  const [digestErrorMessage, setDigestErrorMessage] = useState('');

  const [feedStatus, setFeedStatus] = useState<ListStatus>('loading');
  const [feedItems, setFeedItems] = useState<FeedItemDto[]>([]);
  const [feedErrorMessage, setFeedErrorMessage] = useState('');

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const lastUpdatedText = useRelativeTime(lastUpdated);

  const loadDigest = useCallback(async () => {
    setDigestStatus('loading');
    try {
      const digest = await fetchLatestDigest();
      setDigestArticles(digest?.articles ?? []);
      setDigestStatus('ready');
    } catch (err) {
      setDigestErrorMessage(describeError(err));
      setDigestStatus('error');
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setFeedStatus('loading');
    try {
      const items = await fetchFeedItems(FEED_LIMIT);
      setFeedItems(items);
      setFeedStatus('ready');
    } catch (err) {
      setFeedErrorMessage(describeError(err));
      setFeedStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadDigest();
    void loadFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      // /rss/collect also regenerates the latest digest server-side, so refreshing
      // refetches both tabs regardless of which one is currently open.
      await collectFeed();
      setLastUpdated(new Date());
      await Promise.all([loadDigest(), loadFeed()]);
    } catch (err) {
      const message = describeError(err);
      if (activeTab === 'feed') {
        setFeedErrorMessage(message);
        setFeedStatus('error');
      } else {
        setDigestErrorMessage(message);
        setDigestStatus('error');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, activeTab, loadDigest, loadFeed]);

  const handleRetryDigest = useCallback(() => {
    void loadDigest();
  }, [loadDigest]);

  const handleRetryFeed = useCallback(() => {
    void loadFeed();
  }, [loadFeed]);

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
          <Tabs activeTab={activeTab} onChange={setActiveTab} />

          {activeTab === 'digest' ? (
            <FeedList
              status={digestStatus}
              items={digestArticles}
              errorMessage={digestErrorMessage}
              onRetry={handleRetryDigest}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              emptyTitle="Дайджест пока пуст"
              emptyCaption="Нажмите «Обновить дайджест», чтобы собрать сегодняшний дайджест из источников."
            />
          ) : (
            <FeedList
              status={feedStatus}
              items={feedItems}
              errorMessage={feedErrorMessage}
              onRetry={handleRetryFeed}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              emptyTitle="Новостей пока нет"
              emptyCaption="Нажмите «Обновить дайджест», чтобы собрать свежие статьи из источников."
            />
          )}
        </div>
      </main>
    </>
  );
}
