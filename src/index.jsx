import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { lockViewport } from './lib/viewport.js';

// One fixed screen: no pinch zoom, no sideways dragging.
lockViewport();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
