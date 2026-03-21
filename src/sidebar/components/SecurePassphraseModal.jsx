import React, { useEffect, useState } from 'react';

export function SecurePassphraseModal({
  open,
  title = 'Enter Passphrase',
  description = 'This passphrase unlocks the local secret for a secure action.',
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  hint = 'The passphrase is never shown in the UI.',
  initialValue = '',
  requireConfirm = false,
  loading = false,
  onClose,
  onConfirm,
}) {
  const [passphrase, setPassphrase] = useState(initialValue);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setPassphrase(initialValue);
      setConfirmation('');
      setError(null);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!passphrase.trim()) {
      setError('Passphrase is required.');
      return;
    }

    if (requireConfirm && passphrase !== confirmation) {
      setError('Passphrases do not match.');
      return;
    }

    try {
      await onConfirm(passphrase.trim());
    } catch (submitError) {
      setError(submitError.message || 'Failed to continue.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="info-box info-box-subtle">
            <p><strong>Secure unlock</strong></p>
            <p>{description}</p>
          </div>

          <div className="form-group">
            <label htmlFor="secure-passphrase">Passphrase</label>
            <input
              id="secure-passphrase"
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Enter passphrase"
              autoComplete="current-password"
            />
            <small className="hint">{hint}</small>
          </div>

          {requireConfirm && (
            <div className="form-group">
              <label htmlFor="secure-passphrase-confirm">Confirm Passphrase</label>
              <input
                id="secure-passphrase-confirm"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Repeat passphrase"
                autoComplete="off"
              />
            </div>
          )}

          {error && <div className="error-message"><strong>Error:</strong> {error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              {cancelLabel}
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Working...' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
