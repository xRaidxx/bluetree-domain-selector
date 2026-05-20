import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Home from './pages/Home.jsx'
import NewCampaign from './pages/NewCampaign.jsx'
import EditCampaign from './pages/EditCampaign.jsx'
import Results from './pages/Results.jsx'
import Admin from './pages/Admin.jsx'
import ImportModal from './components/ImportModal.jsx'

export default function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light')
  const [showImport, setShowImport] = useState(false)

  useEffect(() => {
    document.body.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return (
    <BrowserRouter>
      <div className="layout">
        <header className="topbar">
          <NavLink to="/" className="topbar-brand">BlueTree Domain Selector</NavLink>
          <nav className="topbar-nav">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Campaigns</NavLink>
            <NavLink to="/admin" className={({ isActive }) => isActive ? 'active' : ''}>Admin</NavLink>
            <button className="btn btn-primary btn-sm" onClick={() => setShowImport(true)}>+ Import CSV</button>
            <button
              onClick={() => setDark(d => !d)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: '0 4px', color: 'var(--gray-500)' }}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </nav>
          {showImport && <ImportModal onClose={() => setShowImport(false)} />}
        </header>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/campaign/new" element={<NewCampaign />} />
          <Route path="/campaign/:id/edit" element={<EditCampaign />} />
          <Route path="/campaign/:id/results" element={<Results />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
