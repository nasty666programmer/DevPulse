import type { TelegramChannelDto } from '../types';
import { formatArticleDate } from '../utils/text';
import { TelegramIcon } from './icons';

const BOT_USERNAME = 'PulsedevNewsBot';
const BOT_URL = `https://t.me/${BOT_USERNAME}`;

type TelegramChannelListProps = {
  channels: TelegramChannelDto[];
};

function BotHint() {
  return (
    <p className="telegram-bot-hint">
      <TelegramIcon className="telegram-bot-hint-icon" />
      Добавить новостной канал можно через бота — перешлите ему пост из канала или отправьте
      username:{' '}
      <a href={BOT_URL} target="_blank" rel="noopener noreferrer">
        @{BOT_USERNAME}
      </a>
    </p>
  );
}

export function TelegramChannelList({ channels }: TelegramChannelListProps) {
  if (channels.length === 0) {
    return (
      <>
        <BotHint />
        <p className="telegram-channels-empty">Каналы ещё не добавлены — появятся здесь.</p>
      </>
    );
  }

  return (
    <>
      <BotHint />
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
    </>
  );
}
