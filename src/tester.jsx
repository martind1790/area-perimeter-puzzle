import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './App.css';
import TesterApp from './TesterApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TesterApp />
  </StrictMode>
);
