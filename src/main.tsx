import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider.tsx';
import { AuthProvider } from './components/AuthProvider.tsx';
import { Toaster } from 'sonner';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster position="top-right" richColors />
    </ThemeProvider>
  </StrictMode>,
);
