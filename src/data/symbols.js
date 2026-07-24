// 커스텀 심볼(부품) 라이브러리 — 직접 만든 아이콘을 저장해 재사용
// 전역(localStorage)에 보관하여 프로젝트 간 재사용, 프로젝트 저장 시 임베드(이식성)
const GLOBAL_KEY = 'nexushmi.symbols.v1'

// 래스터 이미지 심볼 (기존)
export const DEFAULT_PART = '기타'

export function makeSymbol(p = {}) {
  return {
    id: p.id || ('sym_' + Math.random().toString(36).slice(2, 8)),
    kind: 'image',
    name: String(p.name || '심볼').slice(0, 30),
    category: String(p.category || DEFAULT_PART).slice(0, 20),  // 파트(분류)
    on: p.on || '',     // dataURL (ON 또는 단일 이미지)
    off: p.off || '',   // dataURL (OFF) — 있으면 2상태(BIT)
    w: Number(p.w) || 48,
    h: Number(p.h) || 48,
  }
}

// SVG 심볼 — layers: [{id, animType, partName, index, dataType}]
export function makeSvgSymbol(p = {}) {
  return {
    id: p.id || ('svg_' + Math.random().toString(36).slice(2, 8)),
    kind: 'svg',
    name: String(p.name || 'SVG심볼').slice(0, 30),
    category: String(p.category || DEFAULT_PART).slice(0, 20),  // 파트(분류)
    svgContent: p.svgContent || '',   // 원본 SVG 텍스트
    layers: Array.isArray(p.layers) ? p.layers : [],  // 파싱된 레이어 목록
    w: Number(p.w) || 80,
    h: Number(p.h) || 80,
  }
}

export const isTwoState = s => !!(s && s.kind !== 'svg' && s.off)
export const isSvgSymbol = s => !!(s && s.kind === 'svg')

export function loadGlobalSymbols() {
  try {
    const a = JSON.parse(localStorage.getItem(GLOBAL_KEY) || '[]')
    return Array.isArray(a) ? a : []
  } catch { return [] }
}

export function saveGlobalSymbols(list) {
  // 내장(std_) 심볼은 코드에서 관리하므로 저장에서 제외
  const user = (Array.isArray(list) ? list : []).filter(s => !String(s.id).startsWith('std_'))
  try { localStorage.setItem(GLOBAL_KEY, JSON.stringify(user)) } catch { /* 용량 초과 무시 */ }
}

// ── 파트(분류) 목록 — 심볼 없는 빈 파트도 유지하기 위해 별도 저장 ──
const PARTS_KEY = 'nexushmi.symbolParts.v1'
export function loadGlobalParts() {
  try { const a = JSON.parse(localStorage.getItem(PARTS_KEY) || '[]'); return Array.isArray(a) ? a : [] }
  catch { return [] }
}
export function saveGlobalParts(list) {
  const clean = [...new Set((Array.isArray(list) ? list : []).map(s => String(s).trim()).filter(Boolean))].slice(0, 100)
  try { localStorage.setItem(PARTS_KEY, JSON.stringify(clean)) } catch { /* noop */ }
}
