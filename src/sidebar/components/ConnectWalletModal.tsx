import { useEffect, useState } from 'react';
import { injectedWalletService } from '../../services/injectedWallet';
import type { WalletNetworkInfo } from '../../types';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (payload: { address: string; chainId?: string | null; provider: string }) => Promise<void>;
  targetNetwork: { chainId: string; name: string } | null;
}

type ConnectStep = 'detect' | 'connecting' | 'select' | 'confirm';

export function ConnectWalletModal({
  isOpen,
  onClose,
  onConnect,
  targetNetwork,
}: ConnectWalletModalProps): React.ReactElement | null {
  const [step, setStep] = useState<ConnectStep>('detect');
  const [walletDetected, setWalletDetected] = useState(false);
  const [providerType, setProviderType] = useState('none');
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [currentNetwork, setCurrentNetwork] = useState<WalletNetworkInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setWalletDetected(injectedWalletService.isAnyWalletInstalled());
    setProviderType(injectedWalletService.getProviderType());
    setStep('detect');
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const providerName = providerType === 'metamask'
    ? 'MetaMask'
    : providerType === 'coinbase'
      ? 'Coinbase Wallet'
      : providerType === 'trust'
        ? 'Trust Wallet'
        : 'Wallet';

  const providerIcon = providerType === 'metamask'
    ? '🦊'
    : providerType === 'coinbase'
      ? '📘'
      : providerType === 'trust'
        ? '🔵'
        : '🔐';

  const completeConnection = async (address: string): Promise<void> => {
    await onConnect({
      address,
      chainId: targetNetwork?.chainId || currentNetwork?.chainId,
      provider: providerType,
    });
    onClose();
  };

  const handleConnect = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setStep('connecting');

    try {
      const result = await injectedWalletService.connect();
      if (!result.success || !result.accounts?.length) {
        throw new Error(result.error || 'Failed to connect wallet');
      }

      setAvailableAccounts(result.accounts);
      setSelectedAccount(result.accounts[0] || null);
      setCurrentNetwork(result.networkInfo || null);

      if (result.accounts.length > 1) {
        setStep('select');
      } else if (result.networkInfo && targetNetwork && result.networkInfo.chainId !== targetNetwork.chainId) {
        setStep('confirm');
      } else {
        await completeConnection(result.accounts[0]);
      }
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Failed to connect wallet');
      setStep('detect');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchNetwork = async (): Promise<void> => {
    if (!targetNetwork) return;

    setLoading(true);
    setError(null);

    try {
      const success = await injectedWalletService.switchNetwork(Number(targetNetwork.chainId));
      if (!success) {
        throw new Error('Failed to switch network. Please switch manually in your wallet.');
      }
      const networkInfo = await injectedWalletService.getNetworkInfo();
      setCurrentNetwork(networkInfo);
      await completeConnection(selectedAccount || availableAccounts[0]!);
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : 'Failed to switch network');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Connect Wallet</h3>
          <button className="modal-close" onClick={onClose} type="button">×</button>
        </div>

        <div className="modal-body">
          {step === 'detect' ? (
            !walletDetected ? (
              <div className="info-box info-box-warning">
                <p><strong>No Wallet Detected</strong></p>
                <p>We couldn&apos;t find an injected wallet like MetaMask in your browser.</p>
              </div>
            ) : (
              <div className="wallet-provider-card">
                <div className="provider-icon">{providerIcon}</div>
                <div className="provider-info">
                  <span className="provider-name">{providerName}</span>
                  <span className="provider-status">Detected</span>
                </div>
              </div>
            )
          ) : null}

          {step === 'connecting' ? (
            <div className="connecting-state">
              <span className="spinner-large">⟳</span>
              <p>Connecting to {providerName}...</p>
            </div>
          ) : null}

          {step === 'select' ? (
            <div className="account-selection">
              <p className="section-title">Select Account</p>
              <div className="account-list">
                {availableAccounts.map((address) => (
                  <label key={address} className={`account-option ${selectedAccount === address ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="account"
                      value={address}
                      checked={selectedAccount === address}
                      onChange={(event) => setSelectedAccount(event.target.value)}
                    />
                    <span className="account-address">{address.slice(0, 6)}...{address.slice(-4)}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {step === 'confirm' ? (
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
            </div>
          ) : null}

          {error ? (
            <div className="error-message modal-inline-error">
              <strong>Error:</strong> {error}
            </div>
          ) : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>

          {step === 'detect' && walletDetected ? (
            <button type="button" className="btn-primary" onClick={() => void handleConnect()} disabled={loading}>
              {loading ? 'Connecting...' : `Connect ${providerName}`}
            </button>
          ) : null}

          {step === 'select' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                if (!selectedAccount) return;
                if (currentNetwork && targetNetwork && currentNetwork.chainId !== targetNetwork.chainId) {
                  setStep('confirm');
                  return;
                }
                void completeConnection(selectedAccount);
              }}
              disabled={loading || !selectedAccount}
            >
              Continue
            </button>
          ) : null}

          {step === 'confirm' ? (
            <button type="button" className="btn-primary" onClick={() => void handleSwitchNetwork()} disabled={loading}>
              {loading ? 'Switching...' : 'Switch Network'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
