import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AuthGate from './components/AuthGate.jsx'
import Runtime from './components/Runtime.jsx'

// URL ?mode=run 이면 실행(런타임) 화면, 아니면 편집 화면(로그인 게이트 경유)
const isRunMode = new URLSearchParams(window.location.search).get('mode') === 'run'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isRunMode ? <Runtime /> : <AuthGate />}
  </StrictMode>,
)
