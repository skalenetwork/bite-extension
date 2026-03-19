import React from 'react';

export function ViewerKeyList({ keys, selectedKey, onSelect, onDelete, formatPublicKey, formatAddress }) {
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
      {keys.map((key) => (
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
                <code className="key-value">{formatPublicKey(key.publicKeyHex)}</code>
              </div>
              <div className="key-row">
                <span className="key-name">Address:</span>
                <code className="key-value">{formatAddress(key.publicKeyHex)}</code>
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
      ))}
    </div>
  );
}
