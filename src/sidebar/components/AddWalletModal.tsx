import { useEffect, useState, type FormEvent } from 'react';
import { PasskeyService } from '../../services/passkey';

type WalletSetupMode = 'create' | 'import' | 'external';

interface AddWalletModalProps {
  onClose: () => void;
  onCreate: (payload: { passphrase?: string }) => Promise<void>;
  onImport: (payload: { secret: string; passphrase?: string }) => Promise<void>;
  onConnectExternal: () => Promise<void>;
  loading: boolean;
}

const modeCopy: Record<WalletSetupMode, { title: string; description: string }> = {
  create: {
    title: 'Create a passkey smart wallet',
    description: 'Create a new spending wallet secured by your passkey. No seed phrase is shown during setup.',
  },
  import: {
    title: 'Import an existing wallet',
    description: 'Bring in a seed phrase or private key you already control. Imported wallets stay in advanced mode.',
  },
  external: {
    title: 'Connect an injected wallet',
    description: 'Use a connected wallet for spending while the viewer key stays protected in this extension.',
  },
};

export function AddWalletModal({
  onClose,
  onCreate,
  onImport,
  onConnectExternal,
  loading,
}: AddWalletModalProps): React.ReactElement {
  const [mode, setMode] = useState<WalletSetupMode>('create');
  const [secret, setSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [hasPasskeySupport, setHasPasskeySupport] = useState(false);

  useEffect(() => {
    setHasPasskeySupport(PasskeyService.isAvailable());
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLocalError(null);

    try {
      if (mode === 'external') {
        await onConnectExternal();
        return;
      }

      if (mode === 'create') {
        await onCreate({});
        return;
      }

      if (!hasPasskeySupport && !passphrase) {
        throw new Error('A passphrase is required when passkeys are unavailable.');
      }

      if (!hasPasskeySupport && passphrase !== confirmPassphrase) {
        throw new Error('Passphrases do not match.');
      }

      await onImport({ secret, passphrase: hasPasskeySupport ? undefined : passphrase });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to set up wallet.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Spending Wallet</h3>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="info-box info-box-subtle">
            <p><strong>{modeCopy[mode].title}</strong></p>
            <p>{modeCopy[mode].description}</p>
          </div>

          <div className="form-group">
            <label htmlFor="wallet-mode">Wallet Mode</label>
            <select
              id="wallet-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as WalletSetupMode)}
            >
              <option value="create">Create passkey smart wallet</option>
              <option value="import">Import existing wallet</option>
              <option value="external">Connect injected wallet</option>
            </select>
            <small className="hint">
              New wallets use passkeys and account abstraction. Import stays available for advanced users who already hold a secret.
            </small>
          </div>

          {mode === 'import' ? (
            <>
              <div className="form-group">
                <label htmlFor="wallet-secret">Seed Phrase or Private Key</label>
                <textarea
                  id="wallet-secret"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder="Paste mnemonic or 0x private key"
                  rows={4}
                />
                <small className="hint">
                  Paste only if you are importing a wallet you already control.
                </small>
              </div>

              {!hasPasskeySupport ? (
                <>
                  <div className="form-group">
                    <label htmlFor="wallet-passphrase">Wallet Passphrase</label>
                    <input
                      id="wallet-passphrase"
                      type="password"
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      placeholder="Required to unlock imported wallet"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="wallet-passphrase-confirm">Confirm Passphrase</label>
                    <input
                      id="wallet-passphrase-confirm"
                      type="password"
                      value={confirmPassphrase}
                      onChange={(event) => setConfirmPassphrase(event.target.value)}
                      placeholder="Repeat passphrase"
                    />
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {mode === 'create' ? (
            <div className="info-box info-box-warning">
              <p><strong>No seed phrase during setup</strong></p>
              <p>Your passkey controls the smart wallet. Imported-wallet export stays in Settings only.</p>
            </div>
          ) : null}

          {localError ? (
            <div className="error-message">
              <strong>Error:</strong> {localError}
            </div>
          ) : null}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Working...' : mode === 'external' ? 'Connect Injected Wallet' : mode === 'import' ? 'Import Wallet' : 'Create Wallet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
