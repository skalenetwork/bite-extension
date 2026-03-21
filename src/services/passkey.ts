import type { PasskeyCredentialResult } from '../types';

type PopupOperation = 'create' | 'auth' | 'prf';

type PopupResult =
  | PasskeyCredentialResult
  | { ok: boolean }
  | { credentialId: string; prfOutput: number[]; prfSupported: boolean }
  | { credentialId: string; error: string };

const DEBUG = true;

function log(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[PasskeyService]', ...args);
  }
}

export class PasskeyService {
  private static popupWindow: Window | null = null;
  private static activeRequest: { token: symbol; operation: string } | null = null;

  static isAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
  }

  private static async withRequestLock<T>(
    operation: string,
    action: () => Promise<T>,
  ): Promise<T> {
    if (this.activeRequest) {
      log('Rejected overlapping request:', operation, 'active:', this.activeRequest.operation);
      throw new Error('A passkey request is already in progress. Complete or cancel the current prompt, then try again.');
    }

    const token = Symbol(operation);
    this.activeRequest = { token, operation };
    log('Acquired request lock for:', operation);

    try {
      return await action();
    } finally {
      if (this.activeRequest?.token === token) {
        log('Released request lock for:', operation);
        this.activeRequest = null;
      }
    }
  }

  private static base64UrlToBuffer(base64Url: string): ArrayBuffer {
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer;
  }

  /**
   * Create passkey DIRECTLY - must be called synchronously from user gesture (click)
   * No async operations allowed before this call!
   */
  static async createCredentialDirect(label: string): Promise<PasskeyCredentialResult> {
    return this.withRequestLock('create-direct', async () => {
      log('Creating passkey DIRECTLY from user gesture...');

      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'MyBITE Wallet' },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: `viewer-key-${Date.now()}`,
          displayName: label,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          residentKey: 'preferred',
          userVerification: 'required',
        },
        attestation: 'none',
      };

      const credential = await navigator.credentials.create({ publicKey });
      if (!credential) {
        throw new Error('No passkey credential was created.');
      }

      const pkCred = credential as PublicKeyCredential;
      log('Direct credential created:', { id: pkCred.id.slice(0, 20) + '...' });

      return {
        credentialId: pkCred.id,
        prfSupported: true,
      };
    });
  }

  /**
   * Get PRF secret DIRECTLY - must be called synchronously from user gesture (click)
   * No async operations allowed before this call!
   */
  static async getPrfSecretDirect(credentialId: string, purpose: string): Promise<Uint8Array> {
    return this.withRequestLock('prf-direct', async () => {
      log('Getting PRF secret DIRECTLY from user gesture...');

      if (!credentialId) {
        throw new Error('Credential ID is required for PRF operation');
      }

      const source = new TextEncoder().encode(`mybite:${purpose}`);
      const hash = await crypto.subtle.digest('SHA-256', source);
      const first = new Uint8Array(hash);

      const allowCredentials: PublicKeyCredentialDescriptor[] = [
        { type: 'public-key', id: this.base64UrlToBuffer(credentialId) },
      ];

      const publicKey: PublicKeyCredentialRequestOptions = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials,
        userVerification: 'required',
        extensions: {
          prf: {
            evalByCredential: {
              [credentialId]: { first },
            },
          },
        },
      };

      const assertion = await navigator.credentials.get({ publicKey });
      if (!assertion) {
        throw new Error('Passkey assertion returned null');
      }

      const pkAssertion = assertion as PublicKeyCredential;
      const results = pkAssertion.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } };
      const output = results?.prf?.results?.first;

      if (!output) {
        throw new Error('PRF output not available - authenticator may not support PRF extension');
      }

      const outputArray = new Uint8Array(output);
      log('Direct PRF successful, output length:', outputArray.length);
      return outputArray;
    });
  }

  private static async openWebAuthnPopup(
    operation: PopupOperation,
    params: Record<string, string>,
  ): Promise<PopupResult> {
    return this.withRequestLock(`popup-${operation}`, async () => {
      log(`Opening popup for operation: ${operation}`, { params });

      return new Promise((resolve, reject) => {
        const queryParams = new URLSearchParams({ op: operation, ...params });
        const url = chrome.runtime.getURL(`webauthn-helper.html?${queryParams.toString()}`);
        log('Popup URL:', url);

        const expectedOrigin = new URL(url).origin;
        log('Expected origin:', expectedOrigin);
        const width = 500;
        const height = 420;
        const left = Math.round((window.screen.width - width) / 2);
        const top = Math.round((window.screen.height - height) / 2);
        const popupName = `webauthn-helper-${operation}-${Date.now()}`;

        this.popupWindow = window.open(
          url,
          popupName,
          `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=no,resizable=no`,
        );

        if (!this.popupWindow) {
          log('ERROR: Popup blocked or failed to open');
          reject(new Error('Failed to open passkey popup. Allow popups for this extension.'));
          return;
        }

        log('Popup opened successfully', { popupName });
        this.popupWindow.focus();

        let closedCheck = 0;
        let timeoutId = 0;
        let readyTimeoutId = 0;
        let waitIterations = 0;

        let isReady = false;

        const messageHandler = (event: MessageEvent): void => {
          log('Received message from popup:', event.data?.type, 'from origin:', event.origin);

          if (event.source !== this.popupWindow) {
            log('  -> Ignored: source mismatch');
            return;
          }
          if (event.origin !== expectedOrigin) {
            log('  -> Ignored: origin mismatch (expected', expectedOrigin, 'got', event.origin, ')');
            return;
          }
          if (!event.data || typeof event.data.type !== 'string') {
            log('  -> Ignored: invalid message format');
            return;
          }

          if (event.data.type === 'WEBAUTHN_READY') {
            log('  -> Popup is ready');
            isReady = true;
            clearTimeout(readyTimeoutId);
            return;
          }

          if (
            event.data.type === 'WEBAUTHN_CREATE_SUCCESS' ||
            event.data.type === 'WEBAUTHN_AUTH_SUCCESS' ||
            event.data.type === 'WEBAUTHN_PRF_SUCCESS'
          ) {
            log('  -> Success! Resolving with payload:', event.data.payload);
            cleanup();
            resolve(event.data.payload as PopupResult);
            return;
          }

          if (event.data.type === 'WEBAUTHN_CANCELLED') {
            log('  -> Cancelled by user');
            cleanup();
            reject(new Error('Passkey operation cancelled.'));
          }

          if (event.data.type === 'WEBAUTHN_ERROR') {
            log('  -> Error from popup:', event.data.payload);
            cleanup();
            reject(new Error(event.data.payload?.error || 'Passkey operation failed.'));
          }
        };

        const cleanup = (): void => {
          log('Cleaning up popup resources');
          clearInterval(closedCheck);
          clearTimeout(timeoutId);
          clearTimeout(readyTimeoutId);
          window.removeEventListener('message', messageHandler);
          if (this.popupWindow && !this.popupWindow.closed) {
            this.popupWindow.close();
          }
          this.popupWindow = null;
        };

        closedCheck = window.setInterval(() => {
          if (!isReady) {
            waitIterations += 1;
            if (waitIterations % 4 === 0) {
              log('Waiting for popup to be ready...', { popupName });
            }
            return;
          }
          if (this.popupWindow?.closed) {
            log('Popup detected as closed');
            cleanup();
            reject(new Error('Passkey window was closed.'));
          }
        }, 500);

        timeoutId = window.setTimeout(() => {
          if (this.popupWindow) {
            log('Popup operation timed out after 5 minutes');
            cleanup();
            reject(new Error('Passkey operation timed out.'));
          }
        }, 5 * 60 * 1000);

        readyTimeoutId = window.setTimeout(() => {
          if (!isReady) {
            log('Popup did not initialize in time', { popupName });
            cleanup();
            reject(new Error('Passkey helper failed to initialize. Please try again.'));
          }
        }, 10 * 1000);

        window.addEventListener('message', messageHandler);
      });
    });
  }

  static async createCredential(label?: string): Promise<PasskeyCredentialResult> {
    log('createCredential called with label:', label);
    if (!this.isAvailable()) {
      throw new Error('WebAuthn is not available in this browser.');
    }

    // Skip direct WebAuthn - always use popup for reliable user gesture handling
    // Direct WebAuthn in extension context often hangs without active user gesture
    log('Using popup for credential creation (reliable user gesture handling)');
    const result = await this.openWebAuthnPopup('create', { label: label || 'MyBITE Wallet' });
    log('createCredential result:', result);
    return result as PasskeyCredentialResult;
  }

  static async authenticate(credentialId: string): Promise<boolean> {
    log('authenticate called with credentialId:', credentialId);
    const result = await this.openWebAuthnPopup('auth', { credentialId });
    log('authenticate result:', result);
    return Boolean((result as { ok?: boolean }).ok);
  }

  static async getPrfSecret(credentialId: string, purpose: string): Promise<Uint8Array | null> {
    log('getPrfSecret called with credentialId:', credentialId, 'purpose:', purpose);
    
    if (!credentialId) {
      log('ERROR: credentialId is empty or undefined');
      throw new Error('Credential ID is required for PRF operation');
    }

    // Skip direct WebAuthn - always use popup for reliable user gesture handling
    log('Using popup for PRF (reliable user gesture handling)');
    const result = (await this.openWebAuthnPopup('prf', {
      credentialId,
      purpose,
    })) as { prfOutput?: number[]; prfSupported?: boolean; error?: string };

    log('getPrfSecret result:', { 
      prfSupported: result.prfSupported, 
      hasOutput: !!result.prfOutput,
      error: result.error 
    });

    if (result.error) {
      throw new Error(`PRF operation failed: ${result.error}`);
    }

    if (!result.prfSupported || !result.prfOutput) {
      log('PRF not supported or no output received');
      return null;
    }

    const prfBytes = new Uint8Array(result.prfOutput);
    log('PRF secret successfully retrieved, length:', prfBytes.length);
    return prfBytes;
  }

  static encodeCredentialId(credentialId: string): string {
    return credentialId;
  }

  static decodeCredentialId(credentialId: string): ArrayBuffer {
    return this.base64UrlToBuffer(credentialId);
  }
}
