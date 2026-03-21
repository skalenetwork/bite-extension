import { useCallback, useEffect, useState, type KeyboardEvent } from 'react';
import { useAuth } from '../context/AuthContext';

interface AuthScreenProps {
  onStartOnboarding: () => void;
}

export function AuthScreen({ onStartOnboarding }: AuthScreenProps): React.ReactElement {
  const {
    status,
    hasExistingWallet,
    hasPasskeySupport,
    webAuthnAvailable,
    error,
    authenticateWithPasskey,
    authenticateWithPassphrase,
  } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);
  const [detected, setDetected] = useState(false);

  useEffect(() => {
    const checkWebAuthn = async (): Promise<void> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        if (typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined') {
          setDetected(true);
          setIsDetecting(false);
          return;
        }
      }

      setDetected(typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined');
      setIsDetecting(false);
    };

    void checkWebAuthn();
  }, []);

  const isWebAuthnReady = detected || webAuthnAvailable;

  const handlePasskeyAuth = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setLocalError(null);

    try {
      const result = await authenticateWithPasskey();
      if (!result.success) {
        setLocalError(result.error || 'Passkey authentication failed');
      }
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [authenticateWithPasskey]);

  const handlePassphraseAuth = useCallback(async (): Promise<void> => {
    if (!passphrase) {
      setLocalError('Please enter your passphrase');
      return;
    }

    setIsLoading(true);
    setLocalError(null);

    try {
      const result = await authenticateWithPassphrase(passphrase);
      if (!result.success) {
        setLocalError(result.error || 'Invalid passphrase');
      }
    } catch (authError) {
      setLocalError(authError instanceof Error ? authError.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [authenticateWithPassphrase, passphrase]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      void handlePassphraseAuth();
    }
  };

  if (isDetecting) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="loading-spinner">◌</span>
          <p>Detecting browser capabilities...</p>
        </div>
      </div>
    );
  }

  if (!isWebAuthnReady) {
    return (
      <div className="auth-screen">
        <div className="auth-error">
          <span className="error-icon">⚠️</span>
          <h2>WebAuthn Not Available</h2>
          <p>This browser does not support secure passkeys.</p>
          <p className="hint">Please use a modern browser like Chrome, Firefox, Safari, or Edge.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-container">
        <div className="auth-header">
          <span className="auth-logo">🔐</span>
          <h1>MyBITE Wallet</h1>
          <p className="auth-tagline">Secure confidential transactions on SKALE</p>
        </div>

        {error || localError ? (
          <div className="error-banner">
            <span>{error || localError}</span>
            <button onClick={() => setLocalError(null)} type="button">×</button>
          </div>
        ) : null}

        <div className="auth-options">
          {hasExistingWallet ? (
            <>
              {hasPasskeySupport ? (
                <button className="auth-option primary" onClick={() => void handlePasskeyAuth()} disabled={isLoading} type="button">
                  <span className="option-icon">🔑</span>
                  <div className="option-content">
                    <h3>Connect with Passkey</h3>
                    <p>Use biometric authentication</p>
                  </div>
                  <span className="option-arrow">→</span>
                </button>
              ) : null}

              <div className="auth-option passphrase-option">
                <span className="option-icon">🔒</span>
                <div className="option-content">
                  <h3>Connect with Passphrase</h3>
                  <div className="passphrase-input-group">
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter your passphrase"
                      disabled={isLoading}
                      autoFocus
                    />
                    <button className="btn-toggle" onClick={() => setShowPassphrase((value) => !value)} type="button">
                      {showPassphrase ? '🙈' : '👁'}
                    </button>
                    <button className="btn-connect" onClick={() => void handlePassphraseAuth()} disabled={isLoading || !passphrase} type="button">
                      {isLoading ? '...' : '→'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="auth-divider">
                <span>or</span>
              </div>
            </>
          ) : (
            <div className="auth-welcome">
              <p className="welcome-text">Welcome! Let&apos;s get you started with secure confidential transactions.</p>
            </div>
          )}

          <button className="auth-option secondary" onClick={onStartOnboarding} disabled={isLoading} type="button">
            <span className="option-icon">✨</span>
            <div className="option-content">
              <h3>Create New Wallet</h3>
              <p>Get started with MyBITE</p>
            </div>
            <span className="option-arrow">→</span>
          </button>
        </div>

        {status === 'locked' ? (
          <div className="auth-locked-indicator">
            <span className="lock-icon">🔒</span>
            <span>Session locked for security</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
