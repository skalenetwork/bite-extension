import React, { useState } from 'react';

export function RegisterKeyModal({ keyData, tokens, onClose, onSubmit, loading }) {
  const [selectedToken, setSelectedToken] = useState(tokens[0]?.address || '');
  const [depositAmount, setDepositAmount] = useState('0.001');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(keyData.id, selectedToken, depositAmount);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Register Viewer Key</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
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
              onChange={(e) => setSelectedToken(e.target.value)}
            >
              {tokens.map((token) => (
                <option key={token.address} value={token.address}>
                  {token.symbol} - {token.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="deposit-amount">Deposit Amount (sFUEL)</label>
            <input
              id="deposit-amount"
              type="number"
              step="0.001"
              min="0"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <small className="hint">
              Deposit covers callback execution costs for confidential operations. Unused deposits can be withdrawn later.
            </small>
          </div>

          <div className="info-box">
            <p><strong>What happens next?</strong></p>
            <ol>
              <li>We'll encrypt the registration transaction using BITE</li>
              <li>MetaMask will prompt you to sign the encrypted transaction</li>
              <li>Once confirmed, your public key will be registered on-chain</li>
              <li>You can then view confidential balances with Face/Touch ID</li>
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
              {loading ? 'Preparing...' : 'Register via MetaMask'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
