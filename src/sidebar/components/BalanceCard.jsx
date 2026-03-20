import React, { useState, useEffect } from 'react';

export function BalanceCard({ 
  token, 
  keyData, 
  balance, 
  loading, 
  onViewBalance,
  onHolderAddressChange
}) {
  const hasBalance = balance !== undefined;
  const isSessionActive = hasBalance && balance.decryptedAt;
  const [holderAddress, setHolderAddress] = useState('');

  // Load saved holder address for this token
  useEffect(() => {
    const saved = localStorage.getItem(`holder-address-${token.address}`);
    if (saved) {
      setHolderAddress(saved);
      if (onHolderAddressChange) {
        onHolderAddressChange(token.address, saved);
      }
    }
  }, [token.address]);

  const handleAddressChange = (e) => {
    const value = e.target.value;
    setHolderAddress(value);
    localStorage.setItem(`holder-address-${token.address}`, value);
    if (onHolderAddressChange) {
      onHolderAddressChange(token.address, value);
    }
  };

  return (
    <div className="balance-card">
      <div className="balance-header">
        <div className="token-info">
          <span className="token-symbol">{token.symbol}</span>
          <span className="token-name">{token.name}</span>
        </div>
        <span className="token-decimals">{token.decimals} decimals</span>
      </div>

      <div className="holder-input">
        <input
          type="text"
          value={holderAddress}
          onChange={handleAddressChange}
          placeholder="Token holder address (0x...)"
          className="holder-address-input"
        />
        <small className="holder-hint">
          Address that holds {token.symbol}
        </small>
      </div>

      <div className="balance-amount">
        {hasBalance ? (
          <div className="balance-display">
            <span className="amount">{balance.amount}</span>
            <span className="symbol">{token.symbol}</span>
          </div>
        ) : (
          <div className="balance-placeholder">
            <span>••••••</span>
          </div>
        )}
      </div>

      <div className="balance-actions">
        {hasBalance ? (
          <button 
            className="btn-refresh"
            onClick={onViewBalance}
            disabled={loading}
          >
            {loading ? 'Decrypting...' : '🔓 Refresh'}
          </button>
        ) : (
          <button 
            className="btn-unlock"
            onClick={onViewBalance}
            disabled={loading || !holderAddress}
          >
            {loading ? 'Authenticating...' : '🔐 Unlock'}
          </button>
        )}
      </div>

      {isSessionActive && (
        <small className="session-info">
          Decrypted {new Date(balance.decryptedAt).toLocaleTimeString()}
        </small>
      )}
    </div>
  );
}
