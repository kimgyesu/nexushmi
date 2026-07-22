// 런타임 데이터 로거 — 실행 중 태그 이력을 기록 (범용 보고서의 실데이터 근거)
// pv/power/env = 시계열 링버퍼, equipment = ON/OFF 엣지, setpoint = 변경 이력
import { tagRole } from '../data/tagRoles'

export function createLogger({ capacity = 5000 } = {}) {
  const series = {}   // tagId -> [{t, v}]
  const events = []   // {t, tagId, v}  (equipment 엣지)
  const spLog = []    // {t, tagId, v}  (setpoint 변경)
  const last = {}
  let started = null

  function sample(tags, tNow) {
    if (started == null) started = tNow
    for (const t of tags) {
      const role = tagRole(t)
      if (role === 'equipment') {
        const v = Number(t.value) ? 1 : 0
        if (last[t.id] !== undefined && last[t.id] !== v) events.push({ t: tNow, tagId: t.id, v })
        last[t.id] = v
      } else if (role === 'setpoint') {
        const v = Number(t.value)
        if (last[t.id] !== undefined && last[t.id] !== v) spLog.push({ t: tNow, tagId: t.id, v })
        last[t.id] = v
      } else {
        const arr = series[t.id] || (series[t.id] = [])
        arr.push({ t: tNow, v: Number(t.value) })
        if (arr.length > capacity) arr.shift()
      }
    }
  }

  function getData({ rangeMs } = {}) {
    const cutoff = rangeMs ? Date.now() - rangeMs : 0
    const out = {}
    for (const id in series) out[id] = rangeMs ? series[id].filter(p => p.t >= cutoff) : series[id]
    return {
      start: started,
      series: out,
      events: rangeMs ? events.filter(e => e.t >= cutoff) : events.slice(),
      spLog: rangeMs ? spLog.filter(e => e.t >= cutoff) : spLog.slice(),
    }
  }

  function size() { let n = 0; for (const id in series) n = Math.max(n, series[id].length); return n }

  return { sample, getData, size }
}
