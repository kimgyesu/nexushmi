// ════════════════════════════════════════════════════════════
//  화면 자동 검수 (Lint / QA)  — Level 2 서포터
//  결정론적 규칙 기반. AI 없이 즉시·오프라인 동작하며,
//  가능하면 기존 액션(op)으로 원클릭 수정안(fix)까지 제공한다.
// ════════════════════════════════════════════════════════════

// 태그가 필요한 컨트롤 타입 (없으면 값 표시/동작 불가)
const TAG_REQUIRED = ['switch', 'lamp', 'gauge', 'numeric', 'bar', 'symbol']
// 겹침 검사 대상 (라벨/박스/도형/선은 겹쳐도 정상)
const OVERLAP_TARGETS = ['switch', 'lamp', 'gauge', 'numeric', 'bar', 'symbol']

// 요소의 경계상자 — buildSystem/캔버스와 동일한 근사식
function elemBox(e) {
  if (e.type === 'groupbox') {
    const w = e.width || 200, h = e.height || 120
    return { left: e.x, top: e.y, right: e.x + w, bottom: e.y + h, w, h, center: false }
  }
  if (e.type === 'text') {
    const w = (String(e.label || '').length || 4) * (e.fontSize || 13) * 0.6
    const h = (e.fontSize || 13) + 4
    return { left: e.x, top: e.y, right: e.x + w, bottom: e.y + h, w, h, center: false }
  }
  if (e.type === 'wire') {
    const xs = (e.points || []).map(p => p[0]), ys = (e.points || []).map(p => p[1])
    if (!xs.length) return { left: e.x, top: e.y, right: e.x, bottom: e.y, w: 0, h: 0, center: false }
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys), w: 0, h: 0, center: false }
  }
  const hw = e.hw || 45, hh = e.hh || 22
  return { left: e.x - hw, top: e.y - hh, right: e.x + hw, bottom: e.y + hh, w: hw * 2, h: hh * 2, hw, hh, center: true }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// 두 사각형의 교집합 넓이
function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return x * y
}

/**
 * @param {object} ctx { elements, tags, bindings, resolution, screens }
 *   elements/bindings = 현재(활성) 화면. screens = 전체(미사용 태그 판정용).
 * @returns {Array} findings [{ id, severity, code, title, detail, elementIds, tagIds, fix }]
 *   severity: 'error' | 'warn' | 'info'
 *   fix: 액션(op) 배열 | null  (있으면 원클릭 자동수정 가능)
 */
