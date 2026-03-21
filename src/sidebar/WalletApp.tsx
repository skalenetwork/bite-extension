import { useCallback, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AddKeyModal } from './components/AddKeyModal';
import { AddWalletModal } from './components/AddWalletModal';
import { AuthScreen } from './components/AuthScreen';
import { EnhancedBalanceCard } from './components/EnhancedBalanceCard';
import { OnboardingWizard } from './components/OnboardingWizard';
import { RegisterKeyModal } from './components/RegisterKeyModal';
import { SecureBackupRevealModal } from './components/SecureBackupRevealModal';
import { SecurePassphraseModal } from './components/SecurePassphraseModal';
import { SendTokenCard } from './components/SendTokenCard';
import { SettingsDropdown } from './components/SettingsDropdown';
import { ViewerKeyList } from './components/ViewerKeyList';
import { WalletConnectionCard } from './components/WalletConnectionCard';
import { balanceService } from '../services/balance';
import { BITE_SANDBOX_CONFIG, CONFIDENTIAL_TOKENS } from '../services/bite';
import { createSignerAdapter } from '../services/signer';
import { registrationService } from '../services/registration';
import { walletService } from '../services/wallet';
import { viewerKeyService } from '../services/viewerKey';
import { viewerKeyStorage } from '../storage/viewerKeys';
import type {
  BackupModalState,
  HolderAddressMap,
  LoadingState,
  PassphraseModalState,
  RegistrationStatusMap,
  StoredViewerKey,
  StoredWalletAccount,
  TokenConfig,
  ViewerBalanceMap,
  WalletNetworkInfo,
} from '../types';

const HOLDER_STORAGE_KEY = 'bite-holder-addresses';
const SELECTED_KEY_STORAGE_KEY = 'selected-viewer-key-id';
const SELECTED_WALLET_STORAGE_KEY = 'selected-wallet-id';

