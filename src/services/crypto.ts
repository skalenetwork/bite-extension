/**
 * Browser-compatible ECIES decryption
 * Based on working Node.js implementation, adapted for WebCrypto API
 */

import { ec as EllipticCurve } from 'elliptic';
import { keccak256 } from 'ethers';

const EC = new EllipticCurve('secp256k1');

// Helper: Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

// Helper: Convert Uint8Array to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export class CryptoService {
  /**
   * Derive a secp256k1 private key from a WebAuthn signature
   * Uses deterministic derivation: privateKey = keccak256(signature[0:32])
   */
  static derivePrivateKeyFromSignature(signature: Uint8Array): string {
    const seed = signature.slice(0, 32);
    const seedHex = '0x' + bytesToHex(seed);
    return keccak256(seedHex);
  }

  /**
   * Derive public key from private key
   * Returns uncompressed public key (65 bytes, hex with 0x04 prefix)
   */
  static derivePublicKeyFromPrivate(privateKeyHex: string): string {
    const privateKey = privateKeyHex.startsWith('0x') 
      ? privateKeyHex.slice(2) 
      : privateKeyHex;
    
    const keyPair = EC.keyFromPrivate(privateKey, 'hex');
    const publicKey = keyPair.getPublic();
    
    // Uncompressed format: 0x04 + X(32 bytes) + Y(32 bytes)
    const x = publicKey.getX().toString('hex').padStart(64, '0');
    const y = publicKey.getY().toString('hex').padStart(64, '0');
    
    return '0x04' + x + y;
  }

  /**
   * Decrypt confidential token balance using ECIES
   * Format: IV(16 bytes) + ephemeralPubKey(33 bytes compressed) + ciphertext
   * 
   * Based on working Node.js implementation:
   * 1. Extract IV, ephemeral key, ciphertext
   * 2. ECDH with secp256k1 to get shared secret
   * 3. SHA-256 to derive AES key
   * 4. AES-256-CBC decryption
   */
  static async decryptBalance(
    privateKeyHex: string,
    encryptedDataHex: string
  ): Promise<bigint> {
    console.log('[CryptoService] Starting ECIES decryption...');
    
    // Remove 0x prefix
    const cleanPrivateKey = privateKeyHex.startsWith('0x') 
      ? privateKeyHex.slice(2) 
      : privateKeyHex;
    const cleanEncryptedData = encryptedDataHex.startsWith('0x')
      ? encryptedDataHex.slice(2)
      : encryptedDataHex;

    const encryptedData = hexToBytes(cleanEncryptedData);
    console.log('[CryptoService] Encrypted data length:', encryptedData.length, 'bytes');

    // Extract parts: IV(16) + ephemeralPubKey(33) + ciphertext
    const iv = encryptedData.slice(0, 16);
    const ephemeralPublicKey = encryptedData.slice(16, 16 + 33);
    const ciphertext = encryptedData.slice(16 + 33);
    
    console.log('[CryptoService] IV:', bytesToHex(iv));
    console.log('[CryptoService] Ephemeral pubkey:', bytesToHex(ephemeralPublicKey));
    console.log('[CryptoService] Ciphertext length:', ciphertext.length, 'bytes');

    // Derive Shared Secret using ECDH
    console.log('[CryptoService] Computing ECDH shared secret...');
    const ecdh = EC.keyFromPrivate(cleanPrivateKey, 'hex');
    const ephemeralPoint = EC.keyFromPublic(bytesToHex(ephemeralPublicKey), 'hex');
    
    // Compute shared secret: ephemeralPubKey * privateKey
    // This gives us a point, we take the X coordinate
    const sharedPoint = ephemeralPoint.getPublic().mul(ecdh.getPrivate());
    const sharedSecretHex = sharedPoint.getX().toString('hex').padStart(64, '0');
    const sharedSecret = hexToBytes(sharedSecretHex);
    
    console.log('[CryptoService] Shared secret:', sharedSecretHex.slice(0, 20) + '...');

    // Derive AES key: SHA-256(sharedSecret)
    const aesKeyBuffer = await crypto.subtle.digest('SHA-256', sharedSecret);
    const aesKey = new Uint8Array(aesKeyBuffer);
    console.log('[CryptoService] AES key derived:', bytesToHex(aesKey).slice(0, 20) + '...');

    // Decrypt: AES-256-CBC
    console.log('[CryptoService] Decrypting with AES-256-CBC...');
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-CBC', length: 256 },
      false,
      ['decrypt']
    );

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        cryptoKey,
        ciphertext
      );

      const decryptedBytes = new Uint8Array(decrypted);
      console.log('[CryptoService] Decrypted length:', decryptedBytes.length, 'bytes');
      
      // Convert to hex string
      const decryptedHex = '0x' + bytesToHex(decryptedBytes);
      console.log('[CryptoService] Decrypted value:', decryptedHex);
      
      return BigInt(decryptedHex);
    } catch (error) {
      console.error('[CryptoService] AES decryption failed:', error);
      throw new Error('AES decryption failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}
