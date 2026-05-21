import React, { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesignReviewShell } from '../lib/design-review.jsx';
import { installOmeletteBridge } from './omelette.js';
import { loadActiveDesign } from './designLoader.js';

installOmeletteBridge();

function PreviewRoot() {
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadActiveDesign()
      .then(({ name, Component }) => {
        if (!cancelled) setState({ status: 'ready', name, Component });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#666',
        }}
      >
        Loading design…
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        style={{
          height: '100vh',
          padding: 32,
          fontFamily: 'ui-monospace, monospace',
          fontSize: 14,
          color: '#c96442',
          whiteSpace: 'pre-wrap',
        }}
      >
        {state.message}
      </div>
    );
  }

  const { Component, name } = state;
  return (
    <DesignReviewShell designName={name}>
      <Component key={name} designName={name} />
    </DesignReviewShell>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PreviewRoot />
  </StrictMode>,
);
