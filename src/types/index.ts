export type HexString = `0x${string}`;

export type WrapMethod = 'webauthn-prf' | 'passphrase';

export type WalletMode = 'smart-account' | 'self-custody' | 'external';

export type SmartWalletProvider = 'coinbase-smart-wallet';

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
  | 'add-viewer-key'
  | 'complete';

export type OnboardingPath = 'create' | 'import' | 'connect';

export interface OnboardingState {
  currentStep: OnboardingStep;
  path: OnboardingPath | null;
  walletId: string | null;
  backupConfirmed: boolean;
}

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

interface BaseWalletAccount {
  id: string;
  mode: WalletMode;
  address: string;
  createdAt: number;
  backupConfirmedAt?: number;
}

export interface SmartWalletAccount extends BaseWalletAccount {
  mode: 'smart-account';
  providerRef: SmartWalletProvider;
  credentialId: string;
  publicKeyHex: HexString;
  rpId: string;
  smartAccountVersion: '1.1' | '1';
  bundlerUrl: string;
}

export interface SelfCustodyWalletAccount extends BaseWalletAccount {
  mode: 'self-custody';
  wrappedSecret: string;
  wrapMethod: WrapMethod;
  wrapSalt: string;
  wrapIv: string;
  credentialId?: string;
  providerRef?: 'local';
}

export interface ExternalWalletAccount extends BaseWalletAccount {
  mode: 'external';
  providerRef: string;
}

export type StoredWalletAccount =
  | SmartWalletAccount
  | SelfCustodyWalletAccount
  | ExternalWalletAccount;

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
  publicKeyHex?: HexString;
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
  privateKey: string | null;
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

export interface SecureBackupItem {
  label: string;
  value: string;
  description?: string;
}

export interface PassphraseModalState {
  title: string;
  description: string;
  confirmLabel: string;
  requireConfirm?: boolean;
  onConfirm: (passphrase: string) => Promise<void>;
}

export interface BackupModalState {
  title: string;
  subtitle: string;
  items: SecureBackupItem[];
  onConfirm: () => Promise<void>;
}

export interface ViewerBalanceMap {
  [keyId: string]: Record<string, DecryptedBalance | undefined>;
}

export interface HolderAddressMap {
  [tokenAddress: string]: string | undefined;
}

export interface RegistrationStatusMap {
  [tokenAddress: string]: boolean | undefined;
}

export interface LoadingState {
  addKey?: boolean;
  addWallet?: boolean;
  register?: boolean;
  passphrase?: boolean;
  backup?: boolean;
  disconnectWallet?: boolean;
  [key: `send:${string}`]: boolean | undefined;
  [key: `balance:${string}:${string}`]: boolean | undefined;
}

export interface SmartAccountConfig {
  bundlerUrl: string;
  provider: SmartWalletProvider;
  version: '1.1' | '1';
  rpId: string;
}
