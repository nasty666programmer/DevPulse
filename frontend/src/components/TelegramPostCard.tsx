import { useId, useState } from 'react';
import type { TelegramPostDto } from '../types';
import { formatArticleDate, toExcerpt, toParagraphs } from '../utils/text';
import { ChevronDownIcon, ChevronUpIcon, VolumeOffIcon, VolumeOnIcon } from './icons';

type TelegramPostCardProps = {
  post: TelegramPostDto;
  channelTitle: string;
};

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

// Custom silent-autoplay-loop player (Telegram/Twitter-preview style) instead
// of the browser's default <video controls> chrome — just a mute toggle.
function TelegramVideo({ src, className }: { src: string; className?: string }) {
  const [muted, setMuted] = useState(true);

  return (
    <div className={`telegram-video${className ? ` ${className}` : ''}`}>
      <video src={src} muted={muted} loop autoPlay playsInline className="card-media-item" />
      <button
        type="button"
        className="telegram-video-mute"
        aria-label={muted ? 'Включить звук' : 'Выключить звук'}
        onClick={() => setMuted((prev) => !prev)}
      >
        {muted ? <VolumeOffIcon /> : <VolumeOnIcon />}
      </button>
    </div>
  );
}

function MediaItem({ url, className }: { url: string; className?: string }) {
  return isVideoUrl(url) ? (
    <TelegramVideo src={url} className={className} />
  ) : (
    <img src={url} alt="" loading="lazy" className={`card-media-item${className ? ` ${className}` : ''}`} />
  );
}

export function TelegramPostCard({ post, channelTitle }: TelegramPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const dateText = formatArticleDate(post.publishedAt);
  const hasLongText = post.text.length > 220;
  const hasText = post.text.trim().length > 0;
  // Defends against posts already stored with duplicate URLs from before the
  // scraper started deduping them itself — TelegramProvider now collapses
  // these for newly-collected posts, but this covers what's already saved.
  const mediaUrls = [...new Set(post.mediaUrls)];
  const hasMedia = mediaUrls.length > 0;
  const isMediaOnly = !hasText && hasMedia;

  return (
    <article
      className={`card telegram-post-card${expanded ? ' is-expanded' : ''}${isMediaOnly ? ' is-media-only' : ''}`}
    >
      <div className="card-meta">
        <span className="category-badge">{channelTitle}</span>
        {dateText && <span className="sep">·</span>}
        {dateText}
      </div>

      {hasMedia && (
        <div className="card-media">
          {mediaUrls.map((url, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <MediaItem key={`${url}-${index}`} url={url} />
          ))}
        </div>
      )}

      {hasText && !expanded && <p className="card-excerpt">{toExcerpt(post.text)}</p>}

      {hasText && expanded && (
        <div className="card-body" id={bodyId}>
          {toParagraphs(post.text).map((paragraph, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}

      {hasLongText && (
        <div className="card-footer">
          <button
            type="button"
            className="link-btn"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? 'Свернуть' : 'Читать дальше'}
            {expanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
          </button>
        </div>
      )}
    </article>
  );
}
