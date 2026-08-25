import { useId, useState } from 'react';
import type { FeedItemDto } from '../types';
import { estimateReadingMinutes, formatArticleDate, toExcerpt, toParagraphs } from '../utils/text';
import { summarizeFeedItem } from '../api/feed';
import { ChevronDownIcon, ChevronUpIcon, ExternalLinkIcon } from './icons';

type ArticleCardProps = {
  item: FeedItemDto;
};

// Mirrors backend's MIN_SUMMARIZABLE_LENGTH (modules/summarizer/interfaces/index.ts)
// — kept in sync by hand, same convention as the Category union in types.ts.
const MIN_SUMMARIZABLE_LENGTH = 200;

type SummaryState = { status: 'idle' | 'loading' | 'error'; message?: string };

export function ArticleCard({ item }: ArticleCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState(item.summary);
  const [summaryState, setSummaryState] = useState<SummaryState>({ status: 'idle' });
  const bodyId = useId();

  const source = item.source || 'источник неизвестен';
  const dateText = formatArticleDate(item.date);
  const readingMinutes = estimateReadingMinutes(item.content);
  const canSummarize = !summary && item.content.trim().length >= MIN_SUMMARIZABLE_LENGTH;

  const handleSummarize = async () => {
    setSummaryState({ status: 'loading' });
    try {
      const result = await summarizeFeedItem(item.id);
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

      {summary && <p className="card-summary">{summary}</p>}

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
        <div className="card-footer-actions">
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
