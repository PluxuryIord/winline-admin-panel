import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import Hostess from './pages/Hostess/Hostess.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Hostess — полностью изолирована от AuthProvider */}
        <Route path="/hostess" element={<Hostess />} />
        {/* Всё остальное — через AuthProvider */}
        <Route path="*" element={
          <AuthProvider>
            <App />
          </AuthProvider>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
