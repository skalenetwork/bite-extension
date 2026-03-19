/**
 * WebAuthn/Passkey service for generating and managing viewer keys
 * Creates secp256k1 keys derived from WebAuthn credentials
 * 
 * Uses a popup window for WebAuthn operations to work around
 * Chrome extension side panel limitations
 */

import { CryptoService } from './crypto';
import type { ViewerKeyPair } from '../types';

export class PasskeyService {
  private static readonly RP_NAME = 'BITE Confidential Wallet';
  private static popupWindow: Window | null = null;

  /**
   * Check if WebAuthn is available in this browser
   */
  static isAvailable(): boolean {
    const available = typeof window !== 'undefined' && 
           typeof window.PublicKeyCredential !== 'undefined';
    console.log('[Passkey] WebAuthn available:', available);
    return available;
  }

  /**
   * Open WebAuthn helper popup and return a promise that resolves when complete
   */
  private static openWebAuthnPopup(operation: 'create' | 'auth', params: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      // Build query string
      const queryParams = new URLSearchParams({ op: operation, ...params });
      const url = chrome.runtime.getURL(`webauthn-helper.html?${queryParams}`);

      // Calculate centered position
      const width = 500;
      const height = 400;
      const left = Math.round((window.screen.width - width) / 2);
      const top = Math.round((window.screen.height - height) / 2);

      console.log('[Passkey] Opening popup:', url);

      // Open popup window
      this.popupWindow = window.open(
        url,
        'webauthn-helper',
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=no,resizable=no`
      );

      if (!this.popupWindow) {
        reject(new Error('Failed to open popup window. Please allow popups for this extension.'));
        return;
      }

      // Listen for message from popup
      const messageHandler = (event: MessageEvent) => {
        // Only accept messages from our popup
        if (event.source !== this.popupWindow) return;

        console.log('[Passkey] Received message from popup:', event.data);

        if (event.data.type === 'WEBAUTHN_CREATE_SUCCESS') {
          cleanup();
          resolve(event.data.payload);
        } else if (event.data.type === 'WEBAUTHN_AUTH_SUCCESS') {
          cleanup();
          resolve(event.data.payload);
        } else if (event.data.type === 'WEBAUTHN_CANCELLED') {
          cleanup();
          reject(new Error('User cancelled WebAuthn operation'));
        }
      };

      // Cleanup function
      const cleanup = () => {
        window.removeEventListener('message', messageHandler);
        if (this.popupWindow && !this.popupWindow.closed) {
          this.popupWindow.close();
        }
        this.popupWindow = null;
      };

      // Set up message listener
      window.addEventListener('message', messageHandler);

      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (this.popupWindow?.closed) {
          clearInterval(checkClosed);
          cleanup();
          reject(new Error('WebAuthn window was closed'));
        }
      }, 500);

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.popupWindow) {
          clearInterval(checkClosed);
          cleanup();
          reject(new Error('WebAuthn operation timed out'));
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Generate a new viewer key via WebAuthn passkey
   * Opens a popup window for the actual WebAuthn operation
   */
  static async createViewerKey(label?: string): Promise<ViewerKeyPair> {
    console.log('[Passkey] Creating viewer key via popup...');
    
    if (!this.isAvailable()) {
      throw new Error('WebAuthn not supported in this browser');
    }

    try {
      // Open popup and wait for result
      const result = await this.openWebAuthnPopup('create', { label: label || 'Key 1' });
      
      console.log('[Passkey] Got result from popup:', result);

      // Convert signature back to Uint8Array
      const signature = new Uint8Array(result.signature);
      
      // Derive secp256k1 keypair
      console.log('[Passkey] Deriving key from signature...');
      const privateKey = CryptoService.derivePrivateKeyFromSignature(signature);
      const publicKey = CryptoService.derivePublicKeyFromPrivate(privateKey);
      
      console.log('[Passkey] Key derived:', publicKey.slice(0, 20) + '...');

      // Generate default label
      const keyCount = await this.getKeyCount();
      const defaultLabel = label || `Key ${keyCount + 1}`;

      return {
        id: result.credentialId,
        label: defaultLabel,
        credentialId: result.credentialId,
        publicKeyHex: publicKey,
        createdAt: Date.now(),
      };
    } catch (error) {
      console.error('[Passkey] Error creating viewer key:', error);
      throw error;
    }
  }

  /**
   * Authenticate with existing passkey and return the signature
   * Opens a popup window for the actual WebAuthn operation
   */
  static async authenticateAndGetSignature(credentialId: string): Promise<Uint8Array> {
    console.log('[Passkey] Authenticating via popup:', credentialId.slice(0, 20) + '...');
    
    try {
      const result = await this.openWebAuthnPopup('auth', { credentialId });
      
      console.log('[Passkey] Got signature from popup');
      return new Uint8Array(result.signature);
    } catch (error) {
      console.error('[Passkey] Authentication error:', error);
      throw error;
    }
  }

  /**
   * Authenticate and derive the private key for decryption
   */
  static async authenticateAndDeriveKey(credentialId: string): Promise<string> {
    console.log('[Passkey] Authenticating and deriving key...');
    const signature = await this.authenticateAndGetSignature(credentialId);
    return CryptoService.derivePrivateKeyFromSignature(signature);
  }

  /**
   * Get the number of existing keys (for generating default labels)
   */
  private static async getKeyCount(): Promise<number> {
    if (typeof window !== 'undefined' && window.localStorage) {
      const count = localStorage.getItem('viewer-key-count');
      const num = count ? parseInt(count, 10) : 0;
      localStorage.setItem('viewer-key-count', (num + 1).toString());
      return num;
    }
    return 0;
  }

  /**
   * Convert base64url to ArrayBuffer
   */
  static base64UrlToBuffer(base64url: string): ArrayBuffer {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    const buffer = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }
    return buffer;
  }

  /**
   * Convert ArrayBuffer to base64url
   */
  static bufferToBase64Url(buffer: ArrayBuffer): string {
    const binary = String.fromCharCode(...new Uint8Array(buffer));
    const base64 = btoa(binary);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }
}
