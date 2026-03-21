import React, { useState } from 'react';
import { ethers } from 'ethers';

/**
 * WalletConnectionCard - Shows connected MetaMask/injected wallet status
 * @param {Object} props
 * @param {Object} props.account - The connected wallet account { id, address, mode, providerRef }
 * @param {Object} props.networkInfo - { chainId, isSupported, name }
 * @param {string} props.balance - The wallet balance
 * @param {Function} props.onDisconnect - callback when disconnect clicked
 * @param {Function} props.onSwitchNetwork - callback when switch network clicked
 * @param {Object} props.targetNetwork - { chainId, name }
 */
export function WalletConnectionCard({
  account,
  networkInfo,
  balance,
  onDisconnect,
  onSwitchNetwork,
  targetNetwork,
}) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatAddress = (address) => {
    if (!address || !ethers.isAddress(address)) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleCopy = async () => {
    if (!account?.address) return;
    try {
      await navigator.clipboard.writeText(account.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
    }
  };

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSwitchNetwork = async () => {
    setIsSwitching(true);
    try {
      await onSwitchNetwork();
    } finally {
      setIsSwitching(false);
    }
  };

  const getProviderIcon = () => {
    const provider = account?.providerRef || 'injected';
    if (provider.includes('metamask') || provider.includes('MetaMask')) return '🦊';
    if (provider.includes('coinbase')) return '📘';
    if (provider.includes('trust')) return '🔵';
    if (provider.includes('walletconnect')) return '🔗';
    return '🔐';
  };

  const getProviderName = () => {
    const provider = account?.providerRef || 'injected';
    if (provider.includes('metamask') || provider.includes('MetaMask')) return 'MetaMask';
    if (provider.includes('coinbase')) return 'Coinbase Wallet';
    if (provider.includes('trust')) return 'Trust Wallet';
    if (provider.includes('walletconnect')) return 'WalletConnect';
    return 'Injected Wallet';
  };

  const isCorrectNetwork = targetNetwork && networkInfo?.chainId === targetNetwork.chainId;

  // Not Connected State
  if (!account || !account.address) {
    return (
      <div className="wallet-connection-card not-connected">
        <div className="wallet-connection-header">
          <div className="wallet-icon-wrapper disconnected">
            <span className="wallet-icon">🔌</span>
          </div>
          <div className="wallet-info">
            <span className="wallet-title">Not Connected</span>
            <span className="wallet-status">
              <span className="status-dot offline"></span>
              No wallet detected
            </span>
          </div>
        </div>
        <div className="wallet-connection-body">
          <p className="connection-hint">
            Connect an external wallet to view your balances and perform transactions.
          </p>
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
            <span className={`status-dot ${isCorrectNetwork ? 'online' : 'warning'}`}></span>
            {isCorrectNetwork ? 'Connected' : 'Wrong Network'}
          </span>
        </div>
        <button
          className="btn-disconnect btn-sm"
          onClick={handleDisconnect}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? (
            <span className="spinner-small" />
          ) : (
            'Disconnect'
          )}
        </button>
      </div>

      <div className="wallet-connection-body">
        {/* Address with copy */}
        <div className="wallet-address-section">
          <label className="section-label">Address</label>
          <div className="address-display">
            <code className="address-value">{formatAddress(account.address)}</code>
            <button
              className={`btn-copy btn-sm ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
              title="Copy address"
            >
              {copied ? '✓' : '📋'}
            </button>
          </div>
        </div>

        {/* Network indicator */}
        <div className="wallet-network-section">
          <label className="section-label">Network</label>
          <div className="network-display">
            <span className={`network-indicator ${isCorrectNetwork ? 'correct' : 'wrong'}`}></span>
            <span className="network-name">
              {isCorrectNetwork ? targetNetwork?.name : (networkInfo?.name || 'Wrong Network')}
            </span>
          </div>
          {!isCorrectNetwork && (
            <button
              className="btn-switch-network btn-sm"
              onClick={handleSwitchNetwork}
              disabled={isSwitching}
            >
              {isSwitching ? (
                <>
                  <span className="spinner-small" />
                  Switching...
                </>
              ) : (
                'Switch Network'
              )}
            </button>
          )}
        </div>

        {/* Balance */}
        {balance && (
          <div className="wallet-balance-section">
            <label className="section-label">Balance</label>
            <div className="balance-display">
              <span className="balance-amount">{balance}</span>
              <span className="balance-symbol">sFUEL</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
