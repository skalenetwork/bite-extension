import { useState } from 'react';
import { ethers } from 'ethers';
import type { StoredWalletAccount, WalletNetworkInfo } from '../../types';

interface WalletConnectionCardProps {
  account: StoredWalletAccount | null;
  networkInfo: WalletNetworkInfo | null;
  balance: string | null;
  onDisconnect: () => Promise<void>;
  onSwitchNetwork: () => Promise<void>;
  targetNetwork: { chainId: string; name: string } | null;
}

export function WalletConnectionCard({
  account,
  networkInfo,
  balance,
  onDisconnect,
  onSwitchNetwork,
  targetNetwork,
}: WalletConnectionCardProps): React.ReactElement {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatAddress = (address: string): string => {
    if (!address || !ethers.isAddress(address)) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopy = async (): Promise<void> => {
    if (!account?.address) return;
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const providerRef = account?.providerRef || 'injected';
  const isCorrectNetwork = Boolean(targetNetwork && networkInfo?.chainId === targetNetwork.chainId);

  const getProviderIcon = (): string => {
    if (providerRef.includes('metamask') || providerRef.includes('MetaMask')) return '🦊';
    if (providerRef.includes('coinbase')) return '📘';
    if (providerRef.includes('trust')) return '🔵';
    if (providerRef.includes('walletconnect')) return '🔗';
    if (providerRef.includes('smart-wallet')) return '🗝️';
    return '🔐';
  };

  const getProviderName = (): string => {
    if (providerRef.includes('metamask') || providerRef.includes('MetaMask')) return 'MetaMask';
    if (providerRef.includes('coinbase')) return 'Coinbase Smart Wallet';
    if (providerRef.includes('trust')) return 'Trust Wallet';
    if (providerRef.includes('walletconnect')) return 'WalletConnect';
    return account?.mode === 'smart-account' ? 'Smart Wallet' : 'Injected Wallet';
  };

  if (!account?.address) {
    return (
      <div className="wallet-connection-card not-connected">
        <div className="wallet-connection-header">
          <div className="wallet-icon-wrapper disconnected">
            <span className="wallet-icon">🔌</span>
          </div>
          <div className="wallet-info">
            <span className="wallet-title">Not Connected</span>
            <span className="wallet-status">
              <span className="status-dot offline" />
              No wallet detected
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-connection-card connected">
      <div className="wallet-connection-header">
        <div className="wallet-icon-wrapper">
          <span className="wallet-icon">{getProviderIcon()}</span>
        </div>
        <div className="wallet-info">
          <span className="wallet-title">{getProviderName()}</span>
          <span className="wallet-status">
            <span className={`status-dot ${isCorrectNetwork ? 'online' : 'warning'}`} />
            {isCorrectNetwork ? 'Connected' : 'Wrong Network'}
          </span>
        </div>
        {account.mode === 'external' ? (
          <button
            className="btn-disconnect btn-sm"
            onClick={async () => {
              setIsDisconnecting(true);
              try {
                await onDisconnect();
              } finally {
                setIsDisconnecting(false);
              }
            }}
            disabled={isDisconnecting}
            type="button"
          >
            {isDisconnecting ? '...' : 'Disconnect'}
          </button>
        ) : null}
      </div>

      <div className="wallet-connection-body">
        <div className="wallet-address-section">
          <label className="section-label">Address</label>
          <div className="address-display">
            <code className="address-value">{formatAddress(account.address)}</code>
            <button className={`btn-copy btn-sm ${copied ? 'copied' : ''}`} onClick={() => void handleCopy()} title="Copy address" type="button">
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>

        <div className="wallet-network-section">
          <label className="section-label">Network</label>
          <div className="network-display">
            <span className={`network-indicator ${isCorrectNetwork ? 'correct' : 'wrong'}`} />
            <span className="network-name">{isCorrectNetwork ? targetNetwork?.name : (networkInfo?.name || 'Wrong Network')}</span>
          </div>
          {!isCorrectNetwork && account.mode === 'external' ? (
            <button
              className="btn-switch-network btn-sm"
              onClick={async () => {
                setIsSwitching(true);
                try {
                  await onSwitchNetwork();
                } finally {
                  setIsSwitching(false);
                }
              }}
              disabled={isSwitching}
              type="button"
            >
              {isSwitching ? 'Switching...' : 'Switch Network'}
            </button>
          ) : null}
        </div>

        {balance ? (
          <div className="wallet-balance-section">
            <label className="section-label">Balance</label>
            <div className="balance-display">
              <span className="balance-amount">{balance}</span>
              <span className="balance-symbol">sFUEL</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
