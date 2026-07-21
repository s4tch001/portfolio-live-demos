import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@pauuu-demo/demo-shell';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <portfolio-demo-notice project-id="rcmi"></portfolio-demo-notice>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
