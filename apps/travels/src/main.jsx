import React from 'react';
import ReactDOM from 'react-dom/client';
import '@pauuu-demo/demo-shell';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <portfolio-demo-notice project-id="travels"></portfolio-demo-notice>
    <App />
  </React.StrictMode>,
);
