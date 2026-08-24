import { useEffect, useState } from 'react';
import { ErrorState } from './ErrorState';
import { SkeletonCard } from './SkeletonCard';
import { TelegramPostCard } from './TelegramPostCard';
import type { TelegramChannelDto, TelegramPostDto } from '../types';

export type TelegramPostListStatus = 'loading' | 'ready' | 'error';

// How many of a channel's most-recent posts to show under its heading —
// mirrors the backend's TELEGRAM_POSTS_PER_CHANNEL_LIMIT default.
const POSTS_PER_CHANNEL = 5;

// Channels (as columns), not posts, are what gets paginated — each page is a
// fully different set of channel columns, not more posts appended to the
// same ones.
const CHANNELS_PER_PAGE = 4;

type TelegramPostListProps = {
  status: TelegramPostListStatus;
  posts: TelegramPostDto[];
  channels: TelegramChannelDto[];
  errorMessage: string;
  onRetry: () => void;
};

export function TelegramPostList({
  status,
  posts,
  channels,
  errorMessage,
  onRetry,
}: TelegramPostListProps) {
  const [page, setPage] = useState(0);

  // A fresh load/refresh can change which channels have posts at all —
  // land back on the first page rather than risk stranding on a now-empty one.
  useEffect(() => {
    setPage(0);
  }, [posts]);

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

  if (posts.length === 0) {
    return (
      <p className="telegram-channels-empty">
        Постов пока нет — сборщик забирает их у зарегистрированных каналов по расписанию.
      </p>
    );
  }

  // Posts only carry channelId, not the channel's title — look it up from the
  // channels list already loaded alongside this one, rather than joining on
  // the backend, since the frontend already has both lists in memory.
  const channelTitleById = new Map(channels.map((channel) => [channel.channelId, channel.title]));

  // `posts` arrives newest-first (see fetchTelegramPosts). Group by channel,
  // keeping at most POSTS_PER_CHANNEL per group and preserving each group's
  // relative order — so within a channel the cards stay newest-first too.
  // A Map's insertion order also means the first channel we see here is
  // whichever channel posted most recently overall, which is what ends up
  // driving the page order below.
  const postsByChannel = new Map<number, TelegramPostDto[]>();
  for (const post of posts) {
    const group = postsByChannel.get(post.channelId);
    if (group) {
      if (group.length < POSTS_PER_CHANNEL) {
        group.push(post);
      }
    } else {
      postsByChannel.set(post.channelId, [post]);
    }
  }

  const channelEntries = [...postsByChannel.entries()];
  const pageCount = Math.max(1, Math.ceil(channelEntries.length / CHANNELS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageEntries = channelEntries.slice(
    currentPage * CHANNELS_PER_PAGE,
    currentPage * CHANNELS_PER_PAGE + CHANNELS_PER_PAGE
  );

  return (
    <>
      <div className="telegram-channel-groups">
        {pageEntries.map(([channelId, channelPosts]) => {
          const channelTitle = channelTitleById.get(channelId) ?? 'Неизвестный канал';

          return (
            <section key={channelId}>
              <h2 className="telegram-channel-heading">{channelTitle}</h2>
              <div className="feed">
                {channelPosts.map((post) => (
                  <TelegramPostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPage((prev) => prev - 1)}
            disabled={currentPage === 0}
          >
            Назад
          </button>
          <span className="pagination-label">
            Страница {currentPage + 1} из {pageCount}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={currentPage === pageCount - 1}
          >
            Далее
          </button>
        </div>
      )}
    </>
  );
}
