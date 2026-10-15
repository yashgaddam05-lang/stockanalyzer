import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from '@/App';
import { StocksProvider } from '@/components/data/StocksProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <StocksProvider>
        <App />
      </StocksProvider>
    </BrowserRouter>
  </StrictMode>
);
