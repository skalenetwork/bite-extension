import { useState, type FormEvent } from 'react';
import type { StoredViewerKey, TokenConfig } from '../../types';

interface RegisterKeyModalProps {
  keyData: StoredViewerKey;
  tokens: TokenConfig[];
  onClose: () => void;
  onSubmit: (keyId: string, tokenAddress: string, depositAmount: string) => void;
  loading: boolean;
  walletLabel: string | null;
}

export function RegisterKeyModal({
  keyData,
  tokens,
  onClose,
  onSubmit,
  loading,
  walletLabel,
}: RegisterKeyModalProps): React.ReactElement {
  const [selectedToken, setSelectedToken] = useState(tokens[0]?.address ?? '');
  const [depositAmount, setDepositAmount] = useState('0.001');
  const selectedTokenData = tokens.find((token) => token.address === selectedToken) ?? tokens[0];
  const signerLabel = walletLabel?.toLowerCase().includes('external')
    ? 'Connected wallet'
    : walletLabel ?? 'Connected wallet';

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSubmit(keyData.id, selectedToken, depositAmount);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Register Viewer Key</h3>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="info-box info-box-subtle">
            <p><strong>Register this viewer key</strong></p>
            <p>The public key is written on-chain for the selected token. The spending wallet only signs the transaction.</p>
            <p>Active signer: {signerLabel}</p>
          </div>

          <div className="form-group">
            <label>Selected Key</label>
            <div className="key-preview">
              <span className="key-preview-label">{keyData.label}</span>
              <code className="key-preview-value">
                {keyData.publicKeyHex.slice(0, 20)}...{keyData.publicKeyHex.slice(-8)}
              </code>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="token-select">Select Token</label>
            <select
              id="token-select"
              value={selectedToken}
              onChange={(event) => setSelectedToken(event.target.value)}
            >
              {tokens.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.symbol} - {token.name}
                </option>
              ))}
            </select>
            <small className="hint">
              {selectedTokenData ? `You are registering for ${selectedTokenData.symbol}.` : 'Choose the token that will use this viewer key.'}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="deposit-amount">Deposit Amount (sFUEL)</label>
            <input
              id="deposit-amount"
              type="number"
              step="0.001"
              min="0"
              value={depositAmount}
              onChange={(event) => setDepositAmount(event.target.value)}
            />
            <small className="hint">
              Deposit covers callback execution costs for confidential operations. Unused deposits can be withdrawn later.
            </small>
          </div>

          <div className="info-box info-box-subtle">
            <p><strong>What happens next?</strong></p>
            <ol>
              <li>The transaction is encrypted with BITE before signing.</li>
              <li>Your selected spending wallet signs it.</li>
              <li>The key becomes available for confidential balance viewing after confirmation.</li>
              <li>You can unlock later without re-registering unless you rotate the key.</li>
            </ol>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !selectedToken}
            >
              {loading ? 'Preparing...' : 'Register Viewer Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
