import React from 'react';
import { createRoot } from 'react-dom/client';
import WalletApp from './WalletApp';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Sidebar root element not found.');
}

const root = createRoot(container);
root.render(React.createElement(WalletApp));
