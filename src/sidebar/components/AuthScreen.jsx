import React, { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * @param {Object} props
 * @param {() => void} props.onStartOnboarding
 */
export function AuthScreen({ onStartOnboarding }) {
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
  const [localError, setLocalError] = useState(null);
  const [isDetecting, setIsDetecting] = useState(true);
  const [detected, setDetected] = useState(false);

  // Retry WebAuthn detection with delay for extension context
  useEffect(() => {
    const checkWebAuthn = async () => {
      // Try up to 3 times with increasing delays
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        
        if (typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined') {
          setDetected(true);
          setIsDetecting(false);
          return;
        }
      }
      
      // Final check
      setDetected(typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined');
      setIsDetecting(false);
    };

    void checkWebAuthn();
  }, []);

  // Use the detected value or fall back to context value
  const isWebAuthnReady = detected || webAuthnAvailable;

  const handlePasskeyAuth = useCallback(async () => {
    setIsLoading(true);
    setLocalError(null);

    try {
      const result = await authenticateWithPasskey();
      if (!result.success) {
        setLocalError(result.error || 'Passkey authentication failed');
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [authenticateWithPasskey]);

  const handlePassphraseAuth = useCallback(async () => {
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
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  }, [authenticateWithPassphrase, passphrase]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      void handlePassphraseAuth();
    }
  };

  // Show loading while detecting WebAuthn support
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

  // Only show error if detection completed and WebAuthn is truly not available
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

        {(error || localError) && (
          <div className="error-banner">
            <span>{error || localError}</span>
            <button onClick={() => setLocalError(null)}>×</button>
          </div>
        )}

        <div className="auth-options">
          {/* Only show passkey/passphrase options if user has existing wallets */}
          {hasExistingWallet ? (
            <>
              {hasPasskeySupport && (
                <button
                  className="auth-option primary"
                  onClick={handlePasskeyAuth}
                  disabled={isLoading}
                >
                  <span className="option-icon">🔑</span>
                  <div className="option-content">
                    <h3>Connect with Passkey</h3>
                    <p>Use biometric authentication</p>
                  </div>
                  <span className="option-arrow">→</span>
                </button>
              )}

              <div className="auth-option passphrase-option">
                <span className="option-icon">🔒</span>
                <div className="option-content">
                  <h3>Connect with Passphrase</h3>
                  <div className="passphrase-input-group">
                    <input
                      type={showPassphrase ? 'text' : 'password'}
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter your passphrase"
                      disabled={isLoading}
                      autoFocus
                    />
                    <button
                      className="btn-toggle"
                      onClick={() => setShowPassphrase(!showPassphrase)}
                      type="button"
                    >
                      {showPassphrase ? '🙈' : '👁'}
                    </button>
                    <button
                      className="btn-connect"
                      onClick={handlePassphraseAuth}
                      disabled={isLoading || !passphrase}
                    >
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
            /* No existing wallet - show welcome message */
            <div className="auth-welcome">
              <p className="welcome-text">Welcome! Let's get you started with secure confidential transactions.</p>
            </div>
          )}

          <button
            className="auth-option secondary"
            onClick={onStartOnboarding}
            disabled={isLoading}
          >
            <span className="option-icon">✨</span>
            <div className="option-content">
              <h3>Create New Wallet</h3>
              <p>Get started with MyBITE</p>
            </div>
            <span className="option-arrow">→</span>
          </button>
        </div>

        {status === 'locked' && (
          <div className="auth-locked-indicator">
            <span className="lock-icon">🔒</span>
            <span>Session locked for security</span>
          </div>
        )}

        <div className="auth-footer">
          <p className="security-note">
            🔒 Your keys are encrypted and stored locally
          </p>
        </div>
      </div>
    </div>
  );
}
