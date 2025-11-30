// client/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx';


// 🔧 把 React 掛到全域，給那些期待「全域 React」的程式用
declare global {
  interface Window {
    React?: typeof React;
  }
}

if (typeof window !== 'undefined') {
  window.React = React;
}

ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
