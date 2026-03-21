import { useState } from 'react';
import type { StoredWalletAccount, TokenConfig } from '../../types';

interface SendPayload {
  recipient: string;
  amount: string;
  passphrase?: string;
}

interface SendTokenCardProps {
  token: TokenConfig;
  walletAccount: StoredWalletAccount | null;
  onSend: (payload: SendPayload) => void | Promise<void>;
  loading: boolean;
}

export function SendTokenCard({
  token,
  walletAccount,
  onSend,
  loading,
}: SendTokenCardProps): React.ReactElement {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const isSelfCustody = walletAccount?.mode === 'self-custody';

  return (
    <div className="balance-card">
      <div className="balance-header">
        <div className="token-info">
          <span className="token-symbol">Send {token.symbol}</span>
          <span className="token-name">
            {walletAccount ? walletAccount.address : 'Select a spending wallet to enable sends'}
          </span>
        </div>
      </div>

      <div className="send-mode-banner">
        {walletAccount ? (
          <>
            <strong>{isSelfCustody ? 'Self-custody wallet' : walletAccount.mode === 'smart-account' ? 'Smart wallet' : 'Connected wallet'}</strong>
            <span>
              {isSelfCustody
                ? 'Unlock with your wallet passphrase before sending.'
                : walletAccount.mode === 'smart-account'
                  ? 'Your passkey signs the User Operation for this transfer.'
                  : 'The connected wallet signs the transfer directly.'}
            </span>
          </>
        ) : (
          <>
            <strong>No spending wallet selected</strong>
            <span>Create or connect a wallet above before sending confidential tokens.</span>
          </>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="send-recipient">Recipient</label>
        <input
          id="send-recipient"
          type="text"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="Recipient address"
          className="holder-address-input"
        />
        <small className="hint">Send to the wallet that should receive the confidential token.</small>
      </div>

      <div className="form-group">
        <label htmlFor="send-amount">Amount</label>
        <input
          id="send-amount"
          type="text"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder={`Amount in ${token.symbol}`}
          className="holder-address-input"
        />
        <small className="hint">The amount is entered in token units, not wei.</small>
      </div>

      {isSelfCustody ? (
        <div className="form-group">
          <label htmlFor="send-passphrase">Wallet Passphrase</label>
          <input
            id="send-passphrase"
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="Unlock local wallet to send"
            className="holder-address-input"
          />
          <small className="hint">Required only for imported wallets stored in this extension.</small>
        </div>
      ) : null}

      <div className="balance-actions">
        <button
          className="btn-primary"
          disabled={loading || !walletAccount || !recipient || !amount}
          onClick={() => void onSend({ recipient, amount, passphrase: passphrase || undefined })}
          type="button"
        >
          {loading ? 'Sending...' : `Send ${token.symbol}`}
        </button>
      </div>
    </div>
  );
}
