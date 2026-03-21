import { useCallback, useEffect, useRef, useState } from 'react';
import { viewerKeyService } from '../../services/viewerKey';
import { PasskeyService } from '../../services/passkey';
import { walletService } from '../../services/wallet';
import type { CreatedWalletResult, OnboardingPath, StoredViewerKey, StoredWalletAccount } from '../../types';

interface OnboardingWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep = 'welcome' | 'choice' | 'create-wallet' | 'import-wallet' | 'connect-wallet' | 'add-viewer-key' | 'complete';

export function OnboardingWizard({ onComplete, onCancel }: OnboardingWizardProps): React.ReactElement {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [wallet, setWallet] = useState<CreatedWalletResult | null>(null);
  const [connectedWallet, setConnectedWallet] = useState<StoredWalletAccount | null>(null);
  const [viewerKey, setViewerKey] = useState<StoredViewerKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [passphraseConfirm, setPassphraseConfirm] = useState('');
  const [viewerKeyLabel, setViewerKeyLabel] = useState('My Viewer Key');
  const [hasPasskeySupport, setHasPasskeySupport] = useState(false);
  const createWalletInFlightRef = useRef(false);

  useEffect(() => {
    setHasPasskeySupport(PasskeyService.isAvailable());
  }, []);

  const handleChoice = useCallback((choice: OnboardingPath): void => {
    if (choice === 'create') setCurrentStep('create-wallet');
    if (choice === 'import') setCurrentStep('import-wallet');
    if (choice === 'connect') setCurrentStep('connect-wallet');
  }, []);

  const handleCreateWallet = useCallback(async (): Promise<void> => {
    if (createWalletInFlightRef.current) return;
    if (!hasPasskeySupport && passphrase !== passphraseConfirm) {
      setError('Passphrases do not match');
      return;
    }

    createWalletInFlightRef.current = true;
    setIsLoading(true);
    setError(null);
    setStatusMessage('Check your system passkey prompt.');

    try {
      const result = await walletService.createLocalWallet({ passphrase: hasPasskeySupport ? undefined : passphrase });
      setWallet(result);
      setCurrentStep('add-viewer-key');
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create wallet');
    } finally {
      setIsLoading(false);
      setStatusMessage('');
      createWalletInFlightRef.current = false;
    }
  }, [hasPasskeySupport, passphrase, passphraseConfirm]);

  const handleImportWallet = useCallback(async (secret: string): Promise<void> => {
    if (!hasPasskeySupport && passphrase !== passphraseConfirm) {
      setError('Passphrases do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const imported = await walletService.importLocalWallet({
        secret,
        passphrase: hasPasskeySupport ? undefined : passphrase,
      });
      setConnectedWallet(imported);
      setCurrentStep('add-viewer-key');
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import wallet');
    } finally {
      setIsLoading(false);
    }
  }, [hasPasskeySupport, passphrase, passphraseConfirm]);

  const handleConnectWallet = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await walletService.connectExternalWallet();
      setConnectedWallet(result.account);
      setCurrentStep('add-viewer-key');
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Failed to connect wallet');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCreateViewerKey = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const key = await viewerKeyService.createViewerKey({
        label: viewerKeyLabel,
        passphrase: hasPasskeySupport ? undefined : passphrase,
      });
      setViewerKey(key);
      setCurrentStep('complete');
    } catch (viewerKeyError) {
      setError(viewerKeyError instanceof Error ? viewerKeyError.message : 'Failed to create viewer key');
    } finally {
      setIsLoading(false);
    }
  }, [hasPasskeySupport, passphrase, viewerKeyLabel]);

  const canProceedFromImport = hasPasskeySupport || (passphrase.length >= 8 && passphrase === passphraseConfirm);

  const renderBackButton = (target: WizardStep): React.ReactElement => (
    <button className="btn-ghost" onClick={() => setCurrentStep(target)} disabled={isLoading} type="button">
      ← Back
    </button>
  );

  return (
    <div className="onboarding-wizard">
      <div className="onboarding-progress">
        {['welcome', 'choice', 'wallet-setup', 'complete'].map((step, index) => {
          const activeIndex = ['welcome', 'choice', 'wallet-setup', 'complete'].indexOf(
            currentStep === 'create-wallet' || currentStep === 'import-wallet' || currentStep === 'connect-wallet' || currentStep === 'add-viewer-key'
              ? 'wallet-setup'
              : currentStep,
          );
          return (
            <div
              key={step}
              className={`progress-dot ${index === activeIndex ? 'active' : ''} ${index < activeIndex ? 'completed' : ''}`}
            />
          );
        })}
      </div>

      {currentStep === 'welcome' ? (
        <div className="onboarding-step">
          <div className="onboarding-logo">
            <span className="logo-icon">🔐</span>
            <h1>MyBITE Wallet</h1>
          </div>
          <p className="onboarding-tagline">Passkey-first confidential transactions on SKALE</p>
          <button className="btn-primary btn-large" onClick={() => setCurrentStep('choice')} type="button">
            Get Started
          </button>
          <button className="btn-ghost" onClick={onCancel} type="button">
            Cancel
          </button>
        </div>
      ) : null}

      {currentStep === 'choice' ? (
        <div className="onboarding-step">
          <h2>How would you like to start?</h2>
          <div className="choice-grid">
            <button className="choice-card" onClick={() => handleChoice('create')} disabled={isLoading} type="button">
              <span className="choice-icon">✨</span>
              <h3>Create Passkey Wallet</h3>
              <p>Create a smart wallet with your passkey and no seed phrase during setup.</p>
            </button>
            <button className="choice-card" onClick={() => handleChoice('import')} disabled={isLoading} type="button">
              <span className="choice-icon">📥</span>
              <h3>Import Existing</h3>
              <p>Bring in a private key or recovery phrase you already control.</p>
            </button>
            <button className="choice-card" onClick={() => handleChoice('connect')} disabled={isLoading} type="button">
              <span className="choice-icon">🔗</span>
              <h3>Connect Wallet</h3>
              <p>Use MetaMask, Rabby, or another injected wallet.</p>
            </button>
          </div>
          {renderBackButton('welcome')}
        </div>
      ) : null}

      {currentStep === 'create-wallet' ? (
        <div className="onboarding-step">
          <h2>Create Your Wallet</h2>
          <p className="step-description">Your passkey will control a smart wallet. No recovery phrase is shown.</p>
          {error ? <div className="error-banner"><span>{error}</span></div> : null}
          <div className="button-group">
            <button className="btn-primary" onClick={() => void handleCreateWallet()} disabled={isLoading} type="button">
              {isLoading ? statusMessage || 'Creating...' : 'Create Wallet'}
            </button>
            {renderBackButton('choice')}
          </div>
        </div>
      ) : null}

      {currentStep === 'import-wallet' ? (
        <div className="onboarding-step">
          <h2>Import Wallet</h2>
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
          {renderBackButton('choice')}
        </div>
      ) : null}

      {currentStep === 'connect-wallet' ? (
        <div className="onboarding-step">
          <h2>Connect External Wallet</h2>
          {error ? <div className="error-banner"><span>{error}</span></div> : null}
          <button className="btn-primary" onClick={() => void handleConnectWallet()} disabled={isLoading} type="button">
            {isLoading ? 'Connecting...' : 'Connect Injected Wallet'}
          </button>
          {renderBackButton('choice')}
        </div>
      ) : null}

      {currentStep === 'add-viewer-key' ? (
        <div className="onboarding-step">
          <h2>Create Viewer Key</h2>
          <p className="step-description">Viewer keys decrypt confidential balances. They stay separate from your spending wallet.</p>
          <div className="form-group">
            <label htmlFor="viewer-label">Viewer Key Label</label>
            <input
              id="viewer-label"
              type="text"
              value={viewerKeyLabel}
              onChange={(event) => setViewerKeyLabel(event.target.value)}
              disabled={isLoading}
            />
          </div>
          {error ? <div className="error-banner"><span>{error}</span></div> : null}
          <button className="btn-primary" onClick={() => void handleCreateViewerKey()} disabled={isLoading || !viewerKeyLabel} type="button">
            {isLoading ? 'Creating...' : 'Create Viewer Key'}
          </button>
        </div>
      ) : null}

      {currentStep === 'complete' ? (
        <div className="onboarding-step success-step">
          <div className="success-icon">🎉</div>
          <h2>You&apos;re All Set!</h2>
          <p className="step-description">Your wallet and viewer key are ready for confidential transactions.</p>
          <div className="summary-box">
            <ul>
              {wallet ? <li>✓ Passkey smart wallet created</li> : null}
              {connectedWallet ? <li>✓ Spending wallet connected</li> : null}
              {viewerKey ? <li>✓ Viewer key created</li> : null}
            </ul>
          </div>
          <button className="btn-primary btn-large" onClick={onComplete} type="button">
            Open My Wallet
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface ImportWalletFormProps {
  onImport: (secret: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
  hasPasskeySupport: boolean;
  passphrase: string;
  setPassphrase: (value: string) => void;
  passphraseConfirm: string;
  setPassphraseConfirm: (value: string) => void;
  canProceed: boolean;
}

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
}: ImportWalletFormProps): React.ReactElement {
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  return (
    <div className="import-form">
      <div className="form-group">
        <label htmlFor="secret">Recovery Phrase or Private Key</label>
        <textarea
          id="secret"
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
          rows={4}
          placeholder="Paste mnemonic or 0x private key"
          disabled={isLoading}
        />
      </div>

      {!hasPasskeySupport ? (
        <>
          <div className="form-group">
            <label htmlFor="import-passphrase">Passphrase</label>
            <input
              id="import-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label htmlFor="import-passphrase-confirm">Confirm Passphrase</label>
            <input
              id="import-passphrase-confirm"
              type="password"
              value={passphraseConfirm}
              onChange={(event) => setPassphraseConfirm(event.target.value)}
              disabled={isLoading}
            />
          </div>
        </>
      ) : null}

      {error ? <div className="error-banner"><span>{error}</span></div> : null}

      <div className="button-group">
        <button className="btn-primary" onClick={() => void onImport(secret.trim())} disabled={isLoading || !secret.trim() || !canProceed} type="button">
          {isLoading ? 'Importing...' : 'Import Wallet'}
        </button>
        <button className="btn-ghost" onClick={() => setShowSecret((value) => !value)} type="button">
          {showSecret ? 'Hide Input' : 'Reveal Input'}
        </button>
      </div>
      <input type="hidden" value={showSecret ? secret : ''} readOnly />
    </div>
  );
}
