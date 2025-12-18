// Global Error Handler for debugging blank screen issues
window.onerror = function (message, source, lineno, colno, error) {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="color:red; padding:20px; font-family:monospace;">
      <h3>⚠️ Runtime Error</h3>
      <p>${message}</p>
      <p>File: ${source}:${lineno}:${colno}</p>
      <pre>${error?.stack || ''}</pre>
    </div>`;
  }
};

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
