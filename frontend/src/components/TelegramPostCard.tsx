import { useEffect, useId, useRef, useState } from 'react';
import type { TelegramPostDto } from '../types';
import { formatArticleDate, toExcerpt, toParagraphs } from '../utils/text';
import { summarizeTelegramPost } from '../api/telegram';
import { ChevronDownIcon, ChevronUpIcon, VolumeOffIcon, VolumeOnIcon } from './icons';

type TelegramPostCardProps = {
  post: TelegramPostDto;
};

// Mirrors backend's MIN_SUMMARIZABLE_LENGTH (modules/summarizer/interfaces/index.ts)
// — kept in sync by hand, same convention as the Category union in types.ts.
const MIN_SUMMARIZABLE_LENGTH = 200;

type SummaryState = { status: 'idle' | 'loading' | 'error'; message?: string };

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|$)/i.test(url);

// Custom silent-autoplay-loop player (Telegram/Twitter-preview style) instead
// of the browser's default <video controls> chrome — just a mute toggle.
// Unmuting is scoped to "while this video is on screen": scrolling it out of
// view re-mutes it, so audio never keeps playing from a card you've scrolled
// past.
function TelegramVideo({ src, className }: { src: string; className?: string }) {
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setMuted(true);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className={`telegram-video${className ? ` ${className}` : ''}`}>
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

export function TelegramPostCard({ post }: TelegramPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState(post.summary);
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'idle' });
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
  const canSummarize = !summary && post.text.trim().length >= MIN_SUMMARIZABLE_LENGTH;

  const handleSummarize = async () => {
    setSummaryState({ status: 'loading' });
    try {
      const result = await summarizeTelegramPost(post.id);
      setSummary(result);
      setSummaryState({ status: 'idle' });
    } catch (error) {
      setSummaryState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Не удалось получить саммари',
      });
    }
  };

  return (
    <article
      className={`card telegram-post-card${expanded ? ' is-expanded' : ''}${isMediaOnly ? ' is-media-only' : ''}`}
    >
      <div className="card-meta">{dateText}</div>

      {hasMedia && (
        <div className="card-media">
          {mediaUrls.map((url, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <MediaItem key={`${url}-${index}`} url={url} />
          ))}
        </div>
      )}

      {summary && <p className="card-summary">{summary}</p>}

      {hasText && !expanded && <p className="card-excerpt">{toExcerpt(post.text)}</p>}

      {hasText && expanded && (
        <div className="card-body" id={bodyId}>
          {toParagraphs(post.text).map((paragraph, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}

      {(hasLongText || canSummarize || summaryState.status === 'error') && (
        <div className="card-footer">
          <div className="card-footer-actions">
            {hasLongText && (
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
            )}
            {canSummarize && summaryState.status !== 'error' && (
              <button
                type="button"
                className="link-btn"
                disabled={summaryState.status === 'loading'}
                aria-busy={summaryState.status === 'loading'}
                onClick={handleSummarize}
              >
                {summaryState.status === 'loading' ? 'Саммаризация…' : 'Саммаризировать'}
              </button>
            )}
            {summaryState.status === 'error' && (
              <span className="summary-error">
                {summaryState.message}
                <button type="button" className="link-btn" onClick={handleSummarize}>
                  Повторить
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
