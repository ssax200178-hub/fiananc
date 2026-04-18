import React from 'react';
import ReactDOM from 'react-dom/client';
import './src/index.css';
import './src/styles/premium.css';
import './src/styles/colors.css';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import App from './App';

// Register AG Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

import { BrowserRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <SnackbarProvider maxSnack={3} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SnackbarProvider>
  </React.StrictMode>
);