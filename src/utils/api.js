// 로컬 서버(/api) 호출 유틸 — 서버가 없으면 조용히 실패(null) 처리
async function safe(fn) {
  try { return await fn() } catch { return null }
}

export async function getHealth() {
  return safe(async () => {
    const r = await fetch('/api/health')
    if (!r.ok) throw new Error()
    return r.json()
  })
}

// 현재 태그 스냅샷을 이력으로 전송
export async function postHistory(tags, ts) {
  return safe(async () => {
    const r = await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ts,
        tags: tags.map(t => ({ id: t.id, value: t.value, device: t.device, utility: t.utility })),
      }),
    })
    if (!r.ok) throw new Error()
    return r.json()
  })
}

// 이력 조회 (그래프/요약용)
export async function getHistory({ tagId, from, to, agg, bucket } = {}) {
  return safe(async () => {
    const q = new URLSearchParams()
    if (tagId) q.set('tagId', Array.isArray(tagId) ? tagId.join(',') : tagId)
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    if (agg) q.set('agg', agg)
    if (bucket) q.set('bucket', bucket)
    const r = await fetch(`/api/history?${q.toString()}`)
    if (!r.ok) throw new Error()
    return r.json()
  })
}

// 이벤트/알람 로그 기록
export async function postEvents(events) {
  return safe(async () => {
    const r = await fetch('/api/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: Array.isArray(events) ? events : [events] }),
    })
    if (!r.ok) throw new Error()
    return r.json()
  })
}

// 이벤트/알람 로그 검색
export async function getEvents({ from, to, type, level, tagId, q, limit } = {}) {
  return safe(async () => {
    const p = new URLSearchParams()
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (type) p.set('type', type)
    if (level) p.set('level', level)
    if (tagId) p.set('tagId', tagId)
    if (q) p.set('q', q)
    if (limit) p.set('limit', limit)
    const r = await fetch(`/api/events?${p.toString()}`)
    if (!r.ok) throw new Error()
    return r.json()
  })
}

// 편집창 Claude — 서버 상태/키 확인
export async function getClaudeHealth() {
  return safe(async () => {
    const r = await fetch('/api/claude/health')
    if (!r.ok) throw new Error()
    return r.json()
  })
}

// 편집창 Claude — 메시지 전송 (서버 프록시 경유)
export async function postClaude({ system, messages, max_tokens } = {}) {
  const r = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens }),
  })
  const data = await r.json().catch(() => ({ ok: false, error: '응답 파싱 실패' }))
  if (!r.ok || !data.ok) throw new Error(data.error || `서버 오류 ${r.status}`)
  return data
}

// ── LS XGB Cnet PLC ──
export async function plcPorts() {
  return safe(async () => {
    const r = await fetch('/api/plc/ports')
    if (!r.ok) throw new Error()
    return r.json()
  })
}

export async function plcStatus() {
  return safe(async () => {
    const r = await fetch('/api/plc/status')
    if (!r.ok) throw new Error()
    return r.json()
  })
}

export async function plcConnect(cfg) {
  const r = await fetch('/api/plc/connect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg),
  })
  const d = await r.json().catch(() => ({ ok: false, error: '응답 오류' }))
  if (!r.ok || !d.ok) throw new Error(d.error || `서버 오류 ${r.status}`)
  return d
}

export async function plcDisconnect() {
  return safe(async () => {
    const r = await fetch('/api/plc/disconnect', { method: 'POST' })
    return r.json()
  })
}

export async function plcRead(devices) {
  const r = await fetch('/api/plc/read', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ devices }),
  })
  const d = await r.json().catch(() => ({ ok: false, error: '응답 오류' }))
  if (!r.ok || !d.ok) throw new Error(d.error || `서버 오류 ${r.status}`)
  return d
}

export async function plcWrite(device, value, type = 'WORD') {
  const r = await fetch('/api/plc/write', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device, value, type }),
  })
  const d = await r.json().catch(() => ({ ok: false, error: '응답 오류' }))
  if (!r.ok || !d.ok) throw new Error(d.error || `서버 오류 ${r.status}`)
  return d
}

// 프로젝트 서버 저장 (localStorage와 병행)
export async function saveProjectToServer(project) {
  return safe(async () => {
    const r = await fetch('/api/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    })
    if (!r.ok) throw new Error()
    return r.json()
  })
}

// ── 학습 라이브러리 ──
// 빌드/실행 시 프로젝트 패턴을 라이브러리(vault)에 누적 저장
export async function captureLearning(project, thumbnailSvg) {
  return safe(async () => {
    const r = await fetch('/api/learning/capture', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, thumbnailSvg }),
    })
    if (!r.ok) throw new Error()
    return r.json()
  })
}
// AI 주입용 학습 프로파일(압축 요약) 조회
export async function getLearningProfile() {
  return safe(async () => {
    const r = await fetch('/api/learning/profile')
    if (!r.ok) throw new Error()
    return r.json()
  })
}
// vault 경로 조회/설정
export async function getLearningConfig() {
  return safe(async () => { const r = await fetch('/api/learning/config'); if (!r.ok) throw new Error(); return r.json() })
}
export async function setLearningConfig(vaultDir) {
  return safe(async () => {
    const r = await fetch('/api/learning/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vaultDir }),
    })
    if (!r.ok) throw new Error(); return r.json()
  })
}
