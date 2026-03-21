import { ethers } from 'ethers';
import type { TransactionStatus } from '../types';
import { BITE_SANDBOX_CONFIG } from './bite';

export interface TransactionListener {
  onStatusUpdate: (status: TransactionStatus) => void;
  onConfirm?: () => void;
  onError?: (error: Error) => void;
}

export class TransactionService {
  private listeners = new Map<string, TransactionListener[]>();
  private pollingIntervals = new Map<string, number>();

  async sendWithStatus(
    txHash: string,
    listener: TransactionListener
  ): Promise<void> {
    this.addListener(txHash, listener);

    // Start with pending status
    const initialStatus: TransactionStatus = {
      hash: txHash,
      status: 'pending',
    };
    this.notifyListeners(txHash, initialStatus);

    // Start polling
    this.startPolling(txHash);
  }

  private addListener(txHash: string, listener: TransactionListener): void {
    if (!this.listeners.has(txHash)) {
      this.listeners.set(txHash, []);
    }
    this.listeners.get(txHash)!.push(listener);
  }

  private removeListener(txHash: string): void {
    this.listeners.delete(txHash);
    this.stopPolling(txHash);
  }

  private startPolling(txHash: string): void {
    if (this.pollingIntervals.has(txHash)) return;

    const poll = async () => {
      try {
        const status = await this.checkTransactionStatus(txHash);
        this.notifyListeners(txHash, status);

        if (status.status === 'confirmed' || status.status === 'failed') {
          this.stopPolling(txHash);
        }
      } catch {
        // Continue polling on error
      }
    };

    // Poll every 3 seconds
    const intervalId = window.setInterval(poll, 3000);
    this.pollingIntervals.set(txHash, intervalId);

    // Initial check
    void poll();
  }

  private stopPolling(txHash: string): void {
    const intervalId = this.pollingIntervals.get(txHash);
    if (intervalId) {
      window.clearInterval(intervalId);
      this.pollingIntervals.delete(txHash);
    }
  }

  private async checkTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const provider = new ethers.JsonRpcProvider(BITE_SANDBOX_CONFIG.rpcUrl);

    try {
      const receipt = await provider.getTransactionReceipt(txHash);

      if (!receipt) {
        return {
          hash: txHash,
          status: 'pending',
        };
      }

      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber + 1;

      if (!receipt.status) {
        return {
          hash: txHash,
          status: 'failed',
          confirmations,
          error: 'Transaction execution failed',
        };
      }

      return {
        hash: txHash,
        status: 'confirmed',
        confirmations,
      };
    } catch {
      return {
        hash: txHash,
        status: 'pending',
      };
    }
  }

  private notifyListeners(txHash: string, status: TransactionStatus): void {
    const listeners = this.listeners.get(txHash);
    if (!listeners) return;

    listeners.forEach((listener) => {
      try {
        listener.onStatusUpdate(status);

        if (status.status === 'confirmed') {
          listener.onConfirm?.();
        } else if (status.status === 'failed' && status.error) {
          listener.onError?.(new Error(status.error));
        }
      } catch {
        // Silent fail for listener errors
      }
    });

    // Clean up confirmed/failed transactions
    if (status.status === 'confirmed' || status.status === 'failed') {
      this.removeListener(txHash);
    }
  }

  getExplorerUrl(txHash: string): string {
    return `${BITE_SANDBOX_CONFIG.explorerUrl}/tx/${txHash}`;
  }

  stopAllPolling(): void {
    for (const [txHash] of this.pollingIntervals) {
      this.stopPolling(txHash);
    }
    this.listeners.clear();
  }
}

export const transactionService = new TransactionService();
