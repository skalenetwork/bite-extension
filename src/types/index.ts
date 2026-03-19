export interface ViewerKeyPair {
  id: string;
  label: string;
  credentialId: string;
  publicKeyHex: string;
  createdAt: number;
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

export interface ViewerKeySession {
  keyId: string;
  privateKeyHex: string;
  authenticatedAt: number;
  expiresAt: number;
}

export interface RegistrationPayload {
  to: string;
  data: string;
}
