import React, { useState, useEffect } from 'react';
import { injectedWalletService } from '../../services/injectedWallet';

/**
 * ConnectWalletModal - Modal for connecting external wallets
 * @param {Object} props
 * @param {boolean} props.isOpen - boolean
 * @param {Function} props.onClose - callback
 * @param {Function} props.onConnect - callback returns account
 * @param {Object} props.targetNetwork - { chainId, name }
 */
export function ConnectWalletModal({
  isOpen,
  onClose,
  onConnect,
  targetNetwork,
}) {
  const [step, setStep] = useState('detect'); // 'detect', 'connecting', 'select', 'confirm', 'connected'
  const [walletDetected, setWalletDetected] = useState(false);
  const [providerType, setProviderType] = useState('none');
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [currentNetwork, setCurrentNetwork] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      console.log('[ConnectWalletModal] Modal opened, checking wallet detection...');
      checkWalletDetection();
    }
  }, [isOpen]);

  const checkWalletDetection = () => {
    console.log('[ConnectWalletModal] Checking wallet detection...');
    const detected = injectedWalletService.isAnyWalletInstalled();
    const type = injectedWalletService.getProviderType();
    console.log('[ConnectWalletModal] Detection result:', { detected, type });
    setWalletDetected(detected);
    setProviderType(type);
    setStep(detected ? 'detect' : 'detect');
    setError(null);
  };

  const getProviderName = () => {
    switch (providerType) {
      case 'metamask':
        return 'MetaMask';
      case 'coinbase':
        return 'Coinbase Wallet';
      case 'trust':
        return 'Trust Wallet';
      case 'unknown':
        return 'Web3 Wallet';
      default:
        return 'Wallet';
    }
  };

  const getProviderIcon = () => {
    switch (providerType) {
      case 'metamask':
        return '🦊';
      case 'coinbase':
        return '📘';
      case 'trust':
        return '🔵';
      default:
        return '🔐';
    }
  };

  const handleConnect = async () => {
    console.log('[ConnectWalletModal] Starting wallet connection...');
    setLoading(true);
    setError(null);
    setStep('connecting');

    try {
      console.log('[ConnectWalletModal] Calling injectedWalletService.connect()...');
      const result = await injectedWalletService.connect();
      console.log('[ConnectWalletModal] Connection result:', result);

      if (result.success) {
        setAvailableAccounts(result.accounts || []);
        setSelectedAccount(result.accounts?.[0] || null);
        setCurrentNetwork(result.networkInfo);

        // Check if we need account selection step
        if (result.accounts && result.accounts.length > 1) {
          setStep('select');
        } else if (result.networkInfo && targetNetwork && 
                   result.networkInfo.chainId !== targetNetwork.chainId) {
          setStep('confirm');
        } else {
          // All good, connect immediately
          await onConnect({
            address: result.accounts[0],
            chainId: result.networkInfo?.chainId,
            provider: providerType,
          });
          onClose();
        }
      } else {
        // User rejection or other error
        console.error('[ConnectWalletModal] Connection failed:', result.error);
        if (result.error?.includes('rejected') || result.error?.includes('denied')) {
          setError('Connection rejected. Please approve the connection in your wallet.');
        } else {
          setError(result.error || 'Failed to connect wallet');
        }
        setStep('detect');
      }
    } catch (err) {
      console.error('[ConnectWalletModal] Connection exception:', err);
      if (err.message?.includes('rejected') || err.message?.includes('denied')) {
        setError('Connection rejected by user.');
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
      setStep('detect');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSelect = async () => {
    if (!selectedAccount) return;

    // Check network after account selection
    if (currentNetwork && targetNetwork && 
        currentNetwork.chainId !== targetNetwork.chainId) {
      setStep('confirm');
    } else {
      await completeConnection(selectedAccount);
    }
  };

  const handleSwitchNetwork = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[ConnectWalletModal] Switching network to:', targetNetwork?.chainId);
      const success = await injectedWalletService.switchNetwork(targetNetwork.chainId);
      console.log('[ConnectWalletModal] Network switch result:', success);
      if (success) {
        const newNetworkInfo = await injectedWalletService.getNetworkInfo();
        setCurrentNetwork(newNetworkInfo);
        await completeConnection(selectedAccount || availableAccounts[0]);
      } else {
        setError('Failed to switch network. Please switch manually in your wallet.');
      }
    } catch (err) {
      console.error('[ConnectWalletModal] Network switch error:', err);
      setError(err.message || 'Failed to switch network');
    } finally {
      setLoading(false);
    }
  };

  const completeConnection = async (address) => {
    await onConnect({
      address,
      chainId: targetNetwork?.chainId || currentNetwork?.chainId,
      provider: providerType,
    });
    onClose();
  };

  const handleClose = () => {
    setStep('detect');
    setError(null);
    setLoading(false);
    onClose();
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Connect Wallet</h3>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Progress Steps */}
          <div className="connection-steps">
            {['detect', 'connecting', 'select', 'confirm'].map((s, i) => (
              <div
                key={s}
                className={`step ${step === s ? 'active' : ''} ${
                  ['detect', 'connecting', 'select', 'confirm'].indexOf(step) > i ? 'completed' : ''
                }`}
              >
                <span className="step-number">{i + 1}</span>
                <span className="step-label">
                  {s === 'detect' && 'Detect'}
                  {s === 'connecting' && 'Connect'}
                  {s === 'select' && 'Select'}
                  {s === 'confirm' && 'Network'}
                </span>
              </div>
            ))}
          </div>

          {/* Step 1: Detect Wallets */}
          {step === 'detect' && (
            <>
              {!walletDetected ? (
                <div className="info-box info-box-warning">
                  <p><strong>No Wallet Detected</strong></p>
                  <p style={{ marginBottom: '12px' }}>
                    We couldn't find an injected wallet like MetaMask in your browser.
                  </p>
                  <a
                    href="https://metamask.io/download/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                  >
                    Install MetaMask
                  </a>
                </div>
              ) : (
                <div className="wallet-provider-card">
                  <div className="provider-icon">{getProviderIcon()}</div>
                  <div className="provider-info">
                    <span className="provider-name">{getProviderName()}</span>
                    <span className="provider-status">Detected</span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step 2: Connecting */}
          {step === 'connecting' && (
            <div className="connecting-state">
              <span className="spinner-large">⟳</span>
              <p>Connecting to {getProviderName()}...</p>
              <p className="hint">Please approve the connection in your wallet</p>
            </div>
          )}

          {/* Step 3: Select Account */}
          {step === 'select' && (
            <div className="account-selection">
              <p className="section-title">Select Account</p>
              <div className="account-list">
                {availableAccounts.map((addr) => (
                  <label
                    key={addr}
                    className={`account-option ${selectedAccount === addr ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="account"
                      value={addr}
                      checked={selectedAccount === addr}
                      onChange={(e) => setSelectedAccount(e.target.value)}
                    />
                    <span className="account-address">{formatAddress(addr)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Confirm Network */}
          {step === 'confirm' && (
            <div className="network-confirmation">
              <p className="section-title">Confirm Network</p>
              <div className="network-comparison">
                <div className="network-current">
                  <span className="network-label">Current</span>
                  <span className="network-value">{currentNetwork?.name || 'Unknown'}</span>
                </div>
                <span className="network-arrow">→</span>
                <div className="network-target">
                  <span className="network-label">Required</span>
                  <span className="network-value">{targetNetwork?.name || 'Unknown'}</span>
                </div>
              </div>
              <p className="network-hint">
                Please switch to the required network to continue.
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-message modal-inline-error">
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </button>

          {step === 'detect' && walletDetected && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleConnect}
              disabled={loading || !walletDetected}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ marginRight: '8px' }}>⟳</span>
                  Connecting...
                </>
              ) : (
                `Connect ${getProviderName()}`
              )}
            </button>
          )}

          {step === 'select' && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleAccountSelect}
              disabled={loading || !selectedAccount}
            >
              Continue
            </button>
          )}

          {step === 'confirm' && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSwitchNetwork}
              disabled={loading}
            >
              {loading ? 'Switching...' : 'Switch Network'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
