// ════════════════════════════════════════════════════════════
//  패널 스타일 프리셋 — 갤러리에서 고르는 "테마"
//  모두 현재 렌더러가 지원하는 속성(색·글꼴크기)만 사용 → 바로 적용됨.
//  각 스타일: groupbox(테두리/제목/배경), numeric(값 글꼴·색·박스), labelColor
// ════════════════════════════════════════════════════════════

export const PANEL_STYLES = {
  default: {
    key: 'default', name: '기본', desc: '청록 표준', accent: '#00e5ff',
    groupbox: { borderColor: '#00e5ff', titleColor: '#00e5ff', bgColor: 'rgba(0,229,255,0.03)' },
    numeric:  { valueFontSize: 16, digitColor: '#00e5ff', bgColor: '#0f172a', boxColor: '#1e2a4a' },
    labelColor: '#94a3b8',
  },
  neon: {
    key: 'neon', name: '네온', desc: '밝은 청록 + 큰 발광 값', accent: '#22d3ee',
    groupbox: { borderColor: '#22d3ee', titleColor: '#a5f3fc', bgColor: 'rgba(34,211,238,0.06)' },
    numeric:  { valueFontSize: 20, digitColor: '#22d3ee', bgColor: '#06131d', boxColor: '#0e4457' },
    labelColor: '#a8c5d6',
  },
  amber: {
    key: 'amber', name: '앰버', desc: '산업 골드 톤', accent: '#f59e0b',
    groupbox: { borderColor: '#f59e0b', titleColor: '#fcd34d', bgColor: 'rgba(245,158,11,0.05)' },
    numeric:  { valueFontSize: 19, digitColor: '#fbbf24', bgColor: '#0a0803', boxColor: '#3a2f14' },
    labelColor: '#c2b494',
  },
  minimal: {
    key: 'minimal', name: '미니멀', desc: '차분한 회색 (표준 HMI)', accent: '#94a3b8',
    groupbox: { borderColor: '#475569', titleColor: '#cbd5e1', bgColor: 'rgba(148,163,184,0.04)' },
    numeric:  { valueFontSize: 17, digitColor: '#e2e8f0', bgColor: '#0f141c', boxColor: '#2a3444' },
    labelColor: '#8592a3',
  },
  emerald: {
    key: 'emerald', name: '에메랄드', desc: '초록 계열', accent: '#10b981',
    groupbox: { borderColor: '#10b981', titleColor: '#6ee7b7', bgColor: 'rgba(16,185,129,0.05)' },
    numeric:  { valueFontSize: 19, digitColor: '#34d399', bgColor: '#04140d', boxColor: '#0f3f2c' },
    labelColor: '#9fc7b4',
  },
}

export const PANEL_STYLE_LIST = Object.values(PANEL_STYLES)

// 한글/영문 별칭 → 스타일 key (AI가 한글 요청을 매핑할 때, 그리고 자유 입력 대응)
const ALIAS = {
  '기본': 'default', '디폴트': 'default', '표준': 'default', '청록': 'default',
  '네온': 'neon', '네온사인': 'neon', '발광': 'neon',
  '앰버': 'amber', '호박': 'amber', '골드': 'amber', '노랑': 'amber', '주황': 'amber',
  '미니멀': 'minimal', '심플': 'minimal', '회색': 'minimal', '무채색': 'minimal',
  '에메랄드': 'emerald', '초록': 'emerald', '녹색': 'emerald', '그린': 'emerald',
}

// key · 한글이름 · 별칭 어느 것으로도 스타일 찾기
export function resolvePanelStyle(keyOrName) {
  if (!keyOrName) return PANEL_STYLES.default
  const k = String(keyOrName).trim()
  if (PANEL_STYLES[k]) return PANEL_STYLES[k]
  if (ALIAS[k] && PANEL_STYLES[ALIAS[k]]) return PANEL_STYLES[ALIAS[k]]
  const byName = PANEL_STYLE_LIST.find(s => s.name === k)
  return byName || PANEL_STYLES.default
}

const LS_KEY = 'nexushmi.panelStyle'
export function loadActiveStyleKey() {
  try { const v = localStorage.getItem(LS_KEY); return (v && PANEL_STYLES[v]) ? v : 'default' } catch { return 'default' }
}
export function saveActiveStyleKey(key) {
  try { if (PANEL_STYLES[key]) localStorage.setItem(LS_KEY, key) } catch {}
}
