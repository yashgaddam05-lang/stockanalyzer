import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { StocksProvider } from '@/components/data/StocksProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StocksProvider>
          <App />
        </StocksProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
