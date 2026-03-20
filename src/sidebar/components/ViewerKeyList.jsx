import React, { useState } from 'react';

export function ViewerKeyList({ keys, selectedKey, onSelect, onDelete, formatPublicKey, formatAddress }) {
  const [copiedField, setCopiedField] = useState(null);

  const handleCopy = async (text, field) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (keys.length === 0) {
    return (
      <div className="empty-state">
        <p>No viewer keys yet.</p>
        <p className="hint">Create a key to start viewing confidential balances with Face/Touch ID.</p>
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
                <span className="key-date">
                  {new Date(key.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="key-details">
                <div className="key-row">
                  <span className="key-name">Public Key:</span>
                  <div className="key-value-container">
                    <code className="key-value" title={key.publicKeyHex}>
                      {formatPublicKey(key.publicKeyHex)}
                    </code>
                    <button 
                      className="btn-copy"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(key.publicKeyHex, `pubkey-${key.id}`);
                      }}
                      title="Copy public key"
                    >
                      {copiedField === `pubkey-${key.id}` ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
                <div className="key-row">
                  <span className="key-name">Address:</span>
                  <div className="key-value-container">
                    <code className="key-value address-value" title={address}>
                      {address}
                    </code>
                    <button 
                      className="btn-copy"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopy(address, `address-${key.id}`);
                      }}
                      title="Copy address"
                    >
                      {copiedField === `address-${key.id}` ? '✓' : '📋'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button
              className="btn-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(key.id);
              }}
              title="Delete key"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
