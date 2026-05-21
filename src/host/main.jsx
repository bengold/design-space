import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import HostApp from './HostApp.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HostApp />
  </StrictMode>,
);
