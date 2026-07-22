import { useEffect, useRef, useState } from 'react'
import { getHealth, postHistory } from '../utils/api'

// 주기적으로 현재 태그 스냅샷을 로컬 서버 이력(SQLite)으로 전송한다.
// 서버가 없으면 조용히 비활성(저장 안 함). 반환: { connected, lastSavedAt, savedCount }
export function useHistorian(tags, { enabled = true, intervalMs = 2500 } = {}) {
  const tagsRef = useRef(tags)
  tagsRef.current = tags

  const [connected, setConnected] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState(null)

  // 서버 연결 상태 확인
  useEffect(() => {
    let alive = true
    getHealth().then(h => { if (alive) setConnected(!!h?.ok) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let stopped = false

    const timer = setInterval(async () => {
      const snapshot = tagsRef.current
      if (!snapshot || snapshot.length === 0) return
      const res = await postHistory(snapshot)
      if (stopped) return
      if (res?.ok) {
        setConnected(true)
        setSavedCount(c => c + (res.inserted || 0))
        setLastSavedAt(Date.now())
      } else {
        setConnected(false)
      }
    }, intervalMs)

    return () => { stopped = true; clearInterval(timer) }
  }, [enabled, intervalMs])

  return { connected, savedCount, lastSavedAt }
}
