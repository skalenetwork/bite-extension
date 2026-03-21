const SESSION_DURATION_MS = 90 * 1000;

type SessionEntry = {
  secret: string;
  expiresAt: number;
  timeoutId: number;
};

const sessions = new Map<string, SessionEntry>();

function clearEntry(key: string): void {
  const entry = sessions.get(key);
  if (!entry) return;

  clearTimeout(entry.timeoutId);
  sessions.delete(key);
}

function storeSession(key: string, secret: string): void {
  clearEntry(key);

  const timeoutId = window.setTimeout(() => {
    clearEntry(key);
  }, SESSION_DURATION_MS);

  sessions.set(key, {
    secret,
    expiresAt: Date.now() + SESSION_DURATION_MS,
    timeoutId,
  });
}

function getSession(key: string): string | null {
  const entry = sessions.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    clearEntry(key);
    return null;
  }

  return entry.secret;
}

function clearAllSessions(): void {
  for (const key of sessions.keys()) {
    clearEntry(key);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', clearAllSessions);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      clearAllSessions();
    }
  });
}

export const runtimeSession = {
  clear: clearEntry,
  clearAll: clearAllSessions,
  get: getSession,
  has(key: string): boolean {
    return getSession(key) !== null;
  },
  set: storeSession,
};
