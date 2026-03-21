import React, { useRef, useState, useCallback } from 'react';
import { walletService } from '../../services/wallet';
import { viewerKeyService } from '../../services/viewerKey';
import { PasskeyService } from '../../services/passkey';

/**
 * @param {Object} props
 * @param {() => void} props.onComplete
 * @param {() => void} props.onCancel
 */
export function OnboardingWizard({ onComplete, onCancel }) {
  const [currentStep, setCurrentStep] = useState('welcome');
  const [wallet, setWallet] = useState(null);
  const [importedWallet, setImportedWallet] = useState(null);
  const [viewerKey, setViewerKey] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [viewerKeyLabel, setViewerKeyLabel] = useState('My Viewer Key');
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showRecoveryPhrase, setShowRecoveryPhrase] = useState(false);
  const [hasPasskeySupport, setHasPasskeySupport] = useState(false);
  const createWalletInFlightRef = useRef(false);

  React.useEffect(() => {
    const checkPasskey = async () => {
      const available = PasskeyService.isAvailable();
      setHasPasskeySupport(available);
    };
    void checkPasskey();
  }, []);

  const handleChoice = useCallback((choice) => {
    if (choice === 'create') {
      setCurrentStep('create-wallet');
    } else if (choice === 'import') {
      setCurrentStep('import-wallet');
    } else {
      setCurrentStep('connect-wallet');
    }
  }, []);

  const handleCreateWallet = useCallback(async () => {
    if (createWalletInFlightRef.current) {
      return;
    }

    if (!hasPasskeySupport && passphrase !== passphraseConfirm) {
      setError('Passphrases do not match');
      return;
    }

    createWalletInFlightRef.current = true;
    setIsLoading(true);
    setError(null);
    setStatusMessage(hasPasskeySupport ? 'Check your system passkey prompt.' : '');

    try {
      const result = await walletService.createLocalWallet({
        passphrase: hasPasskeySupport ? undefined : passphrase,
      });
      setIsLoading(false);
      setStatusMessage('');
      setWallet(result);
      setCurrentStep('backup');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create wallet';
      setIsLoading(false);
      setStatusMessage('');
      
      if (errorMessage.includes('NotAllowedError') || errorMessage.includes('cancelled')) {
        setError('❌ Authentication was cancelled or denied. Please try again.');
      } else if (errorMessage.includes('already in progress') || errorMessage.includes('already pending')) {
        setError('A passkey request is already in progress. Complete or cancel the current prompt, then try again.');
      } else {
        setError(errorMessage);
      }
    } finally {
      createWalletInFlightRef.current = false;
    }
  }, [hasPasskeySupport, passphrase, passphraseConfirm]);

  const handleImportWallet = useCallback(async (secret) => {
    if (!hasPasskeySupport && passphrase !== passphraseConfirm) {
      setError('Passphrases do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const account = await walletService.importLocalWallet({
        secret,
        passphrase: hasPasskeySupport ? undefined : passphrase,
      });
      setImportedWallet(account);
      setCurrentStep('add-viewer-key');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  }, [hasPasskeySupport, passphrase, passphraseConfirm]);

  const handleConnectWallet = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const ethereum = window.ethereum;
      const accounts = await ethereum?.request({ method: 'eth_requestAccounts' });

      if (!accounts || accounts.length === 0) {
        throw new Error('No wallet accounts were returned');
      }

      const address = accounts[0];
      if (!address) {
        throw new Error('No account address found');
      }

      const account = await walletService.saveProviderWallet('external', address, 'injected');
      setImportedWallet(account);
      setCurrentStep('add-viewer-key');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreateViewerKey = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const key = await viewerKeyService.createViewerKey({
        label: viewerKeyLabel,
        passphrase: hasPasskeySupport ? undefined : passphrase,
      });
      setViewerKey(key);

      if (wallet) {
        setCurrentStep('backup');
      } else {
        setCurrentStep('complete');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create viewer key');
    } finally {
      setIsLoading(false);
    }
  }, [viewerKeyLabel, hasPasskeySupport, passphrase, wallet]);

  const handleConfirmBackup = useCallback(async () => {
    if (!wallet) return;

    try {
      await walletService.confirmBackup(wallet.account.id);
      setBackupConfirmed(true);
      setCurrentStep('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm backup');
    }
  }, [wallet]);

  const canProceedFromCreate = hasPasskeySupport || (passphrase.length >= 8 && passphrase === passphraseConfirm);
  const canProceedFromImport = hasPasskeySupport || (passphrase.length >= 8 && passphrase === passphraseConfirm);

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="onboarding-step">
            <div className="onboarding-logo">
              <span className="logo-icon">🔐</span>
              <h1>MyBITE Wallet</h1>
            </div>
            <p className="onboarding-tagline">
              Your secure gateway to confidential transactions on SKALE
            </p>
            <ul className="feature-list">
              <li>🔒 Military-grade encryption with WebAuthn passkeys</li>
              <li>🕵️ Private transaction viewing with viewer keys</li>
              <li>⚡ Fast, secure, and self-custodial</li>
              <li>🌐 Powered by SKALE BITE protocol</li>
            </ul>
            <button
              className="btn-primary btn-large"
              onClick={() => setCurrentStep('choice')}
            >
              Get Started
            </button>
            <button
              className="btn-ghost"
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>
        );

      case 'choice':
        return (
          <div className="onboarding-step">
            <h2>How would you like to start?</h2>
            <p className="step-description">Choose the option that works best for you</p>
            
            <div className="choice-grid">
              <button
                className="choice-card"
                onClick={() => handleChoice('create')}
                disabled={isLoading}
              >
                <span className="choice-icon">✨</span>
                <h3>Create New Wallet</h3>
                <p>Generate a new secure self-custody wallet with recovery phrase</p>
              </button>

              <button
                className="choice-card"
                onClick={() => handleChoice('import')}
                disabled={isLoading}
              >
                <span className="choice-icon">📥</span>
                <h3>Import Existing</h3>
                <p>Restore your wallet using private key or recovery phrase</p>
              </button>

              <button
                className="choice-card"
                onClick={() => handleChoice('connect')}
                disabled={isLoading}
              >
                <span className="choice-icon">🔗</span>
                <h3>Connect Wallet</h3>
                <p>Link an external wallet like MetaMask or Rabby</p>
              </button>
            </div>

            <button
              className="btn-ghost"
              onClick={() => setCurrentStep('welcome')}
            >
              ← Back
            </button>
          </div>
        );

      case 'create-wallet':
        return (
          <div className="onboarding-step">
            <h2>Create Your Wallet</h2>
            <p className="step-description">Set up your secure self-custody wallet</p>

            {!hasPasskeySupport && (
              <div className="form-group">
                <label htmlFor="passphrase">Set Passphrase</label>
                <input
                  id="passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter a strong passphrase (min 8 characters)"
                  disabled={isLoading}
                />
                <label htmlFor="passphrase-confirm">Confirm Passphrase</label>
                <input
                  id="passphrase-confirm"
                  type="password"
                  value={passphraseConfirm}
                  onChange={(e) => setPassphraseConfirm(e.target.value)}
                  placeholder="Confirm your passphrase"
                  disabled={isLoading}
                />
                {passphrase !== passphraseConfirm && passphraseConfirm.length > 0 && (
                  <span className="error-text">Passphrases do not match</span>
                )}
              </div>
            )}

            {hasPasskeySupport && (
              <div className="info-box info-highlight" style={{ border: '2px solid var(--color-warning-500)', background: 'var(--color-warning-50)' }}>
                <p style={{ fontSize: '15px', fontWeight: '600', color: 'var(--color-warning-800)' }}>
                  🔐 Complete Two Passkey Steps
                </p>
                <div style={{ marginTop: '12px', padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>Step 1:</p>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Create the passkey in the helper window.</p>
                </div>
                <div style={{ marginTop: '8px', padding: '12px', background: 'white', borderRadius: '8px', border: '1px solid var(--border-medium)' }}>
                  <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>Step 2:</p>
                  <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Approve the follow-up prompt to finish wallet encryption.</p>
                </div>
                <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--color-error-600)', fontWeight: '500' }}>
                  ⚠️ Keep the helper open until setup finishes.
                </p>
              </div>
            )}

            {error && (
              <div className="error-banner">
                <span>{error}</span>
              </div>
            )}

            <div className="button-group">
              <button
                className="btn-primary"
                onClick={handleCreateWallet}
                disabled={isLoading || !canProceedFromCreate}
              >
                {isLoading ? (statusMessage || 'Creating...') : 'Create Wallet'}
              </button>
              <button
                className="btn-ghost"
                onClick={() => setCurrentStep('choice')}
                disabled={isLoading}
              >
                ← Back
              </button>
            </div>
          </div>
        );

      case 'import-wallet':
        return (
          <div className="onboarding-step">
            <h2>Import Wallet</h2>
            <p className="step-description">Restore your wallet using private key or recovery phrase</p>

            <ImportWalletForm
              onImport={handleImportWallet}
              isLoading={isLoading}
              error={error}
              hasPasskeySupport={hasPasskeySupport}
              passphrase={passphrase}
              setPassphrase={setPassphrase}
              passphraseConfirm={passphraseConfirm}
              setPassphraseConfirm={setPassphraseConfirm}
              canProceed={canProceedFromImport}
            />

            <button
              className="btn-ghost"
              onClick={() => setCurrentStep('choice')}
              disabled={isLoading}
            >
              ← Back
            </button>
          </div>
        );

      case 'connect-wallet':
        return (
          <div className="onboarding-step">
            <h2>Connect External Wallet</h2>
            <p className="step-description">Link your existing wallet provider</p>

            {error && (
              <div className="error-banner">
                <span>{error}</span>
              </div>
            )}

            <div className="wallet-provider-grid">
              <button
                className="provider-card"
                onClick={handleConnectWallet}
                disabled={isLoading}
              >
                <span className="provider-icon">🦊</span>
                <span>MetaMask / Injected</span>
              </button>
            </div>

            <button
              className="btn-ghost"
              onClick={() => setCurrentStep('choice')}
              disabled={isLoading}
            >
              ← Back
            </button>
          </div>
        );

      case 'backup':
        if (!wallet) return null;
        return (
          <div className="onboarding-step">
            <h2>🔐 Secure Your Backup</h2>
            <p className="step-description warning-text">
              Store these recovery materials in a safe place. Never share them with anyone.
            </p>

            {wallet.recoveryPhrase && (
              <div className="backup-section">
                <h3>Recovery Phrase</h3>
                <div className="backup-reveal">
                  <button
                    className="btn-reveal btn-sm"
                    onClick={() => setShowRecoveryPhrase(!showRecoveryPhrase)}
                  >
                    {showRecoveryPhrase ? '🙈 Hide' : '👁 Reveal Recovery Phrase'}
                  </button>
                  {showRecoveryPhrase && (
                    <div className="secret-display phrase">
                      {wallet.recoveryPhrase}
                    </div>
                  )}
                </div>
                <p className="backup-hint">Write this down and store it offline</p>
              </div>
            )}

            <div className="backup-section">
              <h3>Private Key</h3>
              <div className="backup-reveal">
                <button
                  className="btn-reveal btn-sm"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? '🙈 Hide' : '👁 Reveal Private Key'}
                </button>
                {showPrivateKey && (
                  <div className="secret-display key">
                    {wallet.privateKey}
                  </div>
                )}
              </div>
              <p className="backup-hint">This gives full access to your funds - keep it secret</p>
            </div>

            <div className="confirm-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={backupConfirmed}
                  onChange={(e) => setBackupConfirmed(e.target.checked)}
                />
                <span>I have securely stored my backup materials</span>
              </label>
            </div>

            {error && (
              <div className="error-banner">
                <span>{error}</span>
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleConfirmBackup}
              disabled={!backupConfirmed}
            >
              Continue to Viewer Key
            </button>
          </div>
        );

      case 'add-viewer-key':
        return (
          <div className="onboarding-step">
            <h2>Create Viewer Key</h2>
            <p className="step-description">
              Viewer keys allow you to decrypt and view confidential token balances
            </p>

            <div className="form-group">
              <label htmlFor="viewer-label">Viewer Key Label</label>
              <input
                id="viewer-label"
                type="text"
                value={viewerKeyLabel}
                onChange={(e) => setViewerKeyLabel(e.target.value)}
                placeholder="Enter a label for this viewer key"
                disabled={isLoading}
              />
            </div>

            {!hasPasskeySupport && (
              <div className="info-box">
                <p>This viewer key will be protected with your passphrase</p>
              </div>
            )}

            {error && (
              <div className="error-banner">
                <span>{error}</span>
              </div>
            )}

            <button
              className="btn-primary"
              onClick={handleCreateViewerKey}
              disabled={isLoading || viewerKeyLabel.length === 0}
            >
              {isLoading ? 'Creating...' : 'Create Viewer Key'}
            </button>
          </div>
        );

      case 'complete':
        return (
          <div className="onboarding-step success-step">
            <div className="success-icon">🎉</div>
            <h2>You&apos;re All Set!</h2>
            <p className="step-description">
              Your MyBITE wallet is ready for confidential transactions
            </p>

            <div className="summary-box">
              <h3>What you have:</h3>
              <ul>
                {wallet && <li>✓ Self-custody spending wallet created</li>}
                {importedWallet && <li>✓ Wallet connected/imported</li>}
                {viewerKey && <li>✓ Viewer key for private balance viewing</li>}
              </ul>
            </div>

            <button
              className="btn-primary btn-large"
              onClick={onComplete}
            >
              Open My Wallet
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  const steps = ['welcome', 'choice', currentStep === 'create-wallet' || currentStep === 'import-wallet' || currentStep === 'connect-wallet' ? 'wallet-setup' : null, 'backup', 'complete'].filter(Boolean);
  const currentIndex = steps.indexOf(
    currentStep === 'create-wallet' || currentStep === 'import-wallet' || currentStep === 'connect-wallet' ? 'wallet-setup' : currentStep
  );

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-progress">
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          const isPast = index < currentIndex;
          
          return (
            <div
              key={step || index}
              className={`progress-dot ${isActive ? 'active' : ''} ${isPast ? 'completed' : ''}`}
            />
          );
        })}
      </div>
      {renderStep()}
    </div>
  );
}

