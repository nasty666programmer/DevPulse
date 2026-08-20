import type { TelegramChannelDto } from '../types';
import { formatArticleDate } from '../utils/text';

type TelegramChannelListProps = {
  channels: TelegramChannelDto[];
};

export function TelegramChannelList({ channels }: TelegramChannelListProps) {
  if (channels.length === 0) {
    return (
      <p className="telegram-channels-empty">
        Каналы ещё не добавлены. Перешлите пост из канала боту или отправьте ему username —
        появится здесь.
      </p>
    );
  }

  return (
    <div className="telegram-channels" role="list">
      {channels.map((channel) => (
        <div className="telegram-channel-chip" role="listitem" key={channel.id}>
          <span className="telegram-channel-title">{channel.title}</span>
          <span className="telegram-channel-meta">
            {channel.username ? `@${channel.username}` : 'приватный канал'}
            <span className="sep">·</span>
            {formatArticleDate(channel.addedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
