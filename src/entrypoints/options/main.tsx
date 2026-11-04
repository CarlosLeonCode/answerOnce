import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsApp } from '../../ui/options/OptionsApp';
import '../../ui/shared/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OptionsApp />
  </StrictMode>,
);
