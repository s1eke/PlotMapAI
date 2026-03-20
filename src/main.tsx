import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n/config'
import App from './App.tsx'
import { ensureDefaultTocRules } from './services/db'

ensureDefaultTocRules()

console.log(`PlotMapAI v${__APP_VERSION__}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
