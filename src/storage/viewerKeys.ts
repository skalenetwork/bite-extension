import type { StoredViewerKey, StoredWalletAccount } from '../types';

const DB_NAME = 'MyBITEWalletDB';
const DB_VERSION = 2;
const STORE_KEYS = 'viewerKeys';
const STORE_ACCOUNTS = 'walletAccounts';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class ViewerKeyStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          const keyStore = db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
          keyStore.createIndex('credentialId', 'credentialId', { unique: true });
          keyStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (db.objectStoreNames.contains('sessions')) {
          db.deleteObjectStore('sessions');
        }

        if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
          const walletStore = db.createObjectStore(STORE_ACCOUNTS, { keyPath: 'id' });
          walletStore.createIndex('address', 'address', { unique: false });
          walletStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  async saveKey(key: StoredViewerKey): Promise<void> {
    await this.init();
    const transaction = this.db!.transaction([STORE_KEYS], 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_KEYS).put(key));
  }

  async getAllKeys(): Promise<StoredViewerKey[]> {
    await this.init();
    const transaction = this.db!.transaction([STORE_KEYS], 'readonly');
    const result = await requestToPromise(transaction.objectStore(STORE_KEYS).getAll());
    return result as StoredViewerKey[];
  }

  async getKey(id: string): Promise<StoredViewerKey | null> {
    await this.init();
    const transaction = this.db!.transaction([STORE_KEYS], 'readonly');
    const result = await requestToPromise(transaction.objectStore(STORE_KEYS).get(id));
    return (result as StoredViewerKey | undefined) || null;
  }

  async deleteKey(id: string): Promise<void> {
    await this.init();
    const transaction = this.db!.transaction([STORE_KEYS], 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_KEYS).delete(id));
  }

  async saveWalletAccount(account: StoredWalletAccount): Promise<void> {
    await this.init();
    const transaction = this.db!.transaction([STORE_ACCOUNTS], 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_ACCOUNTS).put(account));
  }

  async getWalletAccounts(): Promise<StoredWalletAccount[]> {
    await this.init();
    const transaction = this.db!.transaction([STORE_ACCOUNTS], 'readonly');
    const result = await requestToPromise(transaction.objectStore(STORE_ACCOUNTS).getAll());
    return result as StoredWalletAccount[];
  }

  async getWalletAccount(id: string): Promise<StoredWalletAccount | null> {
    await this.init();
    const transaction = this.db!.transaction([STORE_ACCOUNTS], 'readonly');
    const result = await requestToPromise(transaction.objectStore(STORE_ACCOUNTS).get(id));
    return (result as StoredWalletAccount | undefined) || null;
  }

  async deleteWalletAccount(id: string): Promise<void> {
    await this.init();
    const transaction = this.db!.transaction([STORE_ACCOUNTS], 'readwrite');
    await requestToPromise(transaction.objectStore(STORE_ACCOUNTS).delete(id));
  }

  async clearAll(): Promise<void> {
    await this.init();
    const transaction = this.db!.transaction([STORE_KEYS, STORE_ACCOUNTS], 'readwrite');
    await Promise.all([
      requestToPromise(transaction.objectStore(STORE_KEYS).clear()),
      requestToPromise(transaction.objectStore(STORE_ACCOUNTS).clear()),
    ]);
  }
}

export const viewerKeyStorage = new ViewerKeyStorage();
