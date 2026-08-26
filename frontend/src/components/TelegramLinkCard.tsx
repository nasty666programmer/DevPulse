import { useEffect, useRef, useState } from 'react';
import { requestTelegramLinkCode } from '../api/telegramLink';
import { fetchCurrentUser } from '../api/auth';
import { TelegramIcon } from './icons';

const BOT_USERNAME = 'PulsedevNewsBot';
const BOT_URL = `https://t.me/${BOT_USERNAME}`;
const POLL_INTERVAL_MS = 3000;

type TelegramLinkCardProps = {
  linked: boolean;
  onLinked: () => void;
};

export function TelegramLinkCard({ linked, onLinked }: TelegramLinkCardProps) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState('');
  const onLinkedRef = useRef(onLinked);
  onLinkedRef.current = onLinked;

  // Polls while a code is on screen so the card flips to "linked" the moment
  // the user sends the code to the bot, without them needing to reload.
  useEffect(() => {
    if (!code || !expiresAt || linked) return;

    const expiresAtMs = new Date(expiresAt).getTime();

    const intervalId = window.setInterval(async () => {
      if (Date.now() > expiresAtMs) {
        window.clearInterval(intervalId);
        return;
      }
      try {
        const current = await fetchCurrentUser();
        if (current?.telegramLinked) {
          window.clearInterval(intervalId);
          onLinkedRef.current();
        }
      } catch {
        // A transient poll failure isn't worth surfacing — the next tick retries.
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [code, expiresAt, linked]);

  const handleRequestCode = async () => {
    setIsRequesting(true);
    setError('');
    try {
      const result = await requestTelegramLinkCode();
      setCode(result.code);
      setExpiresAt(result.expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось получить код.');
    } finally {
      setIsRequesting(false);
    }
  };

  if (linked) {
    return (
      <div className="card telegram-card">
        <div className="telegram-lead">
          <TelegramIcon size={28} />
          <p className="telegram-lead-title">Telegram-аккаунт привязан ✅</p>
        </div>
        <p className="telegram-lead-caption">
          Каналы, которые вы добавляете через{' '}
          <a href={BOT_URL} target="_blank" rel="noopener noreferrer">
            @{BOT_USERNAME}
          </a>
          , попадают в вашу собственную ленту.
        </p>
      </div>
    );
  }

  return (
    <div className="card telegram-card">
      <div className="telegram-lead">
        <TelegramIcon size={28} />
        <p className="telegram-lead-title">Telegram-аккаунт не привязан</p>
      </div>
      <p className="telegram-lead-caption">
        Привяжите аккаунт, чтобы каналы, которые вы добавляете через{' '}
        <a href={BOT_URL} target="_blank" rel="noopener noreferrer">
          @{BOT_USERNAME}
        </a>
        , попадали в вашу собственную ленту, а не терялись.
      </p>

      {code ? (
        <div className="telegram-code-box">
          <p className="telegram-code-value">{code}</p>
          <p className="telegram-code-hint">
            Отправьте этот код боту{' '}
            <a href={BOT_URL} target="_blank" rel="noopener noreferrer">
              @{BOT_USERNAME}
            </a>{' '}
            в течение 10 минут.
          </p>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={handleRequestCode} disabled={isRequesting}>
          {isRequesting ? 'Получаем код…' : 'Получить код для Telegram'}
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
