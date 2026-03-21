import { useState } from 'react';
import type { StoredViewerKey } from '../../types';

interface ViewerKeyListProps {
  keys: StoredViewerKey[];
  selectedKey: StoredViewerKey | null;
  onSelect: (key: StoredViewerKey) => void;
  onDelete: (keyId: string) => void;
  formatPublicKey: (value: string) => string;
  formatAddress: (value: string) => string;
}

export function ViewerKeyList({
  keys,
  selectedKey,
  onSelect,
  onDelete,
  formatPublicKey,
  formatAddress,
}: ViewerKeyListProps): React.ReactElement {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (text: string, field: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (keys.length === 0) {
    return (
      <div className="empty-state">
        <p>No viewer keys yet.</p>
        <p className="hint">Create a viewer key to decrypt confidential balances. It stays separate from your spending wallet.</p>
        <p className="hint">Use the button above to add one, then register it on-chain before you try to unlock a balance.</p>
      </div>
    );
  }

  return (
    <div className="keys-list">
      {keys.map((key) => {
        const address = formatAddress(key.publicKeyHex);

        return (
          <div
            key={key.id}
            className={`key-card ${selectedKey?.id === key.id ? 'selected' : ''}`}
            onClick={() => onSelect(key)}
          >
            <div className="key-info">
              <div className="key-header">
                <span className="key-label">{key.label}</span>
                <span className="key-date">{new Date(key.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="key-badges">
                <span className="key-badge">{key.wrapMethod === 'webauthn-prf' ? 'Passkey PRF' : 'Passphrase wrapped'}</span>
                <span className="key-badge key-badge-muted">{key.migrationState === 'complete' ? 'Ready' : 'Migration needed'}</span>
              </div>
              <div className="key-details">
                <div className="key-row">
                  <span className="key-name">Public Key:</span>
                  <div className="key-value-container">
                    <code className="key-value" title={key.publicKeyHex}>{formatPublicKey(key.publicKeyHex)}</code>
                    <button
                      className="btn-copy btn-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopy(key.publicKeyHex, `pubkey-${key.id}`);
                      }}
                      title="Copy public key"
                      type="button"
                    >
                      {copiedField === `pubkey-${key.id}` ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
                <div className="key-row">
                  <span className="key-name">Address:</span>
                  <div className="key-value-container">
                    <code className="key-value address-value" title={address}>{address}</code>
                    <button
                      className="btn-copy btn-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleCopy(address, `address-${key.id}`);
                      }}
                      title="Copy address"
                      type="button"
                    >
                      {copiedField === `address-${key.id}` ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button
              className="btn-delete btn-icon"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(key.id);
              }}
              title="Delete key"
              type="button"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
