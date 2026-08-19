import { useId, useState } from 'react';
import type { FeedItemDto } from '../types';
import { estimateReadingMinutes, formatArticleDate, toExcerpt, toParagraphs } from '../utils/text';
import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from './icons';

type ArticleCardProps = {
  item: FeedItemDto;
};

export function ArticleCard({ item }: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const source = item.source || 'источник неизвестен';
  const dateText = formatArticleDate(item.date);
  const readingMinutes = estimateReadingMinutes(item.content);

  return (
    <article className={`card${expanded ? ' is-expanded' : ''}`}>
      <div className="card-meta">
        <span className="category-badge">{item.category}</span>
        <span className="sep">·</span>
        {source}
        {dateText && <span className="sep">·</span>}
        {dateText}
        <span className="sep">·</span>
        {readingMinutes} мин чтения
      </div>

      <h2 className="card-title">{item.title}</h2>

      {!expanded && <p className="card-excerpt">{toExcerpt(item.content)}</p>}

      {expanded && (
        <div className="card-body" id={bodyId}>
          {toParagraphs(item.content).map((paragraph, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      )}

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
        {item.url && (
          <a className="original-link" href={item.url} target="_blank" rel="noopener noreferrer">
            Оригинал
            <ExternalLinkIcon />
          </a>
        )}
      </div>
    </article>
  );
}
