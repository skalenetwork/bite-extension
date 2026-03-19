import React from 'react';

export function BalanceCard({ token, keyData, balance, loading, onViewBalance }) {
  const hasBalance = balance !== undefined;
  const isSessionActive = hasBalance && balance.decryptedAt;

  return (
    <div className="balance-card">
      <div className="balance-header">
        <div className="token-info">
          <span className="token-symbol">{token.symbol}</span>
          <span className="token-name">{token.name}</span>
        </div>
        <span className="token-decimals">{token.decimals} decimals</span>
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
            disabled={loading}
          >
            {loading ? 'Authenticating...' : '🔐 Unlock with Biometrics'}
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
