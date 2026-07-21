import React from 'react';
import { createRoot } from 'react-dom/client';
import '@pauuu-demo/demo-shell';
import App from './App.jsx';
// Reuse the legacy stylesheet wholesale — same class names, same theming.
import './styles/styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <portfolio-demo-notice project-id="cn"></portfolio-demo-notice>
    <App />
  </React.StrictMode>,
);
