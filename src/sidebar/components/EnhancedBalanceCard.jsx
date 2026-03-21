import React, { useState, useMemo } from 'react';

/**
 * EnhancedBalanceCard - Displays both unencrypted (public) and decrypted (private) balances
 * @param {Object} props
 * @param {Object} props.token - { address, symbol, name, decimals }
 * @param {Object} props.keyData - viewer key data
 * @param {string} props.publicBalance - string (unencrypted, always visible)
 * @param {string|null} props.privateBalance - string | null (decrypted, null if locked)
 * @param {boolean} props.isRegistered - boolean
 * @param {boolean} props.loading - boolean
 * @param {Function} props.onViewBalance - callback to decrypt
 * @param {Function} props.onHolderAddressChange - callback(address)
 * @param {string} props.holderAddress - string
 */
export function EnhancedBalanceCard({
  token,
  keyData,
  publicBalance,
  privateBalance,
  isRegistered,
  loading,
  onViewBalance,
  onHolderAddressChange,
  holderAddress,
}) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const formattedPublicBalance = useMemo(() => {
    if (!publicBalance || publicBalance === '0') return '0.0000';
    try {
      return (Number(publicBalance) / 10 ** token.decimals).toFixed(4);
    } catch {
      return '0.0000';
    }
  }, [publicBalance, token.decimals]);

  const formattedPrivateBalance = useMemo(() => {
    if (!privateBalance || privateBalance === '0') return '0.0000';
    try {
      return (Number(privateBalance) / 10 ** token.decimals).toFixed(4);
    } catch {
      return '0.0000';
    }
  }, [privateBalance, token.decimals]);

  const hasPrivateBalance = Boolean(privateBalance !== null && privateBalance !== '0');
  const isLocked = privateBalance === null;

  const handleReveal = async () => {
    if (isRevealed) {
      setIsRevealed(false);
      return;
    }

    if (!isRegistered || !holderAddress) return;

    setIsDecrypting(true);
    try {
      await onViewBalance();
      setIsRevealed(true);
    } finally {
      setIsDecrypting(false);
    }
  };

  const getRegistrationBadge = () => {
    if (isRegistered) {
      return { text: 'Registered', color: 'green' };
    }
    return { text: 'Not Registered', color: 'yellow' };
  };

  const getEncryptedBadge = () => {
    if (isLocked) {
      return { text: 'Encrypted', color: 'yellow' };
    }
    return { text: 'Decrypted', color: 'green' };
  };

  const regBadge = getRegistrationBadge();
  const encBadge = getEncryptedBadge();

  return (
    <div className="enhanced-balance-card">
      {/* Header */}
      <div className="balance-card-header">
        <div className="token-header-info">
          <span className="token-symbol-badge">{token.symbol}</span>
          <div className="token-meta">
            <span className="token-name-text">{token.name}</span>
            <span className="token-decimals-badge">{token.decimals} decimals</span>
          </div>
        </div>
        <span className={`status-badge ${regBadge.color}`}>{regBadge.text}</span>
      </div>

      {/* Holder Address Input */}
      <div className="holder-address-section">
        <label className="input-label">Holder Address</label>
        <input
          type="text"
          className="holder-address-input"
          placeholder="Enter holder address to decrypt balance..."
          value={holderAddress || ''}
          onChange={(e) => onHolderAddressChange?.(e.target.value)}
          disabled={loading}
        />
        <span className="input-hint">
          Enter the address that holds {token.symbol}
        </span>
      </div>

      {/* Public Balance Section */}
      <div className="balance-section public">
        <div className="balance-section-header">
          <span className="balance-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            Public Balance
          </span>
          <span className="badge on-chain">On-Chain</span>
        </div>
        <div className="balance-value public">
          <span className="amount">{formattedPublicBalance}</span>
          <span className="symbol">{token.symbol}</span>
        </div>
      </div>

      {/* Private/Confidential Balance Section */}
      <div className="balance-section private">
        <div className="balance-section-header">
          <span className="balance-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Confidential Balance
          </span>
          <span className={`badge ${encBadge.color}`}>{encBadge.text}</span>
        </div>

        {loading ? (
          <div className="balance-value loading">
            <span className="loading-spinner">⟳</span>
            <span>Loading...</span>
          </div>
        ) : !isRegistered ? (
          <div className="balance-value not-registered">
            <span className="dots">••••••</span>
            <span className="hint">Register key to view</span>
          </div>
        ) : isLocked ? (
          <div className="balance-value locked">
            <span className="dots">••••••</span>
            <button
              className="btn-reveal btn-sm"
              onClick={handleReveal}
              disabled={isDecrypting || !holderAddress}
            >
              {isDecrypting ? (
                <>
                  <span className="spinner-small" />
                  Decrypting...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  Reveal
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="balance-value revealed">
            <span className="amount">{formattedPrivateBalance}</span>
            <span className="symbol">{token.symbol}</span>
            <button className="btn-hide btn-sm" onClick={handleReveal}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
              Hide
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
