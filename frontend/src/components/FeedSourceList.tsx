import { useState } from 'react';
import type { FormEvent } from 'react';
import type { FeedSourceDto } from '../types';
import { formatArticleDate } from '../utils/text';
import { ErrorState } from './ErrorState';
import { SkeletonCard } from './SkeletonCard';
import { LinkIcon, TrashIcon } from './icons';

export type FeedSourceListStatus = 'loading' | 'ready' | 'error';

type FeedSourceListProps = {
  status: FeedSourceListStatus;
  sources: FeedSourceDto[];
  errorMessage: string;
  onRetry: () => void;
  onAdd: (url: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
};

export function FeedSourceList({ status, sources, errorMessage, onRetry, onAdd, onRemove }: FeedSourceListProps) {
  const [url, setUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || isAdding) return;

    setIsAdding(true);
    setAddError('');
    try {
      await onAdd(trimmed);
      setUrl('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Не удалось добавить источник.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await onRemove(id);
    } catch {
      // Row stays in the list on failure — not worth a persistent error
      // state here, the user can just try the same button again.
    } finally {
      setRemovingId(null);
    }
  };

  const addForm = (
    <>
      <form className="add-source-form" onSubmit={handleSubmit}>
        <input
          type="url"
          className="text-input"
          placeholder="https://example.com/rss"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={isAdding}
          required
        />
        <button type="submit" className="btn btn-primary" disabled={isAdding} aria-busy={isAdding}>
          {isAdding ? 'Добавляем…' : 'Добавить'}
        </button>
      </form>
      {addError && (
        <p className="form-error" role="alert">
          {addError}
        </p>
      )}
    </>
  );

  if (status === 'loading') {
    return (
      <div className="feed">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={errorMessage} onRetry={onRetry} />;
  }

  return (
    <>
      {addForm}

      {sources.length === 0 ? (
        <p className="sources-empty">Источников пока нет — добавьте свой первый RSS выше.</p>
      ) : (
        <div className="source-list" role="list">
          {sources.map((source) => (
            <div className="source-row" role="listitem" key={source.id}>
              <div className="source-info">
                <span className="source-icon">
                  <LinkIcon size={16} />
                </span>
                <div>
                  <p className="source-url">{source.url}</p>
                  <p className="source-meta">Добавлен {formatArticleDate(source.addedAt)}</p>
                </div>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => handleRemove(source.id)}
                disabled={removingId === source.id}
                aria-label="Удалить источник"
                title="Удалить источник"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
