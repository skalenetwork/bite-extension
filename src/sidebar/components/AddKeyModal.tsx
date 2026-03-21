import { useState, type FormEvent } from 'react';
import { injectedWalletService } from '../../services/injectedWallet';

type AddKeyMode = 'create' | 'add-existing';

interface AddExistingPayload {
  label: string;
  publicKey: string;
  walletAddress?: string;
  signature?: string;
  verificationMessage?: string;
}

interface AddKeyModalProps {
  onClose: () => void;
  onSubmit: (payload: { label: string; passphrase?: string }) => Promise<void>;
  onAddExisting: (payload: AddExistingPayload) => Promise<void>;
  mode?: AddKeyMode;
  keyCount?: number;
  connectedWalletAddress?: string | null;
  isWalletConnected?: boolean;
}

export function AddKeyModal({
  onClose,
  onSubmit,
  onAddExisting,
  mode: initialMode = 'create',
  keyCount = 0,
  connectedWalletAddress,
  isWalletConnected = false,
}: AddKeyModalProps): React.ReactElement {
  const [mode, setMode] = useState<AddKeyMode>(initialMode);
  const [label, setLabel] = useState(`Key ${keyCount + 1}`);
  const [publicKey, setPublicKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [verifiedSignature, setVerifiedSignature] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  const hasFallbackPassphrase = Boolean(passphrase || confirmPassphrase);

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLocalError(null);
    setIsProcessing(true);

    if (passphrase && passphrase !== confirmPassphrase) {
      setLocalError('Passphrases do not match.');
      setIsProcessing(false);
      return;
    }

    try {
      await onSubmit({ label, passphrase: passphrase || undefined });
      onClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to create key');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExistingSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setLocalError(null);
    setIsProcessing(true);

    try {
      const trimmedKey = publicKey.trim();
      if (!trimmedKey) {
        throw new Error('Public key is required.');
      }

      if (!trimmedKey.startsWith('0x')) {
        throw new Error('Public key must be a hex string.');
      }

      await onAddExisting({
        label,
        publicKey: trimmedKey,
        walletAddress: connectedWalletAddress || undefined,
        signature: verifiedSignature || undefined,
        verificationMessage: verificationMessage || undefined,
      });
      onClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to add key');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleVerifyWithWallet = async (): Promise<void> => {
    setLocalError(null);
    setIsProcessing(true);

    try {
      if (!publicKey.trim()) {
        throw new Error('Please enter the public key first');
      }

      if (!isWalletConnected) {
        throw new Error('Please connect a wallet first');
      }

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
        ].join('\n');

      const signature = await injectedWalletService.signMessage(message);
      if (!signature) {
        throw new Error('Failed to get signature from wallet');
      }

      const recoveredAddress = await injectedWalletService.recoverAddressFromSignature(message, signature);
      if (recoveredAddress?.toLowerCase() !== connectedWalletAddress?.toLowerCase()) {
        throw new Error('Signature does not match the connected wallet address');
      }

      setVerifiedSignature(signature);
      setVerificationMessage(message);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to verify with wallet');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{mode === 'create' ? 'Create New Viewer Key' : 'Add Existing Viewer Key'}</h3>
          <button className="modal-close" onClick={onClose} disabled={isProcessing} type="button">×</button>
        </div>

        <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button type="button" onClick={() => setMode('create')} style={{ flex: 1 }}>
              Create New
            </button>
            <button type="button" onClick={() => setMode('add-existing')} style={{ flex: 1 }}>
              Add Existing
            </button>
          </div>
        </div>

        {mode === 'create' ? (
          <form onSubmit={(event) => void handleCreateSubmit(event)}>
            <div className="form-group">
              <label htmlFor="key-label">Key Label</label>
              <input
                id="key-label"
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={`Key ${keyCount + 1}`}
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label htmlFor="viewer-passphrase">Fallback Passphrase</label>
              <input
                id="viewer-passphrase"
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="Optional, used only when passkey PRF is unavailable"
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label htmlFor="viewer-passphrase-confirm">Confirm Passphrase</label>
              <input
                id="viewer-passphrase-confirm"
                type="password"
                value={confirmPassphrase}
                onChange={(event) => setConfirmPassphrase(event.target.value)}
                placeholder={hasFallbackPassphrase ? 'Repeat passphrase' : 'Optional unless using fallback'}
                disabled={isProcessing}
              />
            </div>

            {localError ? <div className="error-message modal-inline-error"><strong>Error:</strong> {localError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isProcessing}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isProcessing}>
                {isProcessing ? 'Creating...' : 'Create Viewer Key'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={(event) => void handleExistingSubmit(event)}>
            <div className="form-group">
              <label htmlFor="existing-key-label">Key Label</label>
              <input
                id="existing-key-label"
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                disabled={isProcessing}
              />
            </div>

            <div className="form-group">
              <label htmlFor="public-key">Public Key</label>
              <textarea
                id="public-key"
                value={publicKey}
                onChange={(event) => setPublicKey(event.target.value)}
                rows={4}
                disabled={isProcessing}
              />
            </div>

            {isWalletConnected ? (
              <div className="info-box info-box-subtle">
                <p><strong>Optional wallet verification</strong></p>
                <p>Sign a verification message with the connected wallet to link this viewer key to that address.</p>
                <button type="button" className="btn-secondary btn-sm" onClick={() => void handleVerifyWithWallet()} disabled={isProcessing}>
                  {verifiedSignature ? 'Verified' : 'Verify with Wallet'}
                </button>
              </div>
            ) : null}

            {localError ? <div className="error-message modal-inline-error"><strong>Error:</strong> {localError}</div> : null}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={isProcessing}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={isProcessing}>
                {isProcessing ? 'Adding...' : 'Add Viewer Key'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