export function inspectScreen(ctx = {}) {
  const {
    elements = [], tags = [], bindings = {},
    resolution = { w: 1280, h: 800 }, screens = [],
  } = ctx
  const W = resolution.w || 1280, H = resolution.h || 800
  const tagById = Object.fromEntries(tags.map(t => [t.id, t]))
  const effTag = e => bindings[e.id] ?? e.tagId ?? ''
  const findings = []
  let seq = 0
  const push = f => findings.push({ id: `f${++seq}`, elementIds: [], tagIds: [], fix: null, ...f })

  // ── 1. 태그 미바인딩 컨트롤 (error) ──
  for (const e of elements) {
    if (!TAG_REQUIRED.includes(e.type)) continue
    if (!effTag(e)) {
      push({
        severity: 'error', code: 'no-tag',
        title: `태그 미연결: ${e.type} "${e.label || e.id}"`,
        detail: '값을 표시하거나 동작하려면 태그가 필요합니다. 태그를 연결하세요.',
        elementIds: [e.id],
      })
    }
  }

  // ── 2. 깨진 바인딩 (error) — 존재하지 않는 태그 참조 ──
  for (const e of elements) {
    const tg = effTag(e)
    if (tg && !tagById[tg]) {
      push({
        severity: 'error', code: 'dangling-tag',
        title: `없는 태그 참조: "${e.label || e.id}" → ${tg}`,
        detail: `태그 [${tg}] 가 등록 목록에 없습니다. 태그를 만들거나 다른 태그로 교체하세요.`,
        elementIds: [e.id], tagIds: [tg],
      })
    }
  }

  // ── 3. 화면 밖 요소 (warn) — move 로 자동수정 ──
  for (const e of elements) {
    if (e.type === 'wire') continue
    const b = elemBox(e)
    if (b.left < 0 || b.top < 0 || b.right > W || b.bottom > H) {
      let nx, ny
      if (b.center) {
        nx = clamp(e.x, b.hw, W - b.hw)
        ny = clamp(e.y, b.hh, H - b.hh)
      } else {
        nx = clamp(e.x, 0, Math.max(0, W - b.w))
        ny = clamp(e.y, 0, Math.max(0, H - b.h))
      }
      const fix = (nx !== e.x || ny !== e.y)
        ? [{ op: 'move', elementId: e.id, x: Math.round(nx), y: Math.round(ny) }]
        : null
      push({
        severity: 'warn', code: 'off-screen',
        title: `화면 밖 요소: "${e.label || e.id}"`,
        detail: `해상도(${W}×${H}) 경계를 벗어났습니다.${fix ? ' 화면 안으로 이동합니다.' : ''}`,
        elementIds: [e.id], fix,
      })
    }
  }

  // ── 4. 요소 겹침 (info) — 컨트롤끼리 상당 부분 겹칠 때 ──
  const ctrls = elements.filter(e => OVERLAP_TARGETS.includes(e.type)).map(e => ({ e, b: elemBox(e) }))
  for (let i = 0; i < ctrls.length; i++) {
    for (let j = i + 1; j < ctrls.length; j++) {
      const a = ctrls[i], c = ctrls[j]
      const area = overlapArea(a.b, c.b)
      if (area <= 0) continue
      const minArea = Math.min(a.b.w * a.b.h, c.b.w * c.b.h) || 1
      if (area / minArea > 0.4) {
        push({
          severity: 'info', code: 'overlap',
          title: `겹침: "${a.e.label || a.e.id}" ↔ "${c.e.label || c.e.id}"`,
          detail: '두 컨트롤이 크게 겹칩니다. 클릭/표시가 가려질 수 있어 배치를 확인하세요.',
          elementIds: [a.e.id, c.e.id],
        })
      }
    }
  }

  // ── 5. 램프/스위치가 BIT 아닌 태그에 연결 (warn) ──
  for (const e of elements) {
    if (e.type !== 'lamp' && e.type !== 'switch') continue
    const t = tagById[effTag(e)]
    if (t && t.type !== 'BIT') {
      push({
        severity: 'warn', code: 'bit-expected',
        title: `${e.type} 인데 비트(BIT) 태그 아님: "${e.label || e.id}"`,
        detail: `연결된 태그 [${t.id}] 는 ${t.type} 형입니다. 램프/스위치는 보통 BIT(ON/OFF) 태그를 씁니다.`,
        elementIds: [e.id], tagIds: [t.id],
      })
    }
  }

  // ── 6. numeric 입력모드인데 범위 없음 (warn) — 태그 범위로 자동수정 ──
  for (const e of elements) {
    if (e.type !== 'numeric' || e.inputMode !== 'numeric') continue
    const hasMin = e.numMin != null && e.numMin !== ''
    const hasMax = e.numMax != null && e.numMax !== ''
    if (!hasMin || !hasMax) {
      const t = tagById[effTag(e)]
      const fix = t && t.min != null && t.max != null
        ? [{ op: 'setProp', elementId: e.id, numMin: t.min, numMax: t.max }]
        : null
      push({
        severity: 'warn', code: 'no-input-range',
        title: `입력 범위 미설정: "${e.label || e.id}"`,
        detail: fix
          ? `숫자 입력 상·하한이 없습니다. 태그 범위(${t.min}~${t.max})로 설정합니다.`
          : '숫자 입력 상·하한(numMin/numMax)이 없어 잘못된 값이 입력될 수 있습니다.',
        elementIds: [e.id], fix,
      })
    }
  }

  // ── 7. 중복 PLC 주소 (warn) — 같은 디바이스+주소를 여러 태그가 사용 ──
  const addrMap = {}
  for (const t of tags) {
    if (!t.address || t.device === '__virtual__' || !t.device) continue
    const key = `${t.device}::${t.address}`
    ;(addrMap[key] ||= []).push(t.id)
  }
  for (const [key, ids] of Object.entries(addrMap)) {
    if (ids.length > 1) {
      const [dev, addr] = key.split('::')
      push({
        severity: 'warn', code: 'dup-address',
        title: `주소 중복: ${dev} ${addr}`,
        detail: `태그 ${ids.join(', ')} 가 같은 주소를 씁니다. 의도한 게 아니면 주소를 나누세요.`,
        tagIds: ids,
      })
    }
  }

  // ── 8. 미사용 태그 (info) — 어느 화면에도 안 쓰임 ──
  const usedTags = new Set()
  const allScreens = screens.length ? screens : [{ elements, bindings }]
  for (const s of allScreens) {
    const sb = s.bindings || {}
    for (const e of (s.elements || [])) {
      const tg = sb[e.id] ?? e.tagId ?? ''
      if (tg) usedTags.add(tg)
      // 애니메이션/흐름 태그도 사용으로 간주
      for (const k of ['flowEnableTag', 'flowSpeedTag']) if (e[k]) usedTags.add(e[k])
    }
  }
  const unused = tags.filter(t => !usedTags.has(t.id))
  if (unused.length) {
    push({
      severity: 'info', code: 'unused-tag',
      title: `미사용 태그 ${unused.length}개`,
      detail: `어느 화면에서도 쓰이지 않는 태그: ${unused.slice(0, 8).map(t => t.id).join(', ')}${unused.length > 8 ? ' 외' : ''}`,
      tagIds: unused.map(t => t.id),
    })
  }

  // ── 9. 빈 라벨 텍스트 (info) ──
  for (const e of elements) {
    if (e.type === 'text' && !String(e.label || '').trim()) {
      push({
        severity: 'info', code: 'empty-text',
        title: '빈 텍스트 요소',
        detail: '내용이 없는 텍스트 라벨입니다. 문구를 넣거나 삭제하세요.',
        elementIds: [e.id],
      })
    }
  }

  // 심각도순 정렬
  const rank = { error: 0, warn: 1, info: 2 }
  findings.sort((a, b) => rank[a.severity] - rank[b.severity])
  return findings
}

