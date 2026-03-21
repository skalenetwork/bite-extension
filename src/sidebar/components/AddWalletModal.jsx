import React, { useState } from 'react';

export function AddWalletModal({ onClose, onCreate, onImport, onConnectExternal, loading }) {
  const [mode, setMode] = useState('create');
  const [secret, setSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [localError, setLocalError] = useState(null);

  const modeCopy = {
    create: {
      title: 'Create a local self-custody wallet',
      description: 'Generate a new wallet inside the extension. You control the keys, so a backup is required before sending.',
    },
    import: {
      title: 'Import an existing wallet',
      description: 'Bring in a seed phrase or private key you already control. The wallet will be wrapped locally for unlock.',
    },
    external: {
      title: 'Connect an injected wallet',
      description: 'Use a connected wallet for spending while the viewer key stays protected in this extension.',
    },
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError(null);

    try {
      if (mode === 'external') {
        await onConnectExternal();
        return;
      }

      if (!passphrase) {
        throw new Error('A passphrase is required for self-custody wallets.');
      }

      if (passphrase !== confirmPassphrase) {
        throw new Error('Passphrases do not match.');
      }

      if (mode === 'create') {
        await onCreate({ passphrase });
        return;
      }

      await onImport({ secret, passphrase });
    } catch (error) {
      setLocalError(error.message || 'Failed to set up wallet.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Spending Wallet</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="info-box info-box-subtle">
            <p><strong>{modeCopy[mode].title}</strong></p>
            <p>{modeCopy[mode].description}</p>
          </div>

          <div className="form-group">
            <label htmlFor="wallet-mode">Wallet Mode</label>
            <select id="wallet-mode" value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="create">Create self-custody wallet</option>
              <option value="import">Import self-custody wallet</option>
              <option value="external">Connect injected wallet</option>
            </select>
            <small className="hint">
              Self-custody wallets stay wrapped locally. Connected wallets are for faster onboarding and signing only.
            </small>
          </div>

          {mode !== 'external' && (
            <>
              {mode === 'import' && (
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
              )}

              <div className="form-group">
                <label htmlFor="wallet-passphrase">Wallet Passphrase</label>
                <input
                  id="wallet-passphrase"
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Required to unlock local wallet"
                />
                <small className="hint">
                  This protects the local wallet in this browser. It is not the wallet recovery phrase.
                </small>
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

              {mode === 'create' && (
                <div className="info-box info-box-warning">
                  <p><strong>Backup required</strong></p>
                  <p>After creation, export the recovery phrase or private key and store it outside the browser. Sends stay disabled until backup is confirmed.</p>
                </div>
              )}
            </>
          )}

          {localError && (
            <div className="error-message">
              <strong>Error:</strong> {localError}
            </div>
          )}

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
