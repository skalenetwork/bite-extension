import React, { useState } from 'react';
import { injectedWalletService } from '../../services/injectedWallet';

/**
 * AddKeyModal - Enhanced to support both manual entry and MetaMask signing
 * @param {Object} props
 * @param {Function} props.onClose - callback
 * @param {Function} props.onSubmit - callback for creating new key ({ label, passphrase })
 * @param {Function} props.onAddExisting - callback for adding existing key (label, publicKey, signature?)
 * @param {string} props.mode - 'create' | 'add-existing' (initial mode)
 * @param {number} props.keyCount - current number of keys
 * @param {string} props.connectedWalletAddress - currently connected wallet address
 * @param {boolean} props.isWalletConnected - whether wallet is connected
 */
export function AddKeyModal({
  onClose,
  onSubmit,
  onAddExisting,
  mode: initialMode = 'create',
  keyCount = 0,
  connectedWalletAddress,
  isWalletConnected = false,
}) {
  const [mode, setMode] = useState(initialMode); // 'create' | 'add-existing'
  const [label, setLabel] = useState(`Key ${keyCount + 1}`);
  const [publicKey, setPublicKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [localError, setLocalError] = useState(null);
  const [verifiedSignature, setVerifiedSignature] = useState(null);
  const [verificationMessage, setVerificationMessage] = useState(null);

  const hasFallbackPassphrase = Boolean(passphrase || confirmPassphrase);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setIsProcessing(true);

    if (passphrase && passphrase !== confirmPassphrase) {
      setLocalError('Passphrases do not match.');
      setIsProcessing(false);
      return;
    }

    try {
      await onSubmit({ label, passphrase: passphrase || undefined });
    } catch (err) {
      setLocalError(err.message || 'Failed to create key');
      setIsProcessing(false);
    }
  };

  const handleExistingSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setIsProcessing(true);

    if (!publicKey.trim()) {
      setLocalError('Public key is required.');
      setIsProcessing(false);
      return;
    }

    try {
      // Validate hex format
      const trimmedKey = publicKey.trim();
      if (!trimmedKey.startsWith('0x') || trimmedKey.length !== 68) {
        throw new Error('Public key must be a valid 33-byte hex string (0x + 66 characters)');
      }

      await onAddExisting({
        label,
        publicKey: trimmedKey,
        walletAddress: connectedWalletAddress,
        signature: verifiedSignature,
        verificationMessage,
      });
    } catch (err) {
      setLocalError(err.message || 'Failed to add key');
      setIsProcessing(false);
    }
  };

  const handleVerifyWithMetaMask = async () => {
    setLocalError(null);
    setIsProcessing(true);

    try {
      if (!publicKey.trim()) {
        throw new Error('Please enter the public key first');
      }

      if (!isWalletConnected) {
        throw new Error('Please connect a wallet first');
      }

      // Generate verification message
      const keyId = `manual-${Date.now()}`;
      const message = injectedWalletService.createViewerKeyMessage?.(keyId, publicKey.trim()) ||
        [
          'MyBITE Wallet - Viewer Key Verification',
          '',
          'This message proves ownership of a viewer key.',
          '',
          `Domain: ${window.location.origin}`,
          `Key ID: ${keyId}`,
          `Public Key: ${publicKey.trim()}`,
          `Timestamp: ${Date.now()}`,
          '',
          'By signing this message, you confirm this viewer key belongs to your wallet.',
        ].join('\n');

      const signature = await injectedWalletService.signMessage(message);

      if (!signature) {
        throw new Error('Failed to get signature from wallet');
      }

      // Verify the signature matches the connected wallet
      const recoveredAddress = await injectedWalletService.recoverAddressFromSignature(message, signature);

      if (recoveredAddress?.toLowerCase() !== connectedWalletAddress?.toLowerCase()) {
        throw new Error('Signature does not match the connected wallet address');
      }

      setVerifiedSignature(signature);
      setVerificationMessage(message);
    } catch (err) {
      setLocalError(err.message || 'Failed to verify with MetaMask');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  const getModeTitle = () => {
    switch (mode) {
      case 'create':
        return 'Create New Viewer Key';
      case 'add-existing':
        return 'Add Existing Viewer Key';
      default:
        return 'Add Viewer Key';
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{getModeTitle()}</h3>
          <button
            className="modal-close"
            onClick={handleClose}
            disabled={isProcessing}
          >
            ×
          </button>
        </div>

        {/* Mode Selection Tabs */}
        <div style={{
          padding: '20px 20px 0',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '16px',
          }}>
            <button
              type="button"
              onClick={() => {
                setMode('create');
                setLocalError(null);
              }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `2px solid ${mode === 'create' ? 'var(--primary)' : 'var(--border)'}`,
                background: mode === 'create' ? 'rgba(47, 111, 237, 0.1)' : 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px' }}>Create New</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Generate fresh key</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('add-existing');
                setLocalError(null);
              }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `2px solid ${mode === 'add-existing' ? 'var(--primary)' : 'var(--border)'}`,
                background: mode === 'add-existing' ? 'rgba(47, 111, 237, 0.1)' : 'white',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '13px' }}>Add Existing</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Import existing key</div>
            </button>
          </div>
        </div>

        {mode === 'create' ? (
          <form onSubmit={handleCreateSubmit}>
            <div className="form-group">
              <label htmlFor="key-label">Key Label (optional)</label>
              <input
                id="key-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Key ${keyCount + 1}`}
                disabled={isProcessing}
              />
              <small className="hint">
                This key unlocks confidential balance viewing only. It is separate from your spending wallet.
              </small>
            </div>

            <div className="info-box info-box-subtle">
              <p><strong>Protection</strong></p>
              <ol>
                <li>Passkey PRF is used when available.</li>
                <li>Enter a fallback passphrase only if your authenticator does not support PRF.</li>
                <li>Keep the passphrase somewhere safe if you use it, because it is part of the unlock path.</li>
              </ol>
            </div>

            <div className="form-group">
              <label htmlFor="viewer-passphrase">Fallback Passphrase</label>
              <input
                id="viewer-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Optional, used only when passkey PRF is unavailable"
                disabled={isProcessing}
              />
              <small className="hint">
                Leave this blank if your device supports passkey PRF.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="viewer-passphrase-confirm">Confirm Passphrase</label>
              <input
                id="viewer-passphrase-confirm"
                type="password"
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder={hasFallbackPassphrase ? 'Repeat passphrase' : 'Optional unless using fallback'}
                disabled={isProcessing}
              />
            </div>

            {localError && (
              <div className="error-message modal-inline-error">
                <strong>Error:</strong> {localError}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <span className="spinner" style={{ marginRight: '8px' }}>⟳</span>
                    Creating...
                  </>
                ) : (
                  'Create Viewer Key'
                )}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleExistingSubmit}>
            <div className="form-group">
              <label htmlFor="existing-key-label">Key Label</label>
              <input
                id="existing-key-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={`Key ${keyCount + 1}`}
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label htmlFor="public-key">Public Key</label>
              <textarea
                id="public-key"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="Enter the viewer public key (hex format, e.g., 0x04...)"
                rows={3}
                disabled={isProcessing || verifiedSignature !== null}
              />
              <small className="hint">
                The public key associated with your existing viewer key (33 bytes, 0x + 66 hex chars).
              </small>
            </div>

            {/* Info box about adding viewer key */}
            <div className="info-box info-box-subtle" style={{ marginBottom: '16px' }}>
              <p><strong>Adding a Viewer Key</strong></p>
              <p style={{ fontSize: '12px' }}>
                Adding a viewer key allows you to decrypt balances encrypted with this key's public key.
                This does not give spending access - only balance viewing.
              </p>
            </div>

            {isWalletConnected && (
              <div className="info-box info-box-subtle" style={{ marginBottom: '16px' }}>
                <p><strong>Verify Ownership (Optional)</strong></p>
                <p style={{ fontSize: '12px' }}>
                  Sign a message with your connected wallet to prove this viewer key belongs to you.
                </p>

                {!verifiedSignature ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleVerifyWithMetaMask}
                disabled={isProcessing || !publicKey.trim()}
                style={{ width: '100%' }}
              >
                    {isProcessing ? (
                      <>
                        <span className="spinner" style={{ marginRight: '8px' }}>⟳</span>
                        Signing...
                      </>
                    ) : (
                      '🔏 Verify with MetaMask'
                    )}
                  </button>
                ) : (
                  <div style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: '#f0fdf4',
                    borderRadius: '8px',
                    border: '1px solid #86efac',
                  }}>
                    <div style={{ color: '#166534', fontWeight: 600, fontSize: '13px' }}>
                      ✓ Ownership verified
                    </div>
                    <div style={{ color: '#166534', fontSize: '11px', marginTop: '4px' }}>
                      This key is cryptographically linked to your wallet
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label htmlFor="existing-passphrase">Passphrase (if protected)</label>
              <input
                id="existing-passphrase"
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Only if this key uses passphrase protection"
                disabled={isProcessing}
              />
              <small className="hint">
                If your existing key was protected with a passphrase, enter it here.
              </small>
            </div>

            {localError && (
              <div className="error-message modal-inline-error">
                <strong>Error:</strong> {localError}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={handleClose}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={isProcessing || !publicKey.trim()}
              >
                {isProcessing ? (
                  <>
                    <span className="spinner" style={{ marginRight: '8px' }}>⟳</span>
                    Adding...
                  </>
                ) : (
                  'Add Viewer Key'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
