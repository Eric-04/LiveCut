import { useState } from 'react'
import './App.css'
import Globe from './components/Globe'

function MainPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="main-page">
      <h1>LiveCut — Main Page</h1>
      <p>This is the main app page. Replace with your real content.</p>
      <button onClick={onBack}>Back</button>
    </div>
  )
}

function App() {
  const [page, setPage] = useState<'home' | 'main'>('home')

  return (
    <div className="app-root">
      {page === 'home' ? (
        <div className="globe-wrap">
          <Globe onCityClick={() => setPage('main')} />
        </div>
      ) : (
        <MainPage onBack={() => setPage('home')} />
      )}
    </div>
  )
}

export default App
