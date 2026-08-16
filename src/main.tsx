import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Application root element was not found.')
}

createRoot(root).render(
  <StrictMode>
    {/* History-API routing, not hash routing: Supabase delivers recovery and
        magic-link tokens in the URL hash, which a hash router would consume. */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
