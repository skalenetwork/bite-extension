import type { ViewerKeyPair, ViewerKeySession } from '../types';

const DB_NAME = 'BITEWalletDB';
const DB_VERSION = 1;
const STORE_KEYS = 'viewerKeys';
const STORE_SESSIONS = 'sessions';

export class ViewerKeyStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Store viewer key metadata (public info only, credentialId for retrieval)
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          const keyStore = db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
          keyStore.createIndex('credentialId', 'credentialId', { unique: true });
          keyStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Store temporary sessions (decrypted keys in memory, persisted briefly)
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'keyId' });
          sessionStore.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });
  }

  /**
   * Save a new viewer key
   * Note: We only store metadata and credentialId, not the private key
   * Private key is derived on-demand via WebAuthn
   */
  async saveKey(keyPair: ViewerKeyPair): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS], 'readwrite');
      const store = transaction.objectStore(STORE_KEYS);
      const request = store.put(keyPair);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all stored viewer keys
   */
  async getAllKeys(): Promise<ViewerKeyPair[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS], 'readonly');
      const store = transaction.objectStore(STORE_KEYS);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result as ViewerKeyPair[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a specific key by ID
   */
  async getKey(id: string): Promise<ViewerKeyPair | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS], 'readonly');
      const store = transaction.objectStore(STORE_KEYS);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result as ViewerKeyPair || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete a viewer key
   */
  async deleteKey(id: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS], 'readwrite');
      const store = transaction.objectStore(STORE_KEYS);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Save a temporary session with decrypted key
   * Session expires after 5 minutes by default
   */
  async saveSession(session: ViewerKeySession): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.put(session);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get a valid (non-expired) session
   */
  async getValidSession(keyId: string): Promise<ViewerKeySession | null> {
    if (!this.db) await this.init();
    
    const session = await new Promise<ViewerKeySession | undefined>((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.get(keyId);

      request.onsuccess = () => resolve(request.result as ViewerKeySession);
      request.onerror = () => reject(request.error);
    });

    if (!session) return null;

    // Check if expired
    if (Date.now() > session.expiresAt) {
      await this.clearSession(keyId);
      return null;
    }

    return session;
  }

  /**
   * Clear a specific session
   */
  async clearSession(keyId: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.delete(keyId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all expired sessions
   */
  async clearExpiredSessions(): Promise<void> {
    if (!this.db) await this.init();
    
    const now = Date.now();
    const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
    const store = transaction.objectStore(STORE_SESSIONS);
    const index = store.index('expiresAt');

    // Get all sessions with expiresAt < now
    const range = IDBKeyRange.upperBound(now);
    const request = index.openCursor(range);

    return new Promise((resolve, reject) => {
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all data (nuclear option)
   */
  async clearAll(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS, STORE_SESSIONS], 'readwrite');
      
      transaction.objectStore(STORE_KEYS).clear();
      transaction.objectStore(STORE_SESSIONS).clear();

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Singleton instance
export const viewerKeyStorage = new ViewerKeyStorage();