/**
 * @param {Object} props
 * @param {(secret: string) => void} props.onImport
 * @param {boolean} props.isLoading
 * @param {string | null} props.error
 * @param {boolean} props.hasPasskeySupport
 * @param {string} props.passphrase
 * @param {(value: string) => void} props.setPassphrase
 * @param {string} props.passphraseConfirm
 * @param {(value: string) => void} props.setPassphraseConfirm
 * @param {boolean} props.canProceed
 */
function ImportWalletForm({
  onImport,
  isLoading,
  error,
  hasPasskeySupport,
  passphrase,
  setPassphrase,
  passphraseConfirm,
  setPassphraseConfirm,
  canProceed,
}) {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const handleSubmit = () => {
    if (secret.trim()) {
      onImport(secret.trim());
    }
  };

  return (
    <div className="import-form">
      <div className="form-group">
        <label htmlFor="secret">Recovery Phrase or Private Key</label>
        <textarea
          id="secret"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Enter 12/24 word recovery phrase or private key (0x...)"
          rows={3}
          disabled={isLoading}
        />
        <button
          className="btn-toggle-visibility"
          onClick={() => setShowSecret(!showSecret)}
          type="button"
        >
          {showSecret ? '🙈' : '👁'}
        </button>
      </div>

      {!hasPasskeySupport && (
        <div className="form-group">
          <label htmlFor="import-passphrase">Set Passphrase</label>
          <input
            id="import-passphrase"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder="Enter a strong passphrase (min 8 characters)"
            disabled={isLoading}
          />
          <label htmlFor="import-passphrase-confirm">Confirm Passphrase</label>
          <input
            id="import-passphrase-confirm"
            type="password"
            value={passphraseConfirm}
            onChange={(e) => setPassphraseConfirm(e.target.value)}
            placeholder="Confirm your passphrase"
            disabled={isLoading}
          />
          {passphrase !== passphraseConfirm && passphraseConfirm.length > 0 && (
            <span className="error-text">Passphrases do not match</span>
          )}
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
        </div>
      )}

      <div className="button-group">
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={isLoading || !secret.trim() || !canProceed}
        >
          {isLoading ? 'Importing...' : 'Import Wallet'}
        </button>
      </div>
    </div>
  );
}
