import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { preloadPage } from './app/pages.tsx'
import { getLocation } from './app/router.ts'

// Fetch the current page's code alongside the data (index.html preloads the CSVs), not after it.
preloadPage(getLocation().path)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
