import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { OnboardingWizard } from './components/OnboardingWizard';
import { WalletConnectionCard } from './components/WalletConnectionCard';
import { balanceService } from '../services/balance';
import { BITE_SANDBOX_CONFIG, CONFIDENTIAL_TOKENS } from '../services/bite';
import { injectedWalletService } from '../services/injectedWallet';
import { PasskeyService } from '../services/passkey';
import { registrationService } from '../services/registration';
import { runtimeSession } from '../services/runtimeSession';
import { createSignerAdapter } from '../services/signer';
import { viewerKeyService } from '../services/viewerKey';
import { walletService } from '../services/wallet';
import { viewerKeyStorage } from '../storage/viewerKeys';
import { AddKeyModal } from './components/AddKeyModal';
import { AddWalletModal } from './components/AddWalletModal';
import { EnhancedBalanceCard } from './components/EnhancedBalanceCard';
import { RegisterKeyModal } from './components/RegisterKeyModal';
import { SecureBackupRevealModal } from './components/SecureBackupRevealModal';
import { SecurePassphraseModal } from './components/SecurePassphraseModal';
import { SettingsDropdown } from './components/SettingsDropdown';
import { ViewerKeyList } from './components/ViewerKeyList';

const HOLDER_STORAGE_KEY = 'bite-holder-addresses';
const SELECTED_KEY_STORAGE_KEY = 'selected-viewer-key-id';
const SELECTED_WALLET_STORAGE_KEY = 'selected-wallet-id';

function getInjectedEthereum() {
  return window.ethereum;
}

function requireAddress(value, label) {
  if (!value || !ethers.isAddress(value)) {
    throw new Error(`${label} must be a valid 0x address.`);
  }
}

function getWalletLabel(account) {
  if (!account) return null;
  return account.mode === 'self-custody' ? 'Self-custody wallet' : 'Connected wallet';
}

