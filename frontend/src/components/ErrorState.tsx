import { WarningIcon } from './icons';

type ErrorStateProps = {
  message: string;
  onRetry: () => void;
};

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="error-box" role="alert">
      <div className="error-head">
        <WarningIcon />
        <span>Не удалось загрузить дайджест</span>
      </div>
      <p className="error-desc">{message}</p>
      <button type="button" className="btn-ghost" onClick={onRetry}>
        Повторить
      </button>
    </div>
  );
}
