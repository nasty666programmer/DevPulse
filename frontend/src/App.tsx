import { useCallback, useEffect, useState } from 'react';
import { collectFeed, fetchFeedItems } from './api/feed';
import { fetchLatestDigest, generateDigest } from './api/digest';
import { addFeedSource, fetchFeedSources, removeFeedSource } from './api/feedSources';
import { fetchTelegramChannels, fetchTelegramChannelsPage, fetchTelegramPostsForChannels } from './api/telegram';
import { AuthGate } from './components/AuthGate';
import { BottomNav } from './components/BottomNav';
import { CategoryFilter } from './components/CategoryFilter';
import { DigestCard } from './components/DigestCard';
import { FeedList } from './components/FeedList';
import type { ListStatus } from './components/FeedList';
import { FeedSourceList } from './components/FeedSourceList';
import type { FeedSourceListStatus } from './components/FeedSourceList';
import { TelegramLinkCard } from './components/TelegramLinkCard';
import { MobileTopBar } from './components/MobileTopBar';
import { Sidebar } from './components/Sidebar';
import { TelegramChannelList } from './components/TelegramChannelList';
import { TelegramPostList } from './components/TelegramPostList';
import type { TelegramPostListStatus } from './components/TelegramPostList';
import { useAuth } from './hooks/useAuth';
import { useRelativeTime } from './hooks/useRelativeTime';
import { useTheme } from './hooks/useTheme';
import { NAV_ITEMS } from './nav';
import type { TabId } from './nav';
import type { Category, DigestDto, FeedItemDto, FeedSourceDto, TelegramChannelDto, TelegramPostDto } from './types';

const FEED_LIMIT = 20;
const TELEGRAM_CHANNELS_PER_PAGE = 4;

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
  const { status: authStatus, user, errorMessage: authErrorMessage, signIn, signOut, refreshUser } = useAuth();
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
  // Full, unpaginated — feeds the channel-chip overview row.
  const [telegramChannels, setTelegramChannels] = useState<TelegramChannelDto[]>([]);
  // Just the current page's channels/posts — feeds the paginated column view.
  const [telegramPageChannels, setTelegramPageChannels] = useState<TelegramChannelDto[]>([]);
  const [telegramPagePosts, setTelegramPagePosts] = useState<TelegramPostDto[]>([]);
  const [telegramPage, setTelegramPage] = useState(1);
  const [telegramPageCount, setTelegramPageCount] = useState(1);
  const [telegramErrorMessage, setTelegramErrorMessage] = useState('');

  const [feedSourcesStatus, setFeedSourcesStatus] = useState<FeedSourceListStatus>('loading');
  const [feedSources, setFeedSources] = useState<FeedSourceDto[]>([]);
  const [feedSourcesErrorMessage, setFeedSourcesErrorMessage] = useState('');

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

  const loadTelegram = useCallback(async (page: number) => {
    setTelegramStatus('loading');
    try {
      // The chip row's full list and the current page's channels are fetched
      // together; a channel with no posts yet still gets its own (empty)
      // column, so posts are fetched only once we know which channels are
      // actually on this page.
      const [channels, pageResult] = await Promise.all([
        fetchTelegramChannels(),
        fetchTelegramChannelsPage(page, TELEGRAM_CHANNELS_PER_PAGE),
      ]);
      const posts = await fetchTelegramPostsForChannels(
        pageResult.channels.map((channel) => channel.channelId)
      );
      setTelegramChannels(channels);
      setTelegramPageChannels(pageResult.channels);
      setTelegramPagePosts(posts);
      setTelegramPageCount(Math.max(1, Math.ceil(pageResult.total / pageResult.pageSize)));
      setTelegramStatus('ready');
    } catch (err) {
      setTelegramErrorMessage(describeError(err));
      setTelegramStatus('error');
    }
  }, []);

  const loadFeedSources = useCallback(async () => {
    setFeedSourcesStatus('loading');
    try {
      const sources = await fetchFeedSources();
      setFeedSources(sources);
      setFeedSourcesStatus('ready');
    } catch (err) {
      setFeedSourcesErrorMessage(describeError(err));
      setFeedSourcesStatus('error');
    }
  }, []);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadDigest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadFeedSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  // Re-runs whenever categoryFilter changes (loadFeed's identity changes with it),
  // and also covers the initial load.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadFeed();
  }, [authStatus, loadFeed]);

  // Re-runs on page change (loadTelegram is stable — it takes the page as an
  // argument rather than closing over it) and covers the initial load.
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    void loadTelegram(telegramPage);
  }, [authStatus, telegramPage, loadTelegram]);

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
    void loadTelegram(telegramPage);
  }, [loadTelegram, telegramPage]);

  const handleRetryFeedSources = useCallback(() => {
    void loadFeedSources();
  }, [loadFeedSources]);

  // Prepends locally instead of refetching the whole list — the repository
  // already returns newest-first, so this matches server order without an
  // extra round trip.
  const handleAddFeedSource = useCallback(async (url: string) => {
    const source = await addFeedSource(url);
    setFeedSources((current) => [source, ...current]);
  }, []);

  const handleRemoveFeedSource = useCallback(async (id: string) => {
    await removeFeedSource(id);
    setFeedSources((current) => current.filter((source) => source.id !== id));
  }, []);

  if (authStatus === 'loading') {
    return <div className="auth-loading" aria-hidden="true" />;
  }

  if (authStatus === 'unauthenticated' || !user) {
    return <AuthGate onCredential={signIn} errorMessage={authErrorMessage} />;
  }

  const activeLabel = NAV_ITEMS.find((item) => item.id === activeTab)?.label ?? '';

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        theme={theme}
        onToggleTheme={toggleTheme}
        user={user}
        onSignOut={signOut}
        lastUpdatedText={lastUpdatedText}
      />

      <div className="app-main">
        <MobileTopBar theme={theme} onToggleTheme={toggleTheme} user={user} onSignOut={signOut} />

        <main className="content-area">
          <div className={activeTab === 'telegram' ? 'wrap wrap--wide' : 'wrap'}>
            <div className="content-topbar">
              <span className="content-title">{activeLabel}</span>
            </div>

            {activeTab === 'digest' && (
              <DigestCard
                status={digestStatus}
                digest={digest}
                errorMessage={digestErrorMessage}
                onRetry={handleRetryDigest}
                onRefresh={handleRefreshDigest}
                isRefreshing={isRefreshingDigest}
              />
            )}

            {activeTab === 'feed' && (
              <>
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
              </>
            )}

            {activeTab === 'telegram' && (
              <>
                <TelegramChannelList channels={telegramChannels} />
                <TelegramPostList
                  status={telegramStatus}
                  posts={telegramPagePosts}
                  channels={telegramPageChannels}
                  errorMessage={telegramErrorMessage}
                  onRetry={handleRetryTelegram}
                  page={telegramPage}
                  pageCount={telegramPageCount}
                  onPageChange={setTelegramPage}
                />
              </>
            )}

            {activeTab === 'sources' && (
              <>
                <FeedSourceList
                  status={feedSourcesStatus}
                  sources={feedSources}
                  errorMessage={feedSourcesErrorMessage}
                  onRetry={handleRetryFeedSources}
                  onAdd={handleAddFeedSource}
                  onRemove={handleRemoveFeedSource}
                />
                <TelegramLinkCard linked={user.telegramLinked} onLinked={refreshUser} />
              </>
            )}
          </div>
        </main>
      </div>

      <BottomNav activeTab={activeTab} onChangeTab={setActiveTab} />
    </div>
  );
}
