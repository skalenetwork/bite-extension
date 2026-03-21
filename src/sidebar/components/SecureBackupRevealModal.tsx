import { useEffect, useState } from 'react';
import type { SecureBackupItem } from '../../types';

interface SecureBackupRevealModalProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  items?: SecureBackupItem[];
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function SecureBackupRevealModal({
  open,
  title = 'Back Up Secret',
  subtitle = 'Reveal and export the secret only after you are ready to store it safely.',
  items = [],
  confirmLabel = 'I Stored It',
  cancelLabel = 'Close',
  loading = false,
  onClose,
  onConfirm,
}: SecureBackupRevealModalProps): React.ReactElement | null {
  const [revealed, setRevealed] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRevealed(false);
      setCopiedIndex(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleCopy = async (value: string, index: number): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 1500);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Failed to copy secret.');
    }
  };

  const handleConfirm = async (): Promise<void> => {
    try {
      await onConfirm();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'Failed to confirm backup.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-large" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="info-box info-box-warning">
            <p><strong>Keep this secret offline</strong></p>
            <p>{subtitle}</p>
          </div>

          <button className="btn-secondary btn-sm secret-toggle" type="button" onClick={() => setRevealed((value) => !value)}>
            {revealed ? 'Hide secret' : 'Reveal secret'}
          </button>

          <div className="secret-list">
            {items.map((item, index) => (
              <div className="secret-item" key={`${item.label}-${index}`}>
                <div className="secret-item-header">
                  <span className="secret-item-label">{item.label}</span>
                  <button
                    type="button"
                    className="btn-copy btn-sm"
                    onClick={() => void handleCopy(item.value, index)}
                    disabled={!revealed}
                  >
                    {copiedIndex === index ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <code className={`secret-value ${revealed ? '' : 'secret-value-hidden'}`}>
                  {revealed ? item.value : 'Hidden until revealed'}
                </code>
                {item.description ? <small className="hint">{item.description}</small> : null}
              </div>
            ))}
          </div>

          {error ? <div className="error-message"><strong>Error:</strong> {error}</div> : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-primary" onClick={() => void handleConfirm()} disabled={loading}>
            {loading ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