function requireAddress(value: string, label: string): void {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${label} must be a valid 0x address.`);
  }
}

function getWalletLabel(account: StoredWalletAccount | null): string | null {
  if (!account) return null;
  if (account.mode === 'smart-account') return 'Smart wallet';
  if (account.mode === 'self-custody') return 'Imported wallet';
  return 'Connected wallet';
}

function WalletContent(): React.ReactElement {
  const { status, lock, startOnboarding, completeOnboarding } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [keys, setKeys] = useState<StoredViewerKey[]>([]);
  const [walletAccounts, setWalletAccounts] = useState<StoredWalletAccount[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [balances, setBalances] = useState<ViewerBalanceMap>({});
  const [holderAddresses, setHolderAddresses] = useState<HolderAddressMap>({});
  const [registeredStatus, setRegisteredStatus] = useState<RegistrationStatusMap>({});
  const [loading, setLoading] = useState<LoadingState>({});
  const [error, setError] = useState<string | null>(null);
  const [isAddKeyModalOpen, setIsAddKeyModalOpen] = useState(false);
  const [isAddWalletModalOpen, setIsAddWalletModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [passphraseModal, setPassphraseModal] = useState<PassphraseModalState | null>(null);
  const [backupModal, setBackupModal] = useState<BackupModalState | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [externalWalletBalance, setExternalWalletBalance] = useState<string | null>(null);
  const [externalWalletNetwork, setExternalWalletNetwork] = useState<WalletNetworkInfo | null>(null);

  const selectedKey = useMemo(
    () => keys.find((key) => key.id === selectedKeyId) || null,
    [keys, selectedKeyId],
  );
  const selectedWallet = useMemo(
    () => walletAccounts.find((account) => account.id === selectedWalletId) || null,
    [walletAccounts, selectedWalletId],
  );
  const hasSelfCustodyWallet = useMemo(
    () => walletAccounts.some((account) => account.mode === 'self-custody'),
    [walletAccounts],
  );
  const selectedExternalWallet = useMemo(
    () => walletAccounts.find((account) => account.mode === 'external' && account.id === selectedWalletId) || null,
    [walletAccounts, selectedWalletId],
  );

  const loadState = useCallback(async (): Promise<void> => {
    try {
      await viewerKeyStorage.init();
      const [storedKeys, storedWallets] = await Promise.all([
        viewerKeyStorage.getAllKeys(),
        viewerKeyStorage.getWalletAccounts(),
      ]);

      setKeys(storedKeys);
      setWalletAccounts(storedWallets);

      const savedKeyId = localStorage.getItem(SELECTED_KEY_STORAGE_KEY);
      const savedWalletId = localStorage.getItem(SELECTED_WALLET_STORAGE_KEY);
      setSelectedKeyId(savedKeyId && storedKeys.some((key) => key.id === savedKeyId) ? savedKeyId : storedKeys[0]?.id || null);
      setSelectedWalletId(savedWalletId && storedWallets.some((account) => account.id === savedWalletId) ? savedWalletId : storedWallets[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load wallet state.');
    }
  }, []);

  const refreshRegistrationStatus = useCallback(async (key: StoredViewerKey | null, holderAddress: string | undefined): Promise<void> => {
    if (!key || !holderAddress) {
      setRegisteredStatus({});
      return;
    }

    const nextStatus: RegistrationStatusMap = {};
    for (const token of Object.values(CONFIDENTIAL_TOKENS)) {
      const encrypted = await balanceService.getEncryptedBalance(token.address, holderAddress);
      nextStatus[token.address] = Boolean(encrypted && encrypted !== '0x');
    }
    setRegisteredStatus(nextStatus);
  }, []);

  const updateExternalWalletState = useCallback(async (account: StoredWalletAccount | null): Promise<void> => {
    if (!account || account.mode !== 'external') {
      setExternalWalletBalance(null);
      setExternalWalletNetwork(null);
      return;
    }

    const [networkInfo, balance] = await Promise.all([
      walletService.reconnectSavedWallet().then((result) => result?.networkInfo || null),
      walletService.getExternalWalletBalance(account.address),
    ]);

    setExternalWalletBalance(balance);
    setExternalWalletNetwork(networkInfo);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(HOLDER_STORAGE_KEY);
    if (!saved) return;
    try {
      setHolderAddresses(JSON.parse(saved) as HolderAddressMap);
    } catch {
      setHolderAddresses({});
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(HOLDER_STORAGE_KEY, JSON.stringify(holderAddresses));
  }, [holderAddresses]);

  useEffect(() => {
    if (status === 'authenticated') {
      void loadState();
    }
  }, [loadState, status]);

  useEffect(() => {
    if (selectedKeyId) localStorage.setItem(SELECTED_KEY_STORAGE_KEY, selectedKeyId);
  }, [selectedKeyId]);

  useEffect(() => {
    if (selectedWalletId) localStorage.setItem(SELECTED_WALLET_STORAGE_KEY, selectedWalletId);
  }, [selectedWalletId]);

  useEffect(() => {
    void updateExternalWalletState(selectedExternalWallet);
  }, [selectedExternalWallet, updateExternalWalletState]);

  useEffect(() => {
    void refreshRegistrationStatus(selectedKey, holderAddresses[selectedKey?.id || '']);
  }, [holderAddresses, refreshRegistrationStatus, selectedKey]);

  const handleAddKey = async ({ label, passphrase }: { label: string; passphrase?: string }): Promise<void> => {
    setLoading((current) => ({ ...current, addKey: true }));
    setError(null);
    try {
      const key = await viewerKeyService.createViewerKey({ label, passphrase });
      setKeys((current) => [...current, key]);
      setSelectedKeyId(key.id);
      setIsAddKeyModalOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create viewer key.');
      throw createError;
    } finally {
      setLoading((current) => ({ ...current, addKey: false }));
    }
  };

  const handleCreateWallet = async (_payload: { passphrase?: string }): Promise<void> => {
    setLoading((current) => ({ ...current, addWallet: true }));
    setError(null);
    try {
      const result = await walletService.createLocalWallet();
      setWalletAccounts((current) => [...current, result.account]);
      setSelectedWalletId(result.account.id);
      setIsAddWalletModalOpen(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create wallet.');
      throw createError;
    } finally {
      setLoading((current) => ({ ...current, addWallet: false }));
    }
  };

  const handleImportWallet = async ({ secret, passphrase }: { secret: string; passphrase?: string }): Promise<void> => {
    setLoading((current) => ({ ...current, addWallet: true }));
    setError(null);
    try {
      const account = await walletService.importLocalWallet({ secret, passphrase });
      setWalletAccounts((current) => [...current, account]);
      setSelectedWalletId(account.id);
      setIsAddWalletModalOpen(false);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import wallet.');
      throw importError;
    } finally {
      setLoading((current) => ({ ...current, addWallet: false }));
    }
  };

  const handleConnectExternalWallet = async (): Promise<void> => {
    setLoading((current) => ({ ...current, addWallet: true }));
    setError(null);
    try {
      const result = await walletService.connectExternalWallet();
      setWalletAccounts((current) => {
        const existing = current.find((account) => account.id === result.account.id);
        if (existing) {
          return current.map((account) => account.id === result.account.id ? result.account : account);
        }
        return [...current, result.account];
      });
      setSelectedWalletId(result.account.id);
      setExternalWalletNetwork(result.networkInfo);
      setExternalWalletBalance(result.balance);
      setIsAddWalletModalOpen(false);
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : 'Failed to connect wallet.');
      throw connectError;
    } finally {
      setLoading((current) => ({ ...current, addWallet: false }));
    }
  };

  const handleDisconnectExternalWallet = async (): Promise<void> => {
    if (!selectedExternalWallet) return;
    setLoading((current) => ({ ...current, disconnectWallet: true }));
    try {
      await walletService.disconnectExternalWallet(selectedExternalWallet.id);
      setWalletAccounts((current) => current.filter((account) => account.id !== selectedExternalWallet.id));
      if (selectedWalletId === selectedExternalWallet.id) {
        setSelectedWalletId(null);
      }
      setExternalWalletBalance(null);
      setExternalWalletNetwork(null);
    } finally {
      setLoading((current) => ({ ...current, disconnectWallet: false }));
    }
  };

  const handleViewBalance = async (token: TokenConfig, holderAddress: string, passphrase?: string): Promise<void> => {
    if (!selectedKey) {
      setError('Select a viewer key first.');
      return;
    }

    try {
      requireAddress(holderAddress.trim(), 'Holder address');
      const balance = await balanceService.getDecryptedBalance(selectedKey.id, token, holderAddress, { passphrase });
      setBalances((current) => ({
        ...current,
        [selectedKey.id]: {
          ...(current[selectedKey.id] || {}),
          [token.address]: balance,
        },
      }));
      await refreshRegistrationStatus(selectedKey, holderAddress);
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : 'Failed to view balance.');
    }
  };

  const handleRegisterKey = async (keyId: string, tokenAddress: string, depositAmount: string): Promise<void> => {
    if (!selectedWallet) {
      setError('Select or create a spending wallet before registering a viewer key.');
      return;
    }

    const key = keys.find((entry) => entry.id === keyId);
    if (!key) {
      setError('Viewer key not found.');
      return;
    }

    setLoading((current) => ({ ...current, register: true }));
    setError(null);

    try {
      const registrationData = await registrationService.prepareViewerKeyRegistration(tokenAddress, key.publicKeyHex, depositAmount);
      const signer = createSignerAdapter(selectedWallet);
      if (!signer) {
        throw new Error('No signer is available for the selected wallet.');
      }

      const request = {
        to: registrationData.payload.to,
        data: registrationData.payload.data as `0x${string}`,
        value: `0x${ethers.parseEther(depositAmount).toString(16)}`,
      };

      const txHash = await signer.sendTransaction(request);
      window.alert(`Registration submitted.\n\n${registrationService.getExplorerUrl(txHash)}`);
      setIsRegisterModalOpen(false);
      await refreshRegistrationStatus(key, selectedWallet.address);
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : 'Failed to register viewer key.');
    } finally {
      setLoading((current) => ({ ...current, register: false }));
    }
  };

  const handleSendToken = async (token: TokenConfig, payload: { recipient: string; amount: string; passphrase?: string }): Promise<void> => {
    if (!selectedWallet) {
      setError('No spending wallet selected.');
      return;
    }

    setLoading((current) => ({ ...current, [`send:${token.address}`]: true }));
    setError(null);

    try {
      const signer = createSignerAdapter(selectedWallet);
      if (!signer) {
        throw new Error('Unable to create signer for the selected wallet.');
      }

      const amount = ethers.parseUnits(payload.amount, token.decimals);
      const request = await signer.prepareSend(token.address, payload.recipient, amount);
      const txHash = await signer.sendTransaction(request, { passphrase: payload.passphrase });
      window.alert(`Transfer sent.\n\n${BITE_SANDBOX_CONFIG.explorerUrl}/tx/${txHash}`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send confidential tokens.');
    } finally {
      setLoading((current) => ({ ...current, [`send:${token.address}`]: false }));
    }
  };

  const handleDeleteWallet = async (accountId: string): Promise<void> => {
    if (!window.confirm('Delete this spending wallet from the extension?')) {
      return;
    }

    await viewerKeyStorage.deleteWalletAccount(accountId);
    walletService.lockWalletAccount(accountId);
    setWalletAccounts((current) => current.filter((account) => account.id !== accountId));
    if (selectedWalletId === accountId) {
      setSelectedWalletId(null);
    }
  };

  const handleExportWallet = async (): Promise<void> => {
    if (!selectedWallet || selectedWallet.mode !== 'self-custody') {
      setError('Only imported wallets have exportable private keys in MyBITE.');
      return;
    }

    setPassphraseModal({
      title: 'Unlock Wallet Export',
      description: 'Enter the imported-wallet passphrase to reveal the private key.',
      confirmLabel: 'Reveal Wallet Key',
      onConfirm: async (passphrase) => {
        const secret = await walletService.exportWalletSecret(selectedWallet.id, passphrase);
        setBackupModal({
          title: 'Wallet Key Export',
          subtitle: 'Store this private key securely before using it elsewhere.',
          items: [{ label: 'Private Key', value: secret }],
          onConfirm: async () => {
            setBackupModal(null);
          },
        });
      },
    });
  };

  const handleClearAllData = async (): Promise<void> => {
    await viewerKeyStorage.clearAll();
    lock();
    setKeys([]);
    setWalletAccounts([]);
    setSelectedKeyId(null);
    setSelectedWalletId(null);
    setBalances({});
    setRegisteredStatus({});
  };

  const formatPublicKey = (publicKey: string): string => `${publicKey.slice(0, 18)}...${publicKey.slice(-10)}`;
  const formatAddress = (publicKey: string): string => {
    if (!publicKey.startsWith('0x04')) {
      return `${publicKey.slice(0, 10)}...${publicKey.slice(-8)}`;
    }
    return ethers.computeAddress(publicKey);
  };

  if (status !== 'authenticated' || showOnboarding) {
    if (showOnboarding || status === 'unauthenticated') {
      return (
        <OnboardingWizard
          onCancel={() => {
            setShowOnboarding(false);
          }}
          onComplete={() => {
            setShowOnboarding(false);
            void completeOnboarding();
          }}
        />
      );
    }

    return <AuthScreen onStartOnboarding={() => {
      startOnboarding();
      setShowOnboarding(true);
    }} />;
  }

  return (
    <div className="wallet-shell">
      <header className="wallet-header">
        <div>
          <h1>MyBITE Wallet</h1>
          <p>Passkey smart wallet + confidential viewer keys</p>
        </div>
        <SettingsDropdown
          isOpen={isSettingsOpen}
          onToggle={setIsSettingsOpen}
          onClearData={() => void handleClearAllData()}
          onLock={lock}
          onExportWallet={() => void handleExportWallet()}
          onChangePassword={null}
          hasSelfCustodyWallet={hasSelfCustodyWallet}
        />
      </header>

      {error ? (
        <div className="error-banner">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>×</button>
        </div>
      ) : null}

      <section className="wallet-section">
        <div className="section-header">
          <h2>Spending Wallets</h2>
          <button className="btn-primary btn-sm" onClick={() => setIsAddWalletModalOpen(true)} type="button">
            Add Wallet
          </button>
        </div>

        <div className="wallet-list">
          {walletAccounts.map((account) => (
            <div key={account.id} className={`key-card ${selectedWalletId === account.id ? 'selected' : ''}`} onClick={() => setSelectedWalletId(account.id)}>
              <div className="key-info">
                <div className="key-header">
                  <span className="key-label">{getWalletLabel(account)}</span>
                  <span className="key-date">{new Date(account.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="key-details">
                  <div className="key-row">
                    <span className="key-name">Address:</span>
                    <code className="key-value">{account.address}</code>
                  </div>
                  <div className="key-row">
                    <span className="key-name">Mode:</span>
                    <span className="key-value">{account.mode}</span>
                  </div>
                </div>
              </div>
              <button className="btn-delete btn-icon" onClick={(event) => {
                event.stopPropagation();
                void handleDeleteWallet(account.id);
              }} type="button">
                ×
              </button>
            </div>
          ))}
        </div>

        <WalletConnectionCard
          account={selectedWallet}
          networkInfo={selectedWallet?.mode === 'external' ? externalWalletNetwork : { chainId: String(BITE_SANDBOX_CONFIG.chainId), isSupported: true, name: 'BITE Sandbox' }}
          balance={selectedWallet?.mode === 'external' ? externalWalletBalance : null}
          onDisconnect={handleDisconnectExternalWallet}
          onSwitchNetwork={async () => {
            await walletService.switchExternalWalletNetwork(BITE_SANDBOX_CONFIG.chainId);
          }}
          targetNetwork={{ chainId: String(BITE_SANDBOX_CONFIG.chainId), name: 'BITE Sandbox' }}
        />
      </section>

      <section className="wallet-section">
        <div className="section-header">
          <h2>Viewer Keys</h2>
          <button className="btn-primary btn-sm" onClick={() => setIsAddKeyModalOpen(true)} type="button">
            Add Viewer Key
          </button>
        </div>

        <ViewerKeyList
          keys={keys}
          selectedKey={selectedKey}
          onSelect={(key) => setSelectedKeyId(key.id)}
          onDelete={(keyId) => {
            void viewerKeyStorage.deleteKey(keyId).then(() => {
              setKeys((current) => current.filter((key) => key.id !== keyId));
              if (selectedKeyId === keyId) setSelectedKeyId(null);
            });
          }}
          formatPublicKey={formatPublicKey}
          formatAddress={formatAddress}
        />

        <div className="section-header">
          <h2>Confidential Tokens</h2>
          <button className="btn-secondary btn-sm" onClick={() => setIsRegisterModalOpen(true)} disabled={!selectedKey || !selectedWallet} type="button">
            Register Viewer Key
          </button>
        </div>

        {selectedKey ? (
          Object.values(CONFIDENTIAL_TOKENS).map((token) => (
            <div key={token.address}>
              <EnhancedBalanceCard
                token={token}
                keyData={selectedKey}
                publicBalance={null}
                privateBalance={balances[selectedKey.id]?.[token.address]?.amount || null}
                isRegistered={Boolean(registeredStatus[token.address])}
                loading={Boolean(loading[`balance:${selectedKey.id}:${token.address}`])}
                holderAddress={holderAddresses[token.address]}
                onHolderAddressChange={(value) => {
                  setHolderAddresses((current) => ({ ...current, [token.address]: value }));
                }}
                onViewBalance={() => handleViewBalance(token, holderAddresses[token.address] || '')}
              />
              <SendTokenCard
                token={token}
                walletAccount={selectedWallet}
                loading={Boolean(loading[`send:${token.address}`])}
                onSend={(payload) => handleSendToken(token, payload)}
              />
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>Select a viewer key to work with confidential balances.</p>
          </div>
        )}
      </section>

      {isAddKeyModalOpen ? (
        <AddKeyModal
          onClose={() => setIsAddKeyModalOpen(false)}
          onSubmit={handleAddKey}
          onAddExisting={async () => {
            throw new Error('Adding an existing viewer key is not available in this build yet.');
          }}
          keyCount={keys.length}
          connectedWalletAddress={selectedWallet?.address}
          isWalletConnected={Boolean(selectedWallet)}
        />
      ) : null}

      {isAddWalletModalOpen ? (
        <AddWalletModal
          onClose={() => setIsAddWalletModalOpen(false)}
          onCreate={handleCreateWallet}
          onImport={handleImportWallet}
          onConnectExternal={handleConnectExternalWallet}
          loading={Boolean(loading.addWallet)}
        />
      ) : null}

      {isRegisterModalOpen && selectedKey ? (
        <RegisterKeyModal
          keyData={selectedKey}
          tokens={Object.values(CONFIDENTIAL_TOKENS)}
          onClose={() => setIsRegisterModalOpen(false)}
          onSubmit={(keyId, tokenAddress, depositAmount) => {
            void handleRegisterKey(keyId, tokenAddress, depositAmount);
          }}
          loading={Boolean(loading.register)}
          walletLabel={getWalletLabel(selectedWallet)}
        />
      ) : null}

      <SecurePassphraseModal
        open={Boolean(passphraseModal)}
        title={passphraseModal?.title}
        description={passphraseModal?.description}
        confirmLabel={passphraseModal?.confirmLabel}
        requireConfirm={passphraseModal?.requireConfirm}
        loading={Boolean(loading.passphrase)}
        onClose={() => setPassphraseModal(null)}
        onConfirm={async (passphrase) => {
          if (!passphraseModal) return;
          setLoading((current) => ({ ...current, passphrase: true }));
          try {
            await passphraseModal.onConfirm(passphrase);
            setPassphraseModal(null);
          } finally {
            setLoading((current) => ({ ...current, passphrase: false }));
          }
        }}
      />

      <SecureBackupRevealModal
        open={Boolean(backupModal)}
        title={backupModal?.title}
        subtitle={backupModal?.subtitle}
        items={backupModal?.items || []}
        loading={Boolean(loading.backup)}
        onClose={() => setBackupModal(null)}
        onConfirm={async () => {
          if (!backupModal) return;
          setLoading((current) => ({ ...current, backup: true }));
          try {
            await backupModal.onConfirm();
          } finally {
            setLoading((current) => ({ ...current, backup: false }));
          }
        }}
      />
    </div>
  );
}

export function WalletApp(): React.ReactElement {
  return (
    <AuthProvider>
      <WalletContent />
    </AuthProvider>
  );
}

export default WalletApp;
