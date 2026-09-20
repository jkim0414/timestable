import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { inject } from '@vercel/analytics'
import App from './App'
import './styles.css'

registerSW({ immediate: true })
inject({ mode: import.meta.env.PROD ? 'production' : 'development' })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
