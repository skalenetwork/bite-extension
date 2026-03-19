import React, { useState, useEffect, useCallback } from 'react';
import { PasskeyService } from '../services/passkey';
import { viewerKeyStorage } from '../storage/viewerKeys';
import { balanceService } from '../services/balance';
import { registrationService } from '../services/registration';
import { CONFIDENTIAL_TOKENS, BITE_SANDBOX_CONFIG } from '../services/bite';
import { ViewerKeyList } from './components/ViewerKeyList';
import { AddKeyModal } from './components/AddKeyModal';
import { BalanceCard } from './components/BalanceCard';
import { RegisterKeyModal } from './components/RegisterKeyModal';

const SESSION_CHECK_INTERVAL = 30000; // Check session every 30s

export default function WalletApp() {
  const [keys, setKeys] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState({});
  const [error, setError] = useState(null);
  const [webAuthnAvailable, setWebAuthnAvailable] = useState(false);
  const [isSidebarEmbedded, setIsSidebarEmbedded] = useState(false);

  // Check WebAuthn availability
  useEffect(() => {
    setWebAuthnAvailable(PasskeyService.isAvailable());
    
    // Check if we're in embedded mode
    const urlParams = new URLSearchParams(window.location.search);
    setIsSidebarEmbedded(urlParams.get('embedded') === 'true');
  }, []);

  // Load stored keys on mount
  useEffect(() => {
    loadKeys();
  }, []);

  // Periodically check and clear expired sessions
  useEffect(() => {
    const interval = setInterval(() => {
      viewerKeyStorage.clearExpiredSessions();
    }, SESSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const loadKeys = async () => {
    try {
      await viewerKeyStorage.init();
      const storedKeys = await viewerKeyStorage.getAllKeys();
      setKeys(storedKeys);
    } catch (err) {
      setError('Failed to load viewer keys: ' + err.message);
    }
  };

  const handleAddKey = async (label) => {
    try {
      setError(null);
      setLoading({ ...loading, addKey: true });

      console.log('[WalletApp] Creating viewer key with label:', label);
      const keyPair = await PasskeyService.createViewerKey(label);
      console.log('[WalletApp] Key created:', keyPair.id);
      
      await viewerKeyStorage.saveKey(keyPair);
      console.log('[WalletApp] Key saved to storage');

      setKeys([...keys, keyPair]);
      setIsAddModalOpen(false);
    } catch (err) {
      console.error('[WalletApp] Failed to create viewer key:', err);
      const errorMessage = err.message || 'Unknown error creating key';
      setError('Failed to create viewer key: ' + errorMessage);
      // Re-throw so the modal can catch it too
      throw err;
    } finally {
      setLoading({ ...loading, addKey: false });
    }
  };

  const handleDeleteKey = async (keyId) => {
    if (!confirm('Are you sure you want to delete this viewer key?')) return;

    try {
      await viewerKeyStorage.deleteKey(keyId);
      await viewerKeyStorage.clearSession(keyId);
      
      setKeys(keys.filter(k => k.id !== keyId));
      if (selectedKey?.id === keyId) {
        setSelectedKey(null);
      }
      
      // Remove balance for this key
      const newBalances = { ...balances };
      delete newBalances[keyId];
      setBalances(newBalances);
    } catch (err) {
      setError('Failed to delete key: ' + err.message);
    }
  };

  const handleViewBalance = async (key, token) => {
    try {
      setError(null);
      setLoading({ ...loading, [`${key.id}-${token.address}`]: true });

      // Get the holder address - for now, use the public key's derived address
      // In production, this would be the user's wallet address
      const { ethers } = await import('ethers');
      const publicKey = key.publicKeyHex;
      const holderAddress = ethers.computeAddress(publicKey);

      const decryptedBalance = await balanceService.getDecryptedBalance(
        key.id,
        token,
        holderAddress
      );

      setBalances({
        ...balances,
        [key.id]: {
          ...balances[key.id],
          [token.address]: decryptedBalance,
        },
      });
    } catch (err) {
      setError('Failed to decrypt balance: ' + err.message);
    } finally {
      setLoading({ ...loading, [`${key.id}-${token.address}`]: false });
    }
  };

  const handleRegisterKey = async (keyId, tokenAddress, depositAmount) => {
    try {
      setError(null);
      setLoading({ ...loading, register: true });

      const key = keys.find(k => k.id === keyId);
      if (!key) throw new Error('Key not found');

      const registrationData = await registrationService.prepareViewerKeyRegistration(
        tokenAddress,
        key.publicKeyHex,
        depositAmount
      );

      // Request accounts from MetaMask
      const accounts = await window.ethereum?.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No wallet connected. Please connect MetaMask.');
      }

      const txRequest = registrationService.buildTransactionRequest(
        registrationData,
        accounts[0]
      );

      // Send transaction via MetaMask
      const txHash = await window.ethereum?.request({
        method: 'eth_sendTransaction',
        params: [txRequest],
      });

      alert(`Registration submitted! Transaction: ${txHash}`);
      setIsRegisterModalOpen(false);
    } catch (err) {
      setError('Failed to register key: ' + err.message);
    } finally {
      setLoading({ ...loading, register: false });
    }
  };

  const formatPublicKey = (key) => {
    return key.slice(0, 20) + '...' + key.slice(-8);
  };

  const formatAddress = (publicKey) => {
    try {
      const { ethers } = require('ethers');
      return ethers.computeAddress(publicKey);
    } catch {
      return 'Unable to compute';
    }
  };

  // Debug info
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState({});

  useEffect(() => {
    // Gather debug info
    setDebugInfo({
      userAgent: navigator.userAgent,
      hostname: window.location.hostname,
      webAuthnAvailable: typeof window.PublicKeyCredential !== 'undefined',
      origin: window.location.origin,
    });
  }, []);

  if (!webAuthnAvailable) {
    return (
      <div className="wallet-error">
        <h2>WebAuthn Not Available</h2>
        <p>This browser does not support WebAuthn/Passkeys. Please use a modern browser with biometric authentication support.</p>
      </div>
    );
  }

  return (
    <div className={`wallet-app ${isSidebarEmbedded ? 'embedded' : ''}`}>
      <header className="wallet-header">
        <div className="wallet-title">
          <span className="wallet-icon">🔐</span>
          <h1>BITE Confidential</h1>
        </div>
        <div className="wallet-network">
          <span className="network-indicator"></span>
          <span>BITE Sandbox</span>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <main className="wallet-main">
        <section className="keys-section">
          <div className="section-header">
            <h2>Viewer Keys</h2>
            <button 
              className="btn-primary"
              onClick={() => setIsAddModalOpen(true)}
              disabled={loading.addKey}
            >
              {loading.addKey ? 'Creating...' : '+ Add Key'}
            </button>
          </div>

          <ViewerKeyList
            keys={keys}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            onDelete={handleDeleteKey}
            formatPublicKey={formatPublicKey}
            formatAddress={formatAddress}
          />
        </section>

        {selectedKey && (
          <section className="balances-section">
            <div className="section-header">
              <h2>Balances</h2>
              <button
                className="btn-secondary"
                onClick={() => setIsRegisterModalOpen(true)}
              >
                Register Key
              </button>
            </div>

            <div className="balances-grid">
              {Object.values(CONFIDENTIAL_TOKENS).map((token) => (
                <BalanceCard
                  key={token.address}
                  token={token}
                  keyData={selectedKey}
                  balance={balances[selectedKey.id]?.[token.address]}
                  loading={loading[`${selectedKey.id}-${token.address}`]}
                  onViewBalance={() => handleViewBalance(selectedKey, token)}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {isAddModalOpen && (
        <AddKeyModal
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleAddKey}
          keyCount={keys.length}
        />
      )}

      {isRegisterModalOpen && selectedKey && (
        <RegisterKeyModal
          keyData={selectedKey}
          tokens={Object.values(CONFIDENTIAL_TOKENS)}
          onClose={() => setIsRegisterModalOpen(false)}
          onSubmit={handleRegisterKey}
          loading={loading.register}
        />
      )}

      {/* Debug Panel */}
      <footer className="wallet-footer">
        <button 
          className="btn-debug"
          onClick={() => setShowDebug(!showDebug)}
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'var(--text-secondary)',
            fontSize: '11px',
            cursor: 'pointer',
            padding: '8px'
          }}
        >
          {showDebug ? 'Hide Debug' : 'Debug Info'}
        </button>
        
        {showDebug && (
          <div style={{ 
            padding: '12px', 
            background: '#f5f5f7', 
            fontSize: '10px',
            fontFamily: 'monospace',
            borderTop: '1px solid var(--border)'
          }}>
            <pre style={{ margin: 0, overflow: 'auto' }}>
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
            <div style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>
              Check browser console for detailed passkey logs
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
