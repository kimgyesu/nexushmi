import { useState, useEffect, useRef } from 'react'
import { nextValue, VIRTUAL_DEVICE } from '../data/tags'

// 값 시뮬레이터: 외부(App/Runtime)가 소유한 tags 상태의 "값"만 주기적으로 흔든다.
// 가상 태그는 디바이스 폴링 없이 내부 값 유지 — 자동 시뮬레이션 대상 제외.
export function useValueSimulator(setTags, paused = false, intervalMs = 2500) {
  const [updatedIds, setUpdatedIds] = useState(() => new Set())

  useEffect(() => {
    if (paused) return
    const timer = setInterval(() => {
      setTags(prev => {
        const changed = new Set()
        const next = prev.map(tag => {
          // 가상 태그는 자동 변동 없이 현재 값 유지 (HMI 입력/직접 쓰기로만 변경)
          if (tag.device === VIRTUAL_DEVICE) return tag
          const v = nextValue(tag)
          if (v !== tag.value) changed.add(tag.id)
          return { ...tag, value: v }
        })
        setUpdatedIds(changed)
        return next
      })
    }, intervalMs)
    return () => clearInterval(timer)
  }, [setTags, paused, intervalMs])

  // 하이라이트는 짧게만 유지
  const flashRef = useRef(null)
  useEffect(() => {
    if (updatedIds.size === 0) return
    if (flashRef.current) clearTimeout(flashRef.current)
    flashRef.current = setTimeout(() => setUpdatedIds(new Set()), 500)
    return () => { if (flashRef.current) clearTimeout(flashRef.current) }
  }, [updatedIds])

  return updatedIds
}
