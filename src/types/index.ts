export type WrapMethod = 'webauthn-prf' | 'passphrase';

export type WalletMode = 'self-custody' | 'embedded' | 'external';

export type AccountKind = 'viewer' | 'spending';

export type MigrationState = 'none' | 'required' | 'complete';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated' | 'locked';

export interface AuthState {
  status: AuthStatus;
  isOnboarding: boolean;
  error: string | null;
}

export interface UnlockResult {
  success: boolean;
  error?: string;
}

export type OnboardingStep =
  | 'welcome'
  | 'choice'
  | 'create-wallet'
  | 'import-wallet'
  | 'connect-wallet'
  | 'backup'
  | 'complete';

export type OnboardingPath = 'create' | 'import' | 'connect';

export interface OnboardingState {
  currentStep: OnboardingStep;
  path: OnboardingPath | null;
  walletId: string | null;
  backupConfirmed: boolean;
}

// For injected wallet
export interface InjectedWalletInfo {
  address: string;
  chainId: number;
  isConnected: boolean;
  provider: string;
}

export interface StoredViewerKey {
  id: string;
  label: string;
  credentialId: string;
  publicKeyHex: string;
  wrappedPrivateKey: string;
  wrapMethod: WrapMethod;
  wrapSalt: string;
  wrapIv: string;
  createdAt: number;
  migrationState: MigrationState;
  privateKeyHex?: string;
}

export interface StoredWalletAccount {
  id: string;
  mode: WalletMode;
  address: string;
  wrappedSecret?: string;
  providerRef?: string;
  wrapMethod?: WrapMethod;
  wrapSalt?: string;
  wrapIv?: string;
  credentialId?: string;
  createdAt: number;
  backupConfirmedAt?: number;
}

export interface EncryptedBalance {
  tokenAddress: string;
  holderAddress: string;
  encryptedData: string;
  lastUpdated: number;
}

export interface TokenConfig {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export interface DecryptedBalance {
  token: TokenConfig;
  amount: string;
  decryptedAt: number;
}

export interface RegistrationPayload {
  to: string;
  data: string;
}

export interface PasskeyCredentialResult {
  credentialId: string;
  prfSupported: boolean;
}

export interface WrappedSecret {
  ciphertextHex: string;
  saltHex: string;
  ivHex: string;
}

export interface ViewerKeyUnlockOptions {
  passphrase?: string;
}

export interface CreateViewerKeyOptions {
  label?: string;
  passphrase?: string;
}

export interface CreateWalletOptions {
  label?: string;
  passphrase?: string;
}

export interface ImportWalletOptions {
  secret: string;
  passphrase?: string;
}

export interface CreatedWalletResult {
  account: StoredWalletAccount;
  recoveryPhrase: string | null;
  privateKey: string;
}

export interface AuthCredentials {
  credentialId: string;
  passphrase?: string;
}

export interface WalletNetworkInfo {
  chainId: string | null;
  isSupported: boolean;
  name: string;
}

export type WalletEventCallback = (data: unknown) => void;

export interface ViewerKeyAssociation {
  keyId: string;
  walletAddress: string;
  signature?: string;
  verifiedAt?: number;
}

export type TransactionStatusType = 'pending' | 'confirmed' | 'failed';

export interface TransactionStatus {
  hash: string;
  status: TransactionStatusType;
  confirmations?: number;
  error?: string;
}
