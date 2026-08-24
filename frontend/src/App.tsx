import { useCallback, useEffect, useState } from 'react';
import { collectFeed, fetchFeedItems } from './api/feed';
import { fetchLatestDigest, generateDigest } from './api/digest';
import { fetchTelegramChannels, fetchTelegramPosts } from './api/telegram';
import { AuthGate } from './components/AuthGate';
import { CategoryFilter } from './components/CategoryFilter';
import { DigestCard } from './components/DigestCard';
import { FeedList } from './components/FeedList';
import type { ListStatus } from './components/FeedList';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import type { TabId } from './components/Tabs';
import { TelegramChannelList } from './components/TelegramChannelList';
import { TelegramPostList } from './components/TelegramPostList';
import type { TelegramPostListStatus } from './components/TelegramPostList';
import { useAuth } from './hooks/useAuth';
import { useRelativeTime } from './hooks/useRelativeTime';
import { useTheme } from './hooks/useTheme';
import type { Category, DigestDto, FeedItemDto, TelegramChannelDto, TelegramPostDto } from './types';

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
  const { status: authStatus, user, errorMessage: authErrorMessage, signIn, signOut } = useAuth();
  const [theme, toggleTheme] = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>('digest');

  const [digestStatus, setDigestStatus] = useState<ListStatus>('loading');
  const [digest, setDigest] = useState<DigestDto | null>(null);
  const [digestErrorMessage, setDigestErrorMessage] = useState('');
  const [isRefreshingDigest, setIsRefreshingDigest] = useState(false);

  const [feedStatus, setFeedStatus] = useState<ListStatus>('loading');
  const [feedItems, setFeedItems] = useState<FeedItemDto[]>([]);
  const [feedErrorMessage, setFeedErrorMessage] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<Category | null>(null);

  const [telegramStatus, setTelegramStatus] = useState<TelegramPostListStatus>('loading');
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannelDto[]>([]);
  const [telegramPosts, setTelegramPosts] = useState<TelegramPostDto[]>([]);
  const [telegramErrorMessage, setTelegramErrorMessage] = useState('');

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const lastUpdatedText = useRelativeTime(lastUpdated);

  const loadDigest = useCallback(async () => {
    setDigestStatus('loading');
    try {
      const data = await fetchLatestDigest();
      setDigest(data);
      setDigestStatus('ready');
    } catch (err) {
      setDigestErrorMessage(describeError(err));
      setDigestStatus('error');
    }
  }, []);

  const loadFeed = useCallback(async () => {
    setFeedStatus('loading');
    try {
      const items = await fetchFeedItems(FEED_LIMIT, categoryFilter ?? undefined);
      setFeedItems(items);
      setFeedStatus('ready');
    } catch (err) {
      setFeedErrorMessage(describeError(err));
      setFeedStatus('error');
    }
  }, [categoryFilter]);

  const loadTelegram = useCallback(async () => {
    setTelegramStatus('loading');
    try {
      // Independent lists, fetched together — a channel with no posts yet is
      // still worth showing, so one failing doesn't block the other.
      const [channels, posts] = await Promise.all([fetchTelegramChannels(), fetchTelegramPosts()]);
      setTelegramChannels(channels);
      setTelegramPosts(posts);
      setTelegramStatus('ready');
    } catch (err) {
      setTelegramErrorMessage(describeError(err));
      setTelegramStatus('error');
    }
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadDigest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  // Re-runs whenever categoryFilter changes (loadFeed's identity changes with it),
  // and also covers the initial load.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadFeed();
  }, [authStatus, loadFeed]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadTelegram();
  }, [authStatus, loadTelegram]);

  // Full RSS collect — slow (real network fetches), also regenerates the digest
  // server-side, so it refreshes both tabs regardless of which one is open.
  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
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

  // Digest-only refresh — regenerates straight from whatever's already in the
  // database, no RSS collection involved, so it's fast.
  const handleRefreshDigest = useCallback(async () => {
    if (isRefreshingDigest) return;
    setIsRefreshingDigest(true);
    try {
      const data = await generateDigest();
      setDigest(data);
      setDigestStatus('ready');
    } catch (err) {
      setDigestErrorMessage(describeError(err));
      setDigestStatus('error');
    } finally {
      setIsRefreshingDigest(false);
    }
  }, [isRefreshingDigest]);

  const handleRetryDigest = useCallback(() => {
    void loadDigest();
  }, [loadDigest]);

  const handleRetryFeed = useCallback(() => {
    void loadFeed();
  }, [loadFeed]);

  const handleRetryTelegram = useCallback(() => {
    void loadTelegram();
  }, [loadTelegram]);

  if (authStatus === 'loading') {
    return <div className="auth-loading" aria-hidden="true" />;
  }

  if (authStatus === 'unauthenticated' || !user) {
    return <AuthGate onCredential={signIn} errorMessage={authErrorMessage} />;
  }

  return (
    <>
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        lastUpdatedText={lastUpdatedText}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        user={user}
        onSignOut={signOut}
      />
      <main>
        <div className="wrap">
          <Tabs activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === 'digest' && (
          <div className="wrap">
            <DigestCard
              status={digestStatus}
              digest={digest}
              errorMessage={digestErrorMessage}
              onRetry={handleRetryDigest}
              onRefresh={handleRefreshDigest}
              isRefreshing={isRefreshingDigest}
            />
          </div>
        )}

        {activeTab === 'feed' && (
          <div className="wrap">
            <CategoryFilter activeCategory={categoryFilter} onChange={setCategoryFilter} />
            <FeedList
              status={feedStatus}
              items={feedItems}
              errorMessage={feedErrorMessage}
              onRetry={handleRetryFeed}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
              emptyTitle="Новостей пока нет"
              emptyCaption="Нажмите «Обновить», чтобы собрать свежие статьи из источников."
            />
          </div>
        )}

        {activeTab === 'telegram' && (
          // Wider than .wrap on purpose — the Telegram tab's per-channel post
          // cards read better at full page width than the ~680px reading
          // column the other tabs use.
          <div className="wrap wrap--wide">
            <TelegramChannelList channels={telegramChannels} />
            <TelegramPostList
              status={telegramStatus}
              posts={telegramPosts}
              channels={telegramChannels}
              errorMessage={telegramErrorMessage}
              onRetry={handleRetryTelegram}
            />
          </div>
        )}
      </main>
    </>
  );
}
