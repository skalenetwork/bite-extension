import { useMemo, useState } from 'react';
import type { StoredViewerKey, TokenConfig } from '../../types';

interface EnhancedBalanceCardProps {
  token: TokenConfig;
  keyData: StoredViewerKey;
  publicBalance?: string | null;
  privateBalance?: string | null;
  isRegistered: boolean;
  loading: boolean;
  onViewBalance: () => void | Promise<void>;
  onHolderAddressChange?: (value: string) => void;
  holderAddress?: string;
}

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
}: EnhancedBalanceCardProps): React.ReactElement {
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

  const isLocked = privateBalance == null;

  const handleReveal = async (): Promise<void> => {
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

  const regBadge = isRegistered
    ? { text: 'Registered', color: 'green' }
    : { text: 'Not Registered', color: 'yellow' };
  const encBadge = isLocked
    ? { text: 'Encrypted', color: 'yellow' }
    : { text: 'Decrypted', color: 'green' };

  return (
    <div className="enhanced-balance-card">
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

      <div className="holder-address-section">
        <label className="input-label">Holder Address</label>
        <input
          type="text"
          className="holder-address-input"
          placeholder="Enter holder address to decrypt balance..."
          value={holderAddress ?? ''}
          onChange={(event) => onHolderAddressChange?.(event.target.value)}
          disabled={loading}
        />
        <span className="input-hint">Enter the address that holds {token.symbol}</span>
      </div>

      <div className="balance-section public">
        <div className="balance-section-header">
          <span className="balance-label">Public Balance</span>
          <span className="badge on-chain">On-Chain</span>
        </div>
        <div className="balance-value public">
          <span className="amount">{formattedPublicBalance}</span>
          <span className="symbol">{token.symbol}</span>
        </div>
      </div>

      <div className="balance-section private">
        <div className="balance-section-header">
          <span className="balance-label">Confidential Balance</span>
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
            <button className="btn-reveal btn-sm" onClick={() => void handleReveal()} disabled={isDecrypting || !holderAddress} type="button">
              {isDecrypting ? 'Decrypting...' : 'Reveal'}
            </button>
          </div>
        ) : (
          <div className="balance-value revealed">
            <span className="amount">{formattedPrivateBalance}</span>
            <span className="symbol">{token.symbol}</span>
            <button className="btn-hide btn-sm" onClick={() => void handleReveal()} type="button">
              Hide
            </button>
          </div>
        )}
      </div>
      <input type="hidden" value={keyData.id} readOnly />
    </div>
  );
}