function WalletContent() {
  const { status, lock, completeOnboarding } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [keys, setKeys] = useState([]);
  const [walletAccounts, setWalletAccounts] = useState([]);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [selectedWalletId, setSelectedWalletId] = useState(null);
  const [balances, setBalances] = useState({});
  const [holderAddresses, setHolderAddresses] = useState({});
  const [registeredStatus, setRegisteredStatus] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);
  const [webAuthnAvailable, setWebAuthnAvailable] = useState(false);
  const [isSidebarEmbedded, setIsSidebarEmbedded] = useState(false);
  const [isAddKeyModalOpen, setIsAddKeyModalOpen] = useState(false);
  const [isAddWalletModalOpen, setIsAddWalletModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [passphraseModal, setPassphraseModal] = useState(null);
  const [backupModal, setBackupModal] = useState(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // External wallet state
  const [externalWalletInfo, setExternalWalletInfo] = useState(null);
  const [externalWalletBalance, setExternalWalletBalance] = useState(null);
  const [externalWalletNetwork, setExternalWalletNetwork] = useState(null);

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
    () => walletAccounts.find((account) => account.mode === 'external' && account.id === selectedWalletId),
    [walletAccounts, selectedWalletId],
  );

  // External wallet event handlers
  const updateExternalWalletState = useCallback(async (account) => {
    if (!account || account.mode !== 'external') {
      setExternalWalletInfo(null);
      setExternalWalletBalance(null);
      setExternalWalletNetwork(null);
      return;
    }

    try {
      const [networkInfo, balance] = await Promise.all([
        injectedWalletService.getNetworkInfo(),
        injectedWalletService.getBalance(account.address),
      ]);
      
      setExternalWalletNetwork(networkInfo);
      setExternalWalletBalance(balance);
      setExternalWalletInfo(injectedWalletService.getSavedWalletInfo());
    } catch (err) {
      console.error('Failed to update external wallet state:', err);
    }
  }, []);

  // Define handleDisconnectExternalWallet before useEffect that depends on it
  const handleDisconnectExternalWallet = useCallback(async (accountId) => {
    if (!window.confirm('Disconnect this external wallet?')) {
      return;
    }

    setLoading((current) => ({ ...current, disconnectWallet: true }));
    
    try {
      await walletService.disconnectExternalWallet(accountId);
      setWalletAccounts((current) => current.filter((account) => account.id !== accountId));
      if (selectedWalletId === accountId) {
        setSelectedWalletId(null);
      }
      setExternalWalletInfo(null);
      setExternalWalletBalance(null);
      setExternalWalletNetwork(null);
    } catch (disconnectError) {
      setError(disconnectError.message || 'Failed to disconnect wallet.');
    } finally {
      setLoading((current) => ({ ...current, disconnectWallet: false }));
    }
  }, [selectedWalletId]);

  // Auto-reconnect external wallet on startup
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function attemptReconnect() {
      try {
        const result = await walletService.reconnectSavedWallet();
        if (result) {
          // Check if account already exists in list
          setWalletAccounts((current) => {
            const exists = current.some((acc) => acc.id === result.account.id);
            if (exists) {
              return current.map((acc) =>
                acc.id === result.account.id ? result.account : acc
              );
            }
            return [...current, result.account];
          });
          
          if (result.networkInfo) {
            setExternalWalletNetwork(result.networkInfo);
          }
          if (result.balance) {
            setExternalWalletBalance(result.balance);
          }
        }
      } catch (err) {
        console.error('Auto-reconnect failed:', err);
      }
    }

    void attemptReconnect();
  }, [status]);

  // Listen for external wallet events
  useEffect(() => {
    if (status !== 'authenticated') return;

    const cleanup = walletService.setupExternalWalletEventListeners(
      (event) => {
        // Handle account changes
        if (!event.isConnected) {
          // Wallet disconnected externally
          const externalAccount = walletAccounts.find((acc) => acc.mode === 'external');
          if (externalAccount) {
            void handleDisconnectExternalWallet(externalAccount.id);
          }
        } else if (event.accounts.length > 0) {
          // Account switched - update state
          const newAddress = event.accounts[0];
          setWalletAccounts((current) =>
            current.map((acc) =>
              acc.mode === 'external' ? { ...acc, address: newAddress } : acc
            )
          );
          // Refresh balance for new address
          void injectedWalletService.getBalance(newAddress).then(setExternalWalletBalance);
        }
      },
      (chainId) => {
        // Handle chain changes
        void injectedWalletService.getNetworkInfo().then(setExternalWalletNetwork);
      }
    );

    return cleanup;
  }, [status, walletAccounts, handleDisconnectExternalWallet]);

  // Update external wallet state when selected external wallet changes
  useEffect(() => {
    if (selectedExternalWallet) {
      void updateExternalWalletState(selectedExternalWallet);
    }
  }, [selectedExternalWallet, updateExternalWalletState]);

  useEffect(() => {
    setWebAuthnAvailable(PasskeyService.isAvailable());
    const embedded = new URLSearchParams(window.location.search).get('embedded') === 'true';
    setIsSidebarEmbedded(embedded);
    document.body.classList.toggle('wallet-embedded', embedded);
    return () => document.body.classList.remove('wallet-embedded');
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(HOLDER_STORAGE_KEY);
    if (!saved) return;

    try {
      setHolderAddresses(JSON.parse(saved));
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
  }, [status]);

  useEffect(() => {
    if (selectedKeyId) {
      localStorage.setItem(SELECTED_KEY_STORAGE_KEY, selectedKeyId);
    }
  }, [selectedKeyId]);

  useEffect(() => {
    if (selectedWalletId) {
      localStorage.setItem(SELECTED_WALLET_STORAGE_KEY, selectedWalletId);
    }
  }, [selectedWalletId]);

  async function loadState() {
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
      setSelectedWalletId(
        savedWalletId && storedWallets.some((account) => account.id === savedWalletId)
          ? savedWalletId
          : storedWallets[0]?.id || null,
      );
    } catch (loadError) {
      setError(loadError.message || 'Failed to load wallet state.');
    }
  }

  async function refreshRegistrationStatus(key, holderAddress) {
    if (!key || !holderAddress) {
      setRegisteredStatus({});
      return;
    }

    const nextStatus = {};
    for (const token of Object.values(CONFIDENTIAL_TOKENS)) {
      const encrypted = await balanceService.getEncryptedBalance(token.address, holderAddress);
      nextStatus[token.address] = Boolean(encrypted && encrypted !== '0x');
    }
    setRegisteredStatus(nextStatus);
  }

  async function handleAddKey({ label, passphrase }) {
    setLoading((current) => ({ ...current, addKey: true }));
    setError(null);

    try {
      const key = await viewerKeyService.createViewerKey({ label, passphrase });
      setKeys((current) => [...current, key]);
      setSelectedKeyId(key.id);
      setIsAddKeyModalOpen(false);
    } catch (createError) {
      setError(createError.message || 'Failed to create viewer key.');
      throw createError;
    } finally {
      setLoading((current) => ({ ...current, addKey: false }));
    }
  }

  async function handleDeleteKey(keyId) {
    if (!window.confirm('Delete this viewer key? This does not unregister it on-chain.')) {
      return;
    }

    await viewerKeyStorage.deleteKey(keyId);
    viewerKeyService.lockViewerKey(keyId);
    setKeys((current) => current.filter((key) => key.id !== keyId));
    if (selectedKeyId === keyId) {
      setSelectedKeyId(null);
    }
  }

  async function handleCreateWallet({ passphrase }) {
    setLoading((current) => ({ ...current, addWallet: true }));
    setError(null);

    try {
      const result = await walletService.createLocalWallet({ passphrase });
      setWalletAccounts((current) => [...current, result.account]);
      setSelectedWalletId(result.account.id);
      setIsAddWalletModalOpen(false);
      setBackupModal({
        title: 'Back Up Self-Custody Wallet',
        subtitle: 'Store this backup outside the browser before you send any confidential funds.',
        items: [
          ...(result.recoveryPhrase
            ? [{ label: 'Recovery Phrase', value: result.recoveryPhrase, description: 'Preferred recovery material.' }]
            : []),
          { label: 'Private Key', value: result.privateKey, description: 'Equivalent raw backup. Keep it offline.' },
        ],
        onConfirm: async () => {
          await walletService.confirmBackup(result.account.id);
          setWalletAccounts((current) =>
            current.map((account) =>
              account.id === result.account.id ? { ...account, backupConfirmedAt: Date.now() } : account,
            ),
          );
          setBackupModal(null);
        },
      });
    } catch (createError) {
      setError(createError.message || 'Failed to create self-custody wallet.');
      throw createError;
    } finally {
      setLoading((current) => ({ ...current, addWallet: false }));
    }
  }

  async function handleImportWallet({ secret, passphrase }) {
    setLoading((current) => ({ ...current, addWallet: true }));
    setError(null);

    try {
      const account = await walletService.importLocalWallet({ secret, passphrase });
      setWalletAccounts((current) => [...current, account]);
      setSelectedWalletId(account.id);
      setIsAddWalletModalOpen(false);
    } catch (importError) {
      setError(importError.message || 'Failed to import wallet.');
      throw importError;
    } finally {
      setLoading((current) => ({ ...current, addWallet: false }));
    }
  }

  async function handleConnectExternalWallet() {
    console.log('[WalletApp] Starting external wallet connection...');
    setLoading((current) => ({ ...current, addWallet: true }));
    setError(null);

    try {
      console.log('[WalletApp] Calling walletService.connectExternalWallet()...');
      const result = await walletService.connectExternalWallet();
      console.log('[WalletApp] External wallet connection result:', result);
      
      setWalletAccounts((current) => {
        const exists = current.some((acc) => acc.id === result.account.id);
        if (exists) {
          return current.map((acc) =>
            acc.id === result.account.id ? result.account : acc
          );
        }
        return [...current, result.account];
      });
      
      setSelectedWalletId(result.account.id);
      setExternalWalletNetwork(result.networkInfo);
      setExternalWalletBalance(result.balance);
      setExternalWalletInfo(injectedWalletService.getSavedWalletInfo());
      setIsAddWalletModalOpen(false);
      console.log('[WalletApp] External wallet connection complete');
    } catch (connectError) {
      console.error('[WalletApp] External wallet connection failed:', connectError);
      setError(connectError.message || 'Failed to connect external wallet.');
      throw connectError;
    } finally {
      setLoading((current) => ({ ...current, addWallet: false }));
    }
  }

  async function handleSwitchExternalNetwork() {
    console.log('[WalletApp] Switching external wallet network to BITE Sandbox...');
    try {
      const switched = await walletService.switchExternalWalletNetwork(BITE_SANDBOX_CONFIG.chainId);
      console.log('[WalletApp] Network switch result:', switched);
      if (switched) {
        const networkInfo = await injectedWalletService.getNetworkInfo();
        setExternalWalletNetwork(networkInfo);
        console.log('[WalletApp] Network info updated:', networkInfo);
      } else {
        setError('Failed to switch network. Please switch manually in your wallet.');
      }
    } catch (err) {
      console.error('[WalletApp] Network switch error:', err);
      setError(err.message || 'Failed to switch network.');
    }
  }

  async function decryptBalanceForKey(key, token, holderAddress, passphrase) {
    const decryptedBalance = await balanceService.getDecryptedBalance(
      key.id,
      token,
      holderAddress,
      { passphrase },
    );

    setBalances((current) => ({
      ...current,
      [key.id]: {
        ...(current[key.id] || {}),
        [token.address]: decryptedBalance,
      },
    }));
  }

  async function handleViewBalance(key, token, holderAddress) {
    setLoading((current) => ({ ...current, [`balance:${key.id}:${token.address}`]: true }));
    setError(null);

    try {
      requireAddress(holderAddress.trim(), 'Holder address');

      if (key.wrapMethod === 'passphrase' && !balanceService.hasValidSession(key.id)) {
        setPassphraseModal({
          title: `Unlock ${key.label}`,
          description: 'Enter the fallback passphrase to decrypt this viewer key for the balance request.',
          confirmLabel: 'Unlock Balance',
          onConfirm: async (passphrase) => {
            await decryptBalanceForKey(key, token, holderAddress.trim(), passphrase);
            setPassphraseModal(null);
          },
        });
        return;
      }

      await decryptBalanceForKey(key, token, holderAddress.trim());
    } catch (viewError) {
      setError(viewError.message || 'Failed to decrypt balance.');
    } finally {
      setLoading((current) => ({ ...current, [`balance:${key.id}:${token.address}`]: false }));
    }
  }

  async function registerViewerKey({ key, tokenAddress, depositAmount, passphrase }) {
    if (!depositAmount || Number(depositAmount) < 0) {
      throw new Error('Deposit amount must be zero or greater.');
    }

    const registrationData = await registrationService.prepareViewerKeyRegistration(
      tokenAddress,
      key.publicKeyHex,
      depositAmount,
    );
    const txRequest = registrationService.buildTransactionRequest(registrationData, selectedWallet.address);
    const signer = createSignerAdapter(selectedWallet);

    if (!signer) {
      throw new Error('No signer is available for the selected wallet.');
    }

    const txHash = await signer.sendTransaction(txRequest, { passphrase });
    window.alert(`Registration submitted.\n\n${registrationService.getExplorerUrl(txHash)}`);
    setIsRegisterModalOpen(false);
  }

  async function handleRegisterKey(keyId, tokenAddress, depositAmount) {
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
      if (selectedWallet.mode === 'self-custody' && selectedWallet.wrapMethod === 'passphrase' && !walletService.hasUnlockedWallet(selectedWallet.id)) {
        setPassphraseModal({
          title: 'Unlock Spending Wallet',
          description: 'Enter the wallet passphrase to sign the viewer-key registration transaction.',
          confirmLabel: 'Sign Registration',
          onConfirm: async (passphrase) => {
            await registerViewerKey({ key, tokenAddress, depositAmount, passphrase });
            setPassphraseModal(null);
          },
        });
        return;
      }

      await registerViewerKey({ key, tokenAddress, depositAmount });
    } catch (registerError) {
      setError(registerError.message || 'Failed to register viewer key.');
    } finally {
      setLoading((current) => ({ ...current, register: false }));
    }
  }

  async function handleSendToken(token, payload) {
    if (!selectedWallet) {
      setError('No spending wallet selected.');
      return;
    }

    if (selectedWallet.mode === 'self-custody' && !selectedWallet.backupConfirmedAt) {
      setError('Back up the self-custody wallet before sending funds.');
      return;
    }

    setLoading((current) => ({ ...current, [`send:${token.address}`]: true }));
    setError(null);

    try {
      requireAddress(payload.recipient, 'Recipient');
      if (!payload.amount || Number(payload.amount) <= 0) {
        throw new Error('Amount must be greater than zero.');
      }

      const signer = createSignerAdapter(selectedWallet);
      if (!signer) {
        throw new Error('Unable to create signer for the selected wallet.');
      }

      const amount = ethers.parseUnits(payload.amount, token.decimals);
      const request = await signer.prepareSend(token.address, payload.recipient, amount);
      const txHash = await signer.sendTransaction(request, { passphrase: payload.passphrase });
      window.alert(`Transfer sent.\n\n${BITE_SANDBOX_CONFIG.explorerUrl}/tx/${txHash}`);
    } catch (sendError) {
      setError(sendError.message || 'Failed to send confidential tokens.');
    } finally {
      setLoading((current) => ({ ...current, [`send:${token.address}`]: false }));
    }
  }

  async function handleDeleteWallet(accountId) {
    if (!window.confirm('Delete this spending wallet from the extension?')) {
      return;
    }

    try {
      await viewerKeyStorage.deleteWalletAccount(accountId);
      walletService.lockWalletAccount(accountId);
      setWalletAccounts((current) => current.filter((account) => account.id !== accountId));
      if (selectedWalletId === accountId) {
        setSelectedWalletId(null);
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete wallet.');
    }
  }

  async function revealWalletBackup(accountId, passphrase) {
    const account = walletAccounts.find((entry) => entry.id === accountId) || null;
    if (!account) {
      throw new Error('Wallet account not found.');
    }

    const secret = await walletService.exportWalletSecret(accountId, passphrase);
    setBackupModal({
      title: 'Export Wallet Backup',
      subtitle: 'Reveal this private key only when you are ready to store it in a secure offline location.',
      items: [
        { label: 'Private Key', value: secret, description: 'Use this to recover the self-custody wallet elsewhere.' },
      ],
      onConfirm: async () => {
        await walletService.confirmBackup(accountId);
        setWalletAccounts((current) =>
          current.map((entry) =>
            entry.id === accountId ? { ...entry, backupConfirmedAt: Date.now() } : entry,
          ),
        );
        setBackupModal(null);
      },
    });
  }

  async function handleConfirmBackup(accountId) {
    try {
      const targetAccountId = accountId || selectedWalletId;
      const account = walletAccounts.find((entry) => entry.id === targetAccountId) || null;
      if (!account) {
        throw new Error('Wallet account not found.');
      }

      if (account.mode !== 'self-custody') {
        setError('External wallets do not have recovery phrases stored in MyBITE.');
        return;
      }

      if (account.wrapMethod === 'passphrase' && !walletService.hasUnlockedWallet(account.id)) {
        setPassphraseModal({
          title: 'Unlock Wallet Backup',
          description: 'Enter the wallet passphrase before revealing the backup secret.',
          confirmLabel: 'Reveal Backup',
          onConfirm: async (passphrase) => {
            await revealWalletBackup(targetAccountId, passphrase);
            setPassphraseModal(null);
          },
        });
        return;
      }

      await revealWalletBackup(targetAccountId);
    } catch (confirmError) {
      setError(confirmError.message || 'Failed to confirm wallet backup.');
    }
  }

  function handleLockAll() {
    runtimeSession.clearAll();
    setBalances({});
    setPassphraseModal(null);
    setBackupModal(null);
    lock();
  }

  function handleClearAllData() {
    localStorage.clear();
    runtimeSession.clearAll();
    setKeys([]);
    setWalletAccounts([]);
    setSelectedKeyId(null);
    setSelectedWalletId(null);
    setBalances({});
    setHolderAddresses({});
    window.location.reload();
  }

  function formatPublicKey(key) {
    return `${key.slice(0, 20)}...${key.slice(-8)}`;
  }

  function formatAddress(publicKey) {
    try {
      return ethers.computeAddress(publicKey);
    } catch {
      return 'Unable to compute';
    }
  }

  if (status === 'loading') {
    return (
      <div className="auth-screen">
        <div className="auth-loading">
          <span className="loading-spinner">◌</span>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || status === 'locked') {
    if (showOnboarding) {
      return (
        <div className="wallet-app">
          <OnboardingWizard
            onComplete={() => {
              setShowOnboarding(false);
              void completeOnboarding();
            }}
            onCancel={() => setShowOnboarding(false)}
          />
        </div>
      );
    }

    return <AuthScreen onStartOnboarding={() => setShowOnboarding(true)} />;
  }

  return (
    <div className={`wallet-app ${isSidebarEmbedded ? 'embedded' : ''}`}>
      <header className="wallet-header">
        <div className="wallet-title">
          <span className="wallet-icon">🔐</span>
          <h1>MyBITE Wallet</h1>
        </div>
        <div className="wallet-network">
          <span className="network-indicator"></span>
          <span>BITE Sandbox</span>
        </div>
        <SettingsDropdown
          isOpen={isSettingsOpen}
          onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
          onClose={() => setIsSettingsOpen(false)}
          onClearAll={handleClearAllData}
          onLock={handleLockAll}
          onViewRecovery={handleConfirmBackup}
          hasExternalWallet={Boolean(selectedExternalWallet)}
        />
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <main className="wallet-main">
        {/* External Wallet Connection Card */}
        {selectedExternalWallet && (
          <WalletConnectionCard
            account={selectedExternalWallet}
            networkInfo={externalWalletNetwork}
            balance={externalWalletBalance}
            onDisconnect={() => handleDisconnectExternalWallet(selectedExternalWallet.id)}
            onSwitchNetwork={handleSwitchExternalNetwork}
            targetNetwork={{
              chainId: `0x${BITE_SANDBOX_CONFIG.chainId.toString(16)}`,
              name: BITE_SANDBOX_CONFIG.chainName,
            }}
          />
        )}

        <section className="keys-section">
          <div className="section-header">
            <h2>Spending Wallets</h2>
            <div>
              <button className="btn-secondary" onClick={() => setIsAddWalletModalOpen(true)}>
                + Spending Wallet
              </button>
            </div>
          </div>

          {walletAccounts.length === 0 ? (
            <div className="empty-state">
              <p>No spending wallets yet.</p>
              <p className="hint">Create a self-custody wallet or connect an injected wallet.</p>
            </div>
          ) : (
            <div className="keys-list">
              {walletAccounts.map((account) => (
                <div
                  key={account.id}
                  className={`key-card ${selectedWalletId === account.id ? 'selected' : ''}`}
                  onClick={() => setSelectedWalletId(account.id)}
                >
                  <div className="key-info">
                    <div className="key-header">
                      <span className="key-label">{getWalletLabel(account)}</span>
                      <span className="key-date">{new Date(account.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="key-details">
                      <div className="key-row">
                        <span className="key-name">Address:</span>
                        <code className="key-value address-value">{account.address}</code>
                      </div>
                      <div className="key-row">
                        <span className="key-name">Backup:</span>
                        <span className="key-value">
                          {account.mode === 'self-custody'
                            ? account.backupConfirmedAt ? 'confirmed' : 'required'
                            : 'managed by connected wallet'}
                        </span>
                      </div>
                      {account.mode === 'self-custody' && (
                        <div className="key-row">
                          <span className="key-name">Protection:</span>
                          <span className="key-value">{account.wrapMethod}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {account.mode === 'self-custody' && (
                      <button
                        className="btn-copy"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleConfirmBackup(account.id);
                        }}
                        title="Reveal backup"
                      >
                        backup
                      </button>
                    )}
                    <button
                      className="btn-delete"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteWallet(account.id);
                      }}
                      title="Delete wallet"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="keys-section">
          <div className="section-header">
            <h2>Viewer Keys</h2>
            <button className="btn-primary" onClick={() => setIsAddKeyModalOpen(true)} disabled={loading.addKey}>
              {loading.addKey ? 'Creating...' : '+ Viewer Key'}
            </button>
          </div>

          <ViewerKeyList
            keys={keys}
            selectedKey={selectedKey}
            onSelect={(key) => {
              setSelectedKeyId(key.id);
              const holderAddress = holderAddresses[Object.values(CONFIDENTIAL_TOKENS)[0]?.address || ''];
              void refreshRegistrationStatus(key, holderAddress);
            }}
            onDelete={(keyId) => void handleDeleteKey(keyId)}
            formatPublicKey={formatPublicKey}
            formatAddress={formatAddress}
          />
        </section>

        {selectedKey && (
          <section className="balances-section">
            <div className="section-header">
              <h2>Balances & Actions</h2>
              <button className="btn-secondary" onClick={() => setIsRegisterModalOpen(true)}>
                Register Viewer Key
              </button>
            </div>

            <div className="balances-grid">
              {Object.values(CONFIDENTIAL_TOKENS).map((token) => (
                <EnhancedBalanceCard
                  key={token.address}
                  token={token}
                  keyData={selectedKey}
                  wallet={selectedWallet}
                  balance={balances[selectedKey.id]?.[token.address]}
                  loading={loading[`balance:${selectedKey.id}:${token.address}`]}
                  isRegistered={registeredStatus[token.address] || false}
                  onViewBalance={() => {
                    const holderAddress = holderAddresses[token.address] || '';
                    void refreshRegistrationStatus(selectedKey, holderAddress);
                    return handleViewBalance(selectedKey, token, holderAddress);
                  }}
                  onHolderAddressChange={(address, value) =>
                    setHolderAddresses((current) => ({ ...current, [address]: value }))
                  }
                  onSend={(payload) => handleSendToken(token, payload)}
                  hasSelfCustodyWallet={hasSelfCustodyWallet}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {isAddKeyModalOpen && (
        <AddKeyModal
          onClose={() => setIsAddKeyModalOpen(false)}
          onSubmit={handleAddKey}
          keyCount={keys.length}
        />
      )}

      {isAddWalletModalOpen && (
        <AddWalletModal
          onClose={() => setIsAddWalletModalOpen(false)}
          onCreate={handleCreateWallet}
          onImport={handleImportWallet}
          onConnectExternal={handleConnectExternalWallet}
          loading={loading.addWallet}
        />
      )}

      {isRegisterModalOpen && selectedKey && (
        <RegisterKeyModal
          keyData={selectedKey}
          tokens={Object.values(CONFIDENTIAL_TOKENS)}
          onClose={() => setIsRegisterModalOpen(false)}
          onSubmit={handleRegisterKey}
          loading={loading.register}
          walletLabel={getWalletLabel(selectedWallet)}
        />
      )}

      <SecurePassphraseModal
        open={Boolean(passphraseModal)}
        title={passphraseModal?.title}
        description={passphraseModal?.description}
        confirmLabel={passphraseModal?.confirmLabel}
        requireConfirm={passphraseModal?.requireConfirm}
        loading={Boolean(loading.passphrase)}
        onClose={() => setPassphraseModal(null)}
        onConfirm={async (passphrase) => {
          setLoading((current) => ({ ...current, passphrase: true }));
          try {
            await passphraseModal?.onConfirm?.(passphrase);
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
          setLoading((current) => ({ ...current, backup: true }));
          try {
            await backupModal?.onConfirm?.();
          } finally {
            setLoading((current) => ({ ...current, backup: false }));
          }
        }}
      />

      <footer className="wallet-footer">
        <div className="footer-left">
          <span className="auth-indicator">
            <span className="status-dot unlocked"></span>
            {selectedExternalWallet ? 'External Wallet + Unlocked' : 'Unlocked'}
          </span>
        </div>
        <div className="footer-right">
          <span className="version">MyBITE Wallet v1.0</span>
        </div>
      </footer>
    </div>
  );
}

export default function WalletApp() {
  return (
    <AuthProvider>
      <WalletContent />
    </AuthProvider>
  );
}
