import { useId, useState } from 'react';
import type { TelegramPostDto } from '../types';
import { formatArticleDate, toExcerpt, toParagraphs } from '../utils/text';
import { ChevronDownIcon, ChevronUpIcon } from './icons';

type TelegramPostCardProps = {
  post: TelegramPostDto;
  channelTitle: string;
};

export function TelegramPostCard({ post, channelTitle }: TelegramPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const dateText = formatArticleDate(post.publishedAt);
  const hasLongText = post.text.length > 220;

  return (
    <article className={`card${expanded ? ' is-expanded' : ''}`}>
      <div className="card-meta">
        <span className="category-badge">{channelTitle}</span>
        {dateText && <span className="sep">·</span>}
        {dateText}
        {post.mediaUrls.length > 0 && (
          <>
            <span className="sep">·</span>
            {post.mediaUrls.length} медиа
          </>
        )}
      </div>

      {!expanded && <p className="card-excerpt">{toExcerpt(post.text)}</p>}

      {expanded && (
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
