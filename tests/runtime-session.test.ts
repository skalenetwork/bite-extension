import assert from 'node:assert/strict';
import test from 'node:test';

type StoredHandler = () => void;

function createFakeWindow() {
  const handlers = new Map<string, StoredHandler[]>();
  const timers: Array<() => void> = [];

  return {
    handlers,
    timers,
    addEventListener(event: string, handler: StoredHandler) {
      const existing = handlers.get(event) || [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    removeEventListener(event: string, handler: StoredHandler) {
      const existing = handlers.get(event) || [];
      handlers.set(event, existing.filter((entry) => entry !== handler));
    },
    setTimeout(callback: () => void) {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
  };
}

const fakeWindow = createFakeWindow();
const fakeDocument = { visibilityState: 'visible' };

globalThis.window = fakeWindow as unknown as Window;
globalThis.document = fakeDocument as unknown as Document;

const { runtimeSession } = await import('../src/services/runtimeSession.ts');

test('runtime sessions are memory-only and clear on demand', () => {

  runtimeSession.set('viewer:key-1', '0xdeadbeef');
  assert.equal(runtimeSession.get('viewer:key-1'), '0xdeadbeef');
  assert.equal(runtimeSession.has('viewer:key-1'), true);

  runtimeSession.clear('viewer:key-1');
  assert.equal(runtimeSession.get('viewer:key-1'), null);
});

test('runtime sessions expire and clear on visibility loss', () => {
  runtimeSession.set('wallet:abc', '0x1234');
  assert.equal(runtimeSession.get('wallet:abc'), '0x1234');
  assert.equal(fakeWindow.timers.length > 0, true);

  fakeWindow.timers[fakeWindow.timers.length - 1]?.();
  assert.equal(runtimeSession.get('wallet:abc'), null);

  runtimeSession.set('wallet:def', '0xabcd');
  fakeDocument.visibilityState = 'hidden';
  const visibilityHandlers = fakeWindow.handlers.get('visibilitychange') || [];
  visibilityHandlers.forEach((handler) => handler());
  assert.equal(runtimeSession.get('wallet:def'), null);
});
