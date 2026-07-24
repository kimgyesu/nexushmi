// 활성 알람 스캔 — 태그의 명시적 알람 설정으로 현재 활성 알람 목록 생성
//   · 아날로그: alarmHigh(상한)·alarmLow(하한), 상한 90% 근접=주의
//   · BIT: alarmBit('on'=1일때 알람 / 'off'=0일때 알람)로 명시 지정한 것만 (스위치·램프와 구분)
//   · 구역(area): tag.alarmArea 우선, 없으면 tag.utility(그룹)

export function tagAlarmArea(t) {
  return String(t?.alarmArea || t?.utility || '').trim()
}

// 빈값('')을 0으로 오인하지 않게 — 값이 있을 때만 숫자로
const numOrNaN = v => (v === '' || v == null) ? NaN : Number(v)

// 태그가 알람 대상인지 (구역 목록·필터용)
export function hasAlarmConfig(t) {
  if (!t) return false
  if (t.type === 'BIT') return t.alarmBit === 'on' || t.alarmBit === 'off'
  return Number.isFinite(numOrNaN(t.alarmHigh)) || Number.isFinite(numOrNaN(t.alarmLow))
}

// 현재 활성 알람 목록 — [{ tagId, area, desc, sev:'경보'|'주의', text, hint }]
export function scanAlarms(tags = []) {
  const out = []
  for (const t of tags) {
    const area = tagAlarmArea(t)
    const desc = t.desc || t.id
    const unit = t.unit || ''
    if (t.type === 'BIT') {
      // 명시적으로 알람 지정한 BIT만 (스위치·램프는 제외)
      const v = Number(t.value)
      if (t.alarmBit === 'on' && v === 1)
        out.push({ tagId: t.id, area, desc, sev: '경보', text: `${desc} 발생 (ON)`, hint: t.alarmHint || '' })
      else if (t.alarmBit === 'off' && v === 0)
        out.push({ tagId: t.id, area, desc, sev: '경보', text: `${desc} 발생 (OFF)`, hint: t.alarmHint || '' })
      continue
    }
    const v = Number(t.value) || 0
    const hi = numOrNaN(t.alarmHigh), lo = numOrNaN(t.alarmLow)
    if (Number.isFinite(hi)) {
      if (v >= hi) out.push({ tagId: t.id, area, desc, sev: '경보', text: `${desc} ${v}${unit} — 상한 ${hi}${unit} 초과`, hint: t.alarmHint || '' })
      else if (v >= hi * 0.9) out.push({ tagId: t.id, area, desc, sev: '주의', text: `${desc} ${v}${unit} — 상한 근접`, hint: t.alarmHint || '' })
    }
    if (Number.isFinite(lo) && v <= lo)
      out.push({ tagId: t.id, area, desc, sev: '경보', text: `${desc} ${v}${unit} — 하한 ${lo}${unit} 미만`, hint: t.alarmHint || '' })
  }
  // 경보 먼저
  out.sort((a, b) => (a.sev === '경보' ? 0 : 1) - (b.sev === '경보' ? 0 : 1))
  return out
}

// 알람 설정된 태그들의 구역 목록 (드롭다운용)
export function alarmAreas(tags = []) {
  const s = new Set()
  for (const t of tags) if (hasAlarmConfig(t)) { const a = tagAlarmArea(t); if (a) s.add(a) }
  return [...s].sort()
}
