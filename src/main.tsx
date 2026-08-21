import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { assertContentGraph } from './content/contentGraph';
import './index.css';

assertContentGraph();

const root = document.getElementById('root');
if (!root) throw new Error('No #root element — check index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
