import { useEffect, useRef } from 'react';

type AuthGateProps = {
  onCredential: (idToken: string) => void;
  errorMessage: string;
};

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function AuthGate({ onCredential, errorMessage }: AuthGateProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    // The GIS script (index.html) loads async — by the time this effect
    // runs it's usually ready, but not guaranteed, so poll briefly instead
    // of assuming.
    function render() {
      if (cancelled || !buttonRef.current) return;

      if (!window.google?.accounts?.id) {
        retryTimer = setTimeout(render, 100);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: CLIENT_ID as string,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
      });
    }

    render();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [onCredential]);

  return (
    <div className="auth-gate">
      <div className="auth-gate-panel">
        <div className="auth-gate-brand">
          <span className="dot" aria-hidden="true" />
          DevPulse
        </div>
        <p className="auth-gate-caption">Персональный дайджест новостей. Войдите, чтобы продолжить.</p>

        {CLIENT_ID ? (
          <div ref={buttonRef} className="auth-gate-button" />
        ) : (
          <p className="auth-gate-error">
            Вход недоступен: не задан VITE_GOOGLE_CLIENT_ID.
          </p>
        )}

        {errorMessage && <p className="auth-gate-error">{errorMessage}</p>}
      </div>
    </div>
  );
}
