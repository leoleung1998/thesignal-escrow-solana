import { Buffer } from 'buffer';
(window as any).Buffer = Buffer;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WalletProviderWrapper } from './components/WalletProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WalletProviderWrapper>
        <App />
      </WalletProviderWrapper>
    </ErrorBoundary>
  </React.StrictMode>,
);
