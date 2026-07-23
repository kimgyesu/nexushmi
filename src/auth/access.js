// 사용자 권한(플랜) — 오너(관리자)는 모든 제한 무시, 무료 유저는 제한 적용
import { firebaseEnabled } from '../firebase'
import { useAuth } from './useAuth'

// 오너(관리자) 이메일 — 이 계정들은 전체 기능 무제한
const OWNER_EMAILS = [
  'gyesu8111@gmail.com',
]

export function isOwner(user) {
  if (!firebaseEnabled) return true // 로컬 개발 모드는 제한 없음
  return !!user && OWNER_EMAILS.includes(String(user.email || '').toLowerCase())
}

// 무료 유저 제한 (plc: 실장비 PLC 연결 — 프리미엄 기능. 편집·시뮬레이션은 무료)
const FREE_PLAN = { owner: false, maxProjects: 1, ai: false, runtimeMinutes: 10, plc: false }
const OWNER_PLAN = { owner: true, maxProjects: Infinity, ai: true, runtimeMinutes: Infinity, plc: true }

export function getPlan(user) {
  return isOwner(user) ? OWNER_PLAN : FREE_PLAN
}

// 컴포넌트에서: const access = useAccess()  → { owner, ai, maxProjects, runtimeMinutes, loading, user }
export function useAccess() {
  const { user, loading } = useAuth()
  return { ...getPlan(user), loading, user }
}
