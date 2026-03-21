import assert from 'node:assert/strict';
import test from 'node:test';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

const fakeWindow = {
  PublicKeyCredential: function PublicKeyCredential() {},
};

const fakeCrypto = {
  getRandomValues<T extends ArrayBufferView | null>(value: T): T {
    return value;
  },
  subtle: {
    async digest() {
      return new ArrayBuffer(32);
    },
  },
};

const createCalls: Array<{ deferred: ReturnType<typeof createDeferred<{ id: string }>> }> = [];

const fakeNavigator = {
  credentials: {
    create() {
      const deferred = createDeferred<{ id: string }>();
      createCalls.push({ deferred });
      return deferred.promise;
    },
  },
};

Object.defineProperty(globalThis, 'window', {
  value: fakeWindow,
  configurable: true,
});

Object.defineProperty(globalThis, 'crypto', {
  value: fakeCrypto,
  configurable: true,
});

Object.defineProperty(globalThis, 'navigator', {
  value: fakeNavigator,
  configurable: true,
});

const { PasskeyService } = await import('../src/services/passkey.ts');

test('direct credential creation rejects overlapping requests', async () => {
  createCalls.length = 0;

  const firstRequest = PasskeyService.createCredentialDirect('My Wallet');
  await Promise.resolve();

  await assert.rejects(
    () => PasskeyService.createCredentialDirect('My Wallet'),
    /already in progress/,
  );

  assert.equal(createCalls.length, 1);

  createCalls[0]?.deferred.resolve({ id: 'credential-1' });
  const result = await firstRequest;

  assert.equal(result.credentialId, 'credential-1');
});

test('direct credential creation lock clears after completion', async () => {
  createCalls.length = 0;

  const firstRequest = PasskeyService.createCredentialDirect('My Wallet');
  await Promise.resolve();
  createCalls[0]?.deferred.resolve({ id: 'credential-1' });
  await firstRequest;

  const secondRequest = PasskeyService.createCredentialDirect('My Wallet');
  await Promise.resolve();

  assert.equal(createCalls.length, 2);

  createCalls[1]?.deferred.resolve({ id: 'credential-2' });
  const secondResult = await secondRequest;

  assert.equal(secondResult.credentialId, 'credential-2');
});