// 검수 요약(개수)
export function inspectionSummary(findings) {
  const c = { error: 0, warn: 0, info: 0, fixable: 0 }
  for (const f of findings) {
    c[f.severity]++
    if (f.fix && f.fix.length) c.fixable++
  }
  return c
}

// ════════════════════════════════════════════════════════════
//  요소 진단 (Diagnosis) — Level 3 서포터
//  사용자가 지목한 한 요소의 연결 사슬을 역추적해 "안 되는 원인"을 찾는다.
//  요소 → 바인딩 → 태그 → 디바이스/주소 → 시뮬 상태
// ════════════════════════════════════════════════════════════
const DIAG_CTRL = ['switch', 'lamp', 'gauge', 'numeric', 'bar', 'symbol']

export function diagnoseElement(el, ctx = {}) {
  const { tags = [], bindings = {}, resolution = { w: 1280, h: 800 } } = ctx
  const W = resolution.w || 1280, H = resolution.h || 800
  const tagById = Object.fromEntries(tags.map(t => [t.id, t]))
  const findings = []
  let seq = 0
  const push = f => findings.push({ id: `dg${++seq}`, elementIds: [el.id], tagIds: [], fix: null, ...f })
  if (!el) return findings

  const name = el.label || el.id
  const eff = bindings[el.id] ?? el.tagId ?? ''
  const t = eff ? tagById[eff] : null

  // 1) 화면 밖 (모든 타입) — move 자동수정
  if (el.type !== 'wire') {
    const b = elemBox(el)
    if (b.left < 0 || b.top < 0 || b.right > W || b.bottom > H) {
      let nx, ny
      if (b.center) { nx = clamp(el.x, b.hw, W - b.hw); ny = clamp(el.y, b.hh, H - b.hh) }
      else { nx = clamp(el.x, 0, Math.max(0, W - b.w)); ny = clamp(el.y, 0, Math.max(0, H - b.h)) }
      push({
        severity: 'warn', code: 'off-screen',
        title: '화면 밖으로 나가 안 보이는 원인', detail: `"${name}"이 해상도(${W}×${H}) 밖에 있습니다. 화면 안으로 이동합니다.`,
        fix: (nx !== el.x || ny !== el.y) ? [{ op: 'move', elementId: el.id, x: Math.round(nx), y: Math.round(ny) }] : null,
      })
    }
  }

  // 2) 컨트롤: 태그 사슬 추적
  if (DIAG_CTRL.includes(el.type)) {
    if (!eff) {
      push({ severity: 'error', code: 'no-tag', title: '값이 안 뜨는 원인: 태그 미연결', detail: `"${name}"에 태그가 연결돼 있지 않습니다. 표시·동작하려면 태그를 연결하세요.` })
    } else if (!t) {
      push({ severity: 'error', code: 'dangling', title: '없는 태그를 참조 중', detail: `"${name}" → [${eff}] 태그가 등록 목록에 없습니다. 태그를 만들거나 다른 태그로 교체하세요.`, tagIds: [eff] })
    } else {
      if (t.device === '__virtual__') {
        push({ severity: 'info', code: 'virtual', title: '가상(시뮬) 태그라 실제 값이 안 옴', detail: `[${t.id}]는 가상 태그입니다. 실제 PLC 값이 아니라 시뮬레이션 값만 표시됩니다. 실제 값을 보려면 실태그+주소로 바꾸세요.`, tagIds: [t.id] })
      } else if (!t.address) {
        push({ severity: 'warn', code: 'no-address', title: '실태그인데 주소가 비어 값을 못 읽음', detail: `[${t.id}]는 디바이스(${t.device})에 연결됐지만 주소(address)가 없습니다. 태그 주소를 지정하세요.`, tagIds: [t.id] })
      }
      if ((el.type === 'lamp' || el.type === 'switch') && t.type !== 'BIT') {
        push({ severity: 'warn', code: 'bit-expected', title: `${el.type}인데 BIT 태그가 아님`, detail: `[${t.id}]는 ${t.type}형입니다. 램프/스위치는 보통 BIT(0/1)를 씁니다. ON/OFF가 이상하면 이 때문일 수 있어요.`, tagIds: [t.id] })
      }
      if (el.type === 'numeric' && t.type === 'BIT') {
        push({ severity: 'info', code: 'numeric-bit', title: '숫자 표시기인데 BIT 태그', detail: `[${t.id}]는 BIT(0/1)라 0 아니면 1만 표시됩니다. WORD/FLOAT 태그가 맞는지 확인하세요.`, tagIds: [t.id] })
      }
    }
    if (el.type === 'switch' && el.behavior === 'momentary') {
      push({ severity: 'info', code: 'momentary', title: '눌러도 안 켜져 보이는 이유: momentary', detail: '이 스위치는 momentary라 손을 떼면 OFF됩니다. 계속 ON으로 유지하려면 toggle로 바꾸세요.', fix: [{ op: 'setProp', elementId: el.id, behavior: 'toggle' }] })
    }
  }

  // 3) 도형/심볼 애니메이션인데 태그 없음 → 안 움직임
  if ((el.type === 'shape' || el.type === 'symbol') && el.animType && !eff) {
    push({ severity: 'warn', code: 'anim-no-tag', title: '애니메이션이 안 움직이는 원인: 태그 미지정', detail: `animType=${el.animType}인데 연결된 태그가 없어 동작하지 않습니다. 태그를 연결하세요.` })
  }

  if (!findings.length) {
    push({ severity: 'info', code: 'ok', title: '뚜렷한 문제를 못 찾음', detail: `"${name}"에서 명확한 원인을 찾지 못했습니다. 어떤 증상인지(예: "값이 0에서 안 변해") 알려주고 "AI 심층 진단"을 눌러보세요.` })
  }
  const rank = { error: 0, warn: 1, info: 2 }
  findings.sort((a, b) => rank[a.severity] - rank[b.severity])
  return findings
}
