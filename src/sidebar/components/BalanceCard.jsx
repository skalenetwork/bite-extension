import React, { useState, useEffect } from 'react';

export function BalanceCard({ 
  token, 
  keyData, 
  balance, 
  loading, 
  onViewBalance,
  onHolderAddressChange,
  isRegistered
}) {
  const hasBalance = balance !== undefined;
  const isSessionActive = hasBalance && balance.decryptedAt;
  const [holderAddress, setHolderAddress] = useState('');
  const statusText = isRegistered ? 'Registered on-chain' : 'Not registered yet';

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
          placeholder="Holder address to decrypt"
          className="holder-address-input"
        />
        <small className="holder-hint">
          Enter the address that holds {token.symbol}. This is the account whose encrypted balance you want to view.
        </small>
        <small className="holder-hint">
          {statusText}
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
        <div className="session-info">
          <span className="session-pill">Unlocked</span>
          <small>
            Last decrypted {new Date(balance.decryptedAt).toLocaleTimeString()}. Use Lock Now in the footer to clear it.
          </small>
        </div>
      )}
    </div>
  );
}
