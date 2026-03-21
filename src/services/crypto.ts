/**
 * Browser-compatible ECIES decryption
 * Based on working Node.js implementation, adapted for WebCrypto API
 */

import { ec as EllipticCurve } from 'elliptic';
import { keccak256 } from 'ethers';
import { bytesToHex, ensure0x, hexToBytes, strip0x, toArrayBuffer } from './encoding';

const EC = new EllipticCurve('secp256k1');

export class CryptoService {
  /**
   * Derive a secp256k1 private key from a WebAuthn signature
   * Uses deterministic derivation: privateKey = keccak256(signature[0:32])
   */
  static derivePrivateKeyFromSignature(signature: Uint8Array): string {
    const seed = signature.slice(0, 32);
    const seedHex = ensure0x(bytesToHex(seed));
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
    
    return ensure0x(`04${x}${y}`);
  }

  static normalizePrivateKey(privateKeyHex: string): string {
    return strip0x(privateKeyHex);
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
    // Remove 0x prefix
    const cleanPrivateKey = strip0x(privateKeyHex);
    const cleanEncryptedData = strip0x(encryptedDataHex);

    const encryptedData = hexToBytes(cleanEncryptedData);
    // Extract parts: IV(16) + ephemeralPubKey(33) + ciphertext
    const iv = encryptedData.slice(0, 16);
    const ephemeralPublicKey = encryptedData.slice(16, 16 + 33);
    const ciphertext = encryptedData.slice(16 + 33);
    
    // Derive Shared Secret using ECDH
    const ecdh = EC.keyFromPrivate(cleanPrivateKey, 'hex');
    const ephemeralPoint = EC.keyFromPublic(bytesToHex(ephemeralPublicKey), 'hex');
    
    // Compute shared secret: ephemeralPubKey * privateKey
    // This gives us a point, we take the X coordinate
    const sharedPoint = ephemeralPoint.getPublic().mul(ecdh.getPrivate());
    const sharedSecretHex = sharedPoint.getX().toString('hex').padStart(64, '0');
    const sharedSecret = hexToBytes(sharedSecretHex);
    
    // Derive AES key: SHA-256(sharedSecret)
    const aesKeyBuffer = await crypto.subtle.digest('SHA-256', toArrayBuffer(sharedSecret));
    const aesKey = new Uint8Array(aesKeyBuffer);
    // Decrypt: AES-256-CBC
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-CBC', length: 256 },
      false,
      ['decrypt']
    );

    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: toArrayBuffer(iv) },
        cryptoKey,
        toArrayBuffer(ciphertext)
      );

      const decryptedBytes = new Uint8Array(decrypted);
      // Convert to hex string
      const decryptedHex = ensure0x(bytesToHex(decryptedBytes));
      return BigInt(decryptedHex);
    } catch (error) {
      throw new Error('AES decryption failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}
