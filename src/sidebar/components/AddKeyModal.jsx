import React, { useState } from 'react';

export function AddKeyModal({ onClose, onSubmit, keyCount }) {
  const [label, setLabel] = useState(`Key ${keyCount + 1}`);
  const [isCreating, setIsCreating] = useState(false);
  const [localError, setLocalError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError(null);
    setIsCreating(true);
    
    try {
      await onSubmit(label);
      // onClose is called by parent on success
    } catch (err) {
      console.error('AddKeyModal submit error:', err);
      setLocalError(err.message || 'Failed to create key');
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create Viewer Key</h3>
          <button 
            className="modal-close" 
            onClick={handleClose}
            disabled={isCreating}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="key-label">Key Label (optional)</label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`Key ${keyCount + 1}`}
              disabled={isCreating}
            />
            <small className="hint">
              A popup window will open for biometric authentication. You'll use Face ID, Touch ID, or PIN to create your secure passkey. Make sure popups are allowed for this extension.
            </small>
          </div>

          {localError && (
            <div className="error-message" style={{ 
              color: 'var(--error)', 
              fontSize: '13px',
              padding: '8px 12px',
              background: '#fef2f2',
              borderRadius: '6px',
              marginBottom: '12px'
            }}>
              <strong>Error:</strong> {localError}
              <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                Check browser console for more details
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={handleClose}
              disabled={isCreating}
            >
              {isCreating ? 'Please wait...' : 'Cancel'}
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <span className="spinner" style={{ marginRight: '8px' }}>⟳</span>
                  Check popup window...
                </>
              ) : (
                'Create with Passkey'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
