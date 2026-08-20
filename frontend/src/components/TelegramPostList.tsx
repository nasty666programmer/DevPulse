import { ErrorState } from './ErrorState';
import { SkeletonCard } from './SkeletonCard';
import { TelegramPostCard } from './TelegramPostCard';
import type { TelegramChannelDto, TelegramPostDto } from '../types';

export type TelegramPostListStatus = 'loading' | 'ready' | 'error';

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

  return (
    <div className="feed">
      {posts.map((post) => (
        <TelegramPostCard
          key={post.id}
          post={post}
          channelTitle={channelTitleById.get(post.channelId) ?? 'Неизвестный канал'}
        />
      ))}
    </div>
  );
}
