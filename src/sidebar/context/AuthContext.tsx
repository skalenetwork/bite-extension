import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { AuthState, UnlockResult, OnboardingState, OnboardingStep, OnboardingPath } from '../../types';
import { viewerKeyStorage } from '../../storage/viewerKeys';
import { runtimeSession } from '../../services/runtimeSession';
import { viewerKeyService } from '../../services/viewerKey';
import { walletService } from '../../services/wallet';

interface AuthContextValue extends AuthState {
  onboarding: OnboardingState;
  hasExistingWallet: boolean;
  hasPasskeySupport: boolean;
  webAuthnAvailable: boolean;
  authenticateWithPasskey: () => Promise<UnlockResult>;
  authenticateWithPassphrase: (credentialId: string, passphrase: string) => Promise<UnlockResult>;
  lock: () => void;
  startOnboarding: () => void;
  completeOnboarding: () => Promise<void>;
  setOnboardingStep: (step: OnboardingStep) => void;
  setOnboardingPath: (path: OnboardingPath) => void;
  setWalletId: (walletId: string | null) => void;
  confirmBackup: () => void;
}

const initialAuthState: AuthState = {
  status: 'loading',
  isOnboarding: false,
  error: null,
};

const initialOnboardingState: OnboardingState = {
  currentStep: 'welcome',
  path: null,
  walletId: null,
  backupConfirmed: false,
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.ReactElement {
  const [authState, setAuthState] = useState<AuthState>(initialAuthState);
  const [onboarding, setOnboarding] = useState<OnboardingState>(initialOnboardingState);
  const [hasExistingWallet, setHasExistingWallet] = useState(false);
  const [hasPasskeySupport, setHasPasskeySupport] = useState(false);
  const [webAuthnAvailable, setWebAuthnAvailable] = useState(false);

  const checkAuthState = useCallback(async () => {
    try {
      await viewerKeyStorage.init();
      const wallets = await viewerKeyStorage.getWalletAccounts();

      const existingWallet = wallets.length > 0;
      const hasActiveSession = wallets.some((w) => runtimeSession.has(`wallet:${w.id}`));

      setHasExistingWallet(existingWallet);

      if (hasActiveSession) {
        setAuthState({
          status: 'authenticated',
          isOnboarding: false,
          error: null,
        });
      } else if (existingWallet) {
        setAuthState({
          status: 'locked',
          isOnboarding: false,
          error: null,
        });
      } else {
        setAuthState({
          status: 'unauthenticated',
          isOnboarding: true,
          error: null,
        });
      }
    } catch (error) {
      setAuthState({
        status: 'unauthenticated',
        isOnboarding: false,
        error: error instanceof Error ? error.message : 'Failed to check authentication state',
      });
    }
  }, []);

  // Check WebAuthn availability
  useEffect(() => {
    const checkWebAuthn = async () => {
      // Try multiple times with delay for extension context
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        
        if (typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined') {
          setWebAuthnAvailable(true);
          setHasPasskeySupport(true);
          return;
        }
      }
      
      // Final check
      const isAvailable = typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
      setWebAuthnAvailable(isAvailable);
      setHasPasskeySupport(isAvailable);
    };

    void checkWebAuthn();
  }, []);

  useEffect(() => {
    void checkAuthState();
  }, [checkAuthState]);

  const authenticateWithPasskey = useCallback(async (): Promise<UnlockResult> => {
    console.log('[AuthContext] authenticateWithPasskey called');
    try {
      await viewerKeyStorage.init();
      const wallets = await viewerKeyStorage.getWalletAccounts();
      console.log('[AuthContext] Found wallets:', wallets.length);
      
      // Find wallets that use webauthn-prf
      const prfWallets = wallets.filter(w => w.credentialId && w.wrapMethod === 'webauthn-prf');
      console.log('[AuthContext] PRF wallets found:', prfWallets.length, prfWallets.map(w => ({ id: w.id, credentialId: w.credentialId?.slice(0, 20) + '...' })));
      
      if (prfWallets.length === 0) {
        console.log('[AuthContext] No PRF wallets found');
        return { success: false, error: 'No passkey-protected wallets found. Create a wallet with passkey first.' };
      }

      for (const wallet of prfWallets) {
        try {
          console.log('[AuthContext] Attempting to unlock wallet:', wallet.id, 'with credentialId:', wallet.credentialId?.slice(0, 20) + '...');
          // For webauthn-prf wallets, unlockWalletAccount handles the PRF authentication internally
          await walletService.unlockWalletAccount(wallet.id, '');
          console.log('[AuthContext] Wallet unlocked successfully:', wallet.id);
          setAuthState({
            status: 'authenticated',
            isOnboarding: false,
            error: null,
          });
          return { success: true };
        } catch (err) {
          console.error(`[AuthContext] Failed to unlock wallet ${wallet.id}:`, err);
          // Continue to next wallet
        }
      }

      console.log('[AuthContext] All PRF wallets failed to unlock');
      return { success: false, error: 'Passkey authentication failed. Please ensure your passkey is available and try again.' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Passkey authentication failed';
      console.error('[AuthContext] authenticateWithPasskey error:', error);
      setAuthState({ status: 'unauthenticated', isOnboarding: true, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, []);

  const authenticateWithPassphrase = useCallback(async (credentialId: string, passphrase: string): Promise<UnlockResult> => {
    try {
      await viewerKeyStorage.init();

      const wallets = await viewerKeyStorage.getWalletAccounts();
      const wallet = wallets.find((w) => w.credentialId === credentialId);

      if (wallet) {
        await walletService.unlockWalletAccount(wallet.id, passphrase);
        setAuthState({
          status: 'authenticated',
          isOnboarding: false,
          error: null,
        });
        return { success: true };
      }

      const keys = await viewerKeyStorage.getAllKeys();
      const key = keys.find((k) => k.credentialId === credentialId);

      if (key) {
        await viewerKeyService.unlockViewerKey(key.id, { passphrase });
        setAuthState({
          status: 'authenticated',
          isOnboarding: false,
          error: null,
        });
        return { success: true };
      }

      return { success: false, error: 'Invalid credentials' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      setAuthState({ status: 'unauthenticated', isOnboarding: true, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, []);

  const lock = useCallback(() => {
    runtimeSession.clearAll();
    setAuthState({
      status: 'locked',
      isOnboarding: false,
      error: null,
    });
  }, []);

  const startOnboarding = useCallback(() => {
    setAuthState({
      status: 'unauthenticated',
      isOnboarding: true,
      error: null,
    });
    setOnboarding(initialOnboardingState);
  }, []);

  const completeOnboarding = useCallback(async () => {
    await checkAuthState();
  }, [checkAuthState]);

  const setOnboardingStep = useCallback((step: OnboardingStep) => {
    setOnboarding((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const setOnboardingPath = useCallback((path: OnboardingPath) => {
    setOnboarding((prev) => ({ ...prev, path }));
  }, []);

  const setWalletId = useCallback((walletId: string | null) => {
    setOnboarding((prev) => ({ ...prev, walletId }));
  }, []);

  const confirmBackup = useCallback(() => {
    setOnboarding((prev) => ({ ...prev, backupConfirmed: true }));
  }, []);

  const value: AuthContextValue = {
    ...authState,
    onboarding,
    hasExistingWallet,
    hasPasskeySupport,
    webAuthnAvailable,
    authenticateWithPasskey,
    authenticateWithPassphrase,
    lock,
    startOnboarding,
    completeOnboarding,
    setOnboardingStep,
    setOnboardingPath,
    setWalletId,
    confirmBackup,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
