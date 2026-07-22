// 인증 게이트 — 로그인 여부에 따라 Login / App 렌더 + 클라우드 프로젝트 동기화
//   · Firebase 미설정(config 없음) → 로그인 없이 기존 로컬 모드로 App 렌더
//   · 로그인 시: 클라우드 프로젝트를 내려받아 localStorage에 채운 뒤 App 마운트 (App은 loadProject로 읽음)
//   · 저장 시: project.js의 saveProject가 등록된 cloudSaver(디바운스)로 Firestore에 업로드
import { useState, useEffect } from 'react'
import App from '../App.jsx'
import Login from './Login'
import Landing from './Landing'
import { useAuth, doSignOut } from '../auth/useAuth'
import { firebaseEnabled } from '../firebase'
import { loadCloudProject, saveCloudProject } from '../data/cloudProject'
import { setCloudSaver, PROJECT_KEY } from '../data/project'

function Splash({ text }) {
  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center gap-3" style={{ background: '#070b12' }}>
      <span className="text-[18px] font-extrabold"><span className="text-[#4a9eff]">Nexus</span><span className="text-[#e2e8f0]">HMI</span></span>
      <span className="text-[12px] text-[#64748b]">{text}</span>
    </div>
  )
}

function UserChip({ user }) {
  return (
    <div className="fixed z-[300] bottom-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px]"
      style={{ background: 'rgba(15,21,32,0.92)', border: '1px solid #1e2a3f', color: '#94a3b8', boxShadow: '0 4px 16px #0006' }}>
      <span className="max-w-[160px] truncate">{user.email || user.displayName || '로그인됨'}</span>
      <button onClick={doSignOut} className="font-bold text-[#f87171] hover:text-[#fca5a5]">로그아웃</button>
    </div>
  )
}

export default function AuthGate() {
  const { user, loading } = useAuth()
  const [ready, setReady] = useState(!firebaseEnabled) // 미설정이면 즉시 준비됨(로컬 모드)
  const [entering, setEntering] = useState(false)      // 랜딩 → 로그인 화면 전환

  useEffect(() => {
    if (!firebaseEnabled || !user) return
    let alive = true
    let timer = null
    ;(async () => {
      const cloud = await loadCloudProject(user.uid)
      if (!alive) return
      if (cloud) { try { localStorage.setItem(PROJECT_KEY, JSON.stringify(cloud)) } catch { /* noop */ } }
      // 저장 훅 등록 (1.5초 디바운스 → Firestore 쓰기 최소화)
      setCloudSaver(project => { clearTimeout(timer); timer = setTimeout(() => saveCloudProject(user.uid, project), 1500) })
      setReady(true)
    })()
    return () => { alive = false; clearTimeout(timer); setCloudSaver(null) }
  }, [user])

  if (!firebaseEnabled) return <App />
  if (loading) return <Splash text="로딩 중…" />
  if (!user) return entering ? <Login onBack={() => setEntering(false)} /> : <Landing onStart={() => setEntering(true)} />
  if (!ready) return <Splash text="내 작업 불러오는 중…" />
  return <App key={user.uid} />
}
