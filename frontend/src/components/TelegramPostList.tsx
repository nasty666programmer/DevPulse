import { ErrorState } from './ErrorState';
import { SkeletonCard } from './SkeletonCard';
import { TelegramPostCard } from './TelegramPostCard';
import type { TelegramChannelDto, TelegramPostDto } from '../types';

export type TelegramPostListStatus = 'loading' | 'ready' | 'error';

type TelegramPostListProps = {
  status: TelegramPostListStatus;
  // Both scoped to the current page already — the backend paginates by
  // channel and caps each channel's own post count, so no further slicing
  // or per-channel limiting happens here.
  posts: TelegramPostDto[];
  channels: TelegramChannelDto[];
  errorMessage: string;
  onRetry: () => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function TelegramPostList({
  status,
  posts,
  channels,
  errorMessage,
  onRetry,
  page,
  pageCount,
  onPageChange,
}: TelegramPostListProps) {
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

  if (channels.length === 0) {
    return (
      <p className="telegram-channels-empty">
        Каналы ещё не добавлены — появятся здесь.
      </p>
    );
  }

  const postsByChannel = new Map<number, TelegramPostDto[]>();
  for (const post of posts) {
    const group = postsByChannel.get(post.channelId);
    if (group) {
      group.push(post);
    } else {
      postsByChannel.set(post.channelId, [post]);
    }
  }

  return (
    <>
      <div className="telegram-channel-groups">
        {channels.map((channel) => {
          const channelPosts = postsByChannel.get(channel.channelId) ?? [];

          return (
            <section key={channel.channelId}>
              <h2 className="telegram-channel-heading">{channel.title}</h2>
              {channelPosts.length === 0 ? (
                <p className="telegram-channel-empty">Постов пока нет.</p>
              ) : (
                <div className="feed">
                  {channelPosts.map((post) => (
                    <TelegramPostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {pageCount > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
          >
            Назад
          </button>
          <span className="pagination-label">
            Страница {page} из {pageCount}
          </span>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
          >
            Далее
          </button>
        </div>
      )}
    </>
  );
}
