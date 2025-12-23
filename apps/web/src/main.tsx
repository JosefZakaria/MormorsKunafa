import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import 'inter-ui/inter.css'
import './styles/variables.css'
import './styles/global.css'
import './styles/typography.css'
import './styles/animations.css'
import { LanguageProvider } from './contexts/LanguageContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
)

