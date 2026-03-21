import { useEffect, useState, type ChangeEvent } from 'react';
import type { DecryptedBalance, StoredViewerKey, TokenConfig } from '../../types';

interface BalanceCardProps {
  token: TokenConfig;
  keyData: StoredViewerKey;
  balance?: DecryptedBalance;
  loading: boolean;
  onViewBalance: () => void | Promise<void>;
  onHolderAddressChange?: (tokenAddress: string, value: string) => void;
  isRegistered: boolean;
}

export function BalanceCard({
  token,
  keyData,
  balance,
  loading,
  onViewBalance,
  onHolderAddressChange,
  isRegistered,
}: BalanceCardProps): React.ReactElement {
  const [holderAddress, setHolderAddress] = useState('');
  const hasBalance = balance !== undefined;
  const isSessionActive = Boolean(hasBalance && balance?.decryptedAt);
  const statusText = isRegistered ? 'Registered on-chain' : 'Not registered yet';

  useEffect(() => {
    const saved = localStorage.getItem(`holder-address-${token.address}`);
    if (!saved) return;

    setHolderAddress(saved);
    onHolderAddressChange?.(token.address, saved);
  }, [onHolderAddressChange, token.address]);

  const handleAddressChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    setHolderAddress(value);
    localStorage.setItem(`holder-address-${token.address}`, value);
    onHolderAddressChange?.(token.address, value);
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
        <small className="holder-hint">{statusText}</small>
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
          <button className="btn-refresh" onClick={() => void onViewBalance()} disabled={loading} type="button">
            {loading ? 'Decrypting...' : '🔓 Refresh'}
          </button>
        ) : (
          <button className="btn-unlock" onClick={() => void onViewBalance()} disabled={loading || !holderAddress} type="button">
            {loading ? 'Authenticating...' : '🔐 Unlock'}
          </button>
        )}
      </div>

      {isSessionActive && balance ? (
        <div className="session-info">
          <span className="session-pill">Unlocked</span>
          <small>
            Last decrypted {new Date(balance.decryptedAt).toLocaleTimeString()}. Use Lock Now in the footer to clear it.
          </small>
        </div>
      ) : null}
      <input type="hidden" value={keyData.id} readOnly />
    </div>
  );
}
