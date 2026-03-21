import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthState, OnboardingPath, OnboardingState, OnboardingStep, UnlockResult } from '../../types';
import { walletService } from '../../services/wallet';
import { runtimeSession } from '../../services/runtimeSession';
import { viewerKeyStorage } from '../../storage/viewerKeys';

interface AuthContextValue extends AuthState {
  onboarding: OnboardingState;
  hasExistingWallet: boolean;
  hasPasskeySupport: boolean;
  webAuthnAvailable: boolean;
  authenticateWithPasskey: () => Promise<UnlockResult>;
  authenticateWithPassphrase: (passphrase: string) => Promise<UnlockResult>;
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

  const checkAuthState = useCallback(async (): Promise<void> => {
    try {
      await viewerKeyStorage.init();
      const wallets = await viewerKeyStorage.getWalletAccounts();
      const existingWallet = wallets.length > 0;
      const hasActiveSession = wallets.some((wallet) => runtimeSession.has(`wallet:${wallet.id}`));

      setHasExistingWallet(existingWallet);

      if (hasActiveSession) {
        setAuthState({ status: 'authenticated', isOnboarding: false, error: null });
      } else if (existingWallet) {
        setAuthState({ status: 'locked', isOnboarding: false, error: null });
      } else {
        setAuthState({ status: 'unauthenticated', isOnboarding: true, error: null });
      }
    } catch (error) {
      setAuthState({
        status: 'unauthenticated',
        isOnboarding: false,
        error: error instanceof Error ? error.message : 'Failed to check authentication state',
      });
    }
  }, []);

  useEffect(() => {
    const detectWebAuthn = async (): Promise<void> => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
        if (typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined') {
          setWebAuthnAvailable(true);
          setHasPasskeySupport(true);
          return;
        }
      }

      const available = typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
      setWebAuthnAvailable(available);
      setHasPasskeySupport(available);
    };

    void detectWebAuthn();
  }, []);

  useEffect(() => {
    void checkAuthState();
  }, [checkAuthState]);

  const authenticateWithPasskey = useCallback(async (): Promise<UnlockResult> => {
    try {
      const wallets = await viewerKeyStorage.getWalletAccounts();
      const passkeyWallets = wallets.filter(
        (wallet) =>
          (wallet.mode === 'smart-account' || wallet.mode === 'self-custody') &&
          'credentialId' in wallet &&
          Boolean(wallet.credentialId),
      );

      if (passkeyWallets.length === 0) {
        return { success: false, error: 'No passkey-protected wallets found.' };
      }

      for (const wallet of passkeyWallets) {
        try {
          await walletService.unlockWalletAccount(wallet.id, '');
          setAuthState({ status: 'authenticated', isOnboarding: false, error: null });
          return { success: true };
        } catch {
          // try next wallet
        }
      }

      return { success: false, error: 'Passkey authentication failed. Please try again.' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Passkey authentication failed';
      setAuthState({ status: 'unauthenticated', isOnboarding: true, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, []);

  const authenticateWithPassphrase = useCallback(async (passphrase: string): Promise<UnlockResult> => {
    try {
      const wallets = await viewerKeyStorage.getWalletAccounts();
      const localWallet = wallets.find((wallet) => wallet.mode === 'self-custody' && wallet.wrapMethod === 'passphrase');
      if (!localWallet) {
        return { success: false, error: 'No passphrase-protected wallet is available.' };
      }

      await walletService.unlockWalletAccount(localWallet.id, passphrase);
      setAuthState({ status: 'authenticated', isOnboarding: false, error: null });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      setAuthState({ status: 'unauthenticated', isOnboarding: true, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }, []);

  const lock = useCallback((): void => {
    runtimeSession.clearAll();
    setAuthState({ status: 'locked', isOnboarding: false, error: null });
  }, []);

  const startOnboarding = useCallback((): void => {
    setAuthState({ status: 'unauthenticated', isOnboarding: true, error: null });
    setOnboarding(initialOnboardingState);
  }, []);

  const completeOnboarding = useCallback(async (): Promise<void> => {
    await checkAuthState();
  }, [checkAuthState]);

  const setOnboardingStep = useCallback((step: OnboardingStep): void => {
    setOnboarding((previous) => ({ ...previous, currentStep: step }));
  }, []);

  const setOnboardingPath = useCallback((path: OnboardingPath): void => {
    setOnboarding((previous) => ({ ...previous, path }));
  }, []);

  const setWalletId = useCallback((walletId: string | null): void => {
    setOnboarding((previous) => ({ ...previous, walletId }));
  }, []);

  const confirmBackup = useCallback((): void => {
    setOnboarding((previous) => ({ ...previous, backupConfirmed: true }));
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
