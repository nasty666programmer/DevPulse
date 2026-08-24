import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArticleCard } from './ArticleCard';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { ChevronDownIcon, RefreshIcon } from './icons';
import { useRelativeTime } from '../hooks/useRelativeTime';
import type { ListStatus } from './FeedList';
import type { DigestDto } from '../types';

type DigestCardProps = {
  status: ListStatus;
  digest: DigestDto | null;
  errorMessage: string;
  onRetry: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
};

// A quick, always-visible preview of what's in today's digest — built from
// the lead articles' own titles rather than a separate backend summary field,
// so the collapsed card shows more than just a title and a refresh button.
function summarizeArticles(articles: DigestDto['articles']): string {
  return articles.slice(0, 3).map((item) => item.title).join(' · ');
}

export function DigestCard({ status, digest, errorMessage, onRetry, onRefresh, isRefreshing }: DigestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const generatedText = useRelativeTime(digest ? new Date(digest.generatedAt) : null);
  const reduceMotion = useReducedMotion();
  // bounce: 0 is Apple's critically-damped default (no overshoot) — response/duration
  // stays snappier for the tap feedback than for the card's own expand/collapse.
  const tapTransition = { type: 'spring' as const, bounce: 0, duration: 0.15 };
  const expandTransition = { type: 'spring' as const, bounce: 0, duration: reduceMotion ? 0.15 : 0.35 };

  if (status === 'loading') {
    return (
      <div className="digest-card" aria-hidden="true">
        <div className="digest-card-header">
          <span className="digest-card-heading">
            <span className="digest-card-title">Дайджест</span>
            <span className="digest-card-meta">Загрузка…</span>
          </span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  if (!digest || digest.articles.length === 0) {
    return (
      <EmptyState
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        title="Дайджест пока пуст"
        caption="Нажмите «Обновить дайджест», чтобы собрать его из уже имеющихся новостей."
        buttonLabel="Обновить дайджест"
      />
    );
  }

  return (
    <div className={`digest-card${expanded ? ' is-expanded' : ''}`}>
      <div className="digest-card-header">
        <motion.button
          type="button"
          className="digest-card-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          transition={tapTransition}
        >
          <span className="digest-card-heading">
            <span className="digest-card-title">Дайджест</span>
            <span className="digest-card-meta">
              {digest.articles.length} новостей
              {generatedText && <span className="sep">·</span>}
              {generatedText}
            </span>
          </span>
          <motion.span
            style={{ display: 'flex' }}
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={expandTransition}
          >
            <ChevronDownIcon size={16} />
          </motion.span>
        </motion.button>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
        >
          <RefreshIcon className={isRefreshing ? 'spin-icon' : undefined} />
          <span className="btn-label">{isRefreshing ? 'Обновляем…' : 'Обновить дайджест'}</span>
        </button>
      </div>

      <p className="digest-card-summary">
        <span className="digest-card-summary-label">Сегодня: </span>
        {summarizeArticles(digest.articles)}
      </p>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="digest-body"
            className="digest-card-body digest-card-items"
            style={{ overflow: 'hidden' }}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={expandTransition}
          >
            {digest.articles.map((item) => (
              <ArticleCard key={item.id} item={item} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
