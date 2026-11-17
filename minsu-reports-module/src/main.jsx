import React from 'react'
import ReactDOM from 'react-dom/client'
import StandaloneApp from './standalone/StandaloneApp.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StandaloneApp />
  </React.StrictMode>,
)
