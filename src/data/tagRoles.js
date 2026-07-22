// 태그 역할(role) 분류 — 범용 보고서/시뮬레이션의 기반
// 어떤 프로젝트(집진기·급수펌프·하수처리…)든 "태그가 무엇인가"만으로 동작하게 한다.
import { isSetpointTag } from './tags'

// role: 'equipment' | 'setpoint' | 'power' | 'env' | 'pv'
//  pv=공정변수(측정), sv=설정값, equipment=장비ON/OFF(BIT), power=전력/에너지, env=외란(일사/외기)
export function tagRole(tag) {
  if (!tag) return 'pv'
  if (tag.role) return tag.role // 명시 우선
  if (tag.type === 'BIT') return 'equipment'
  if (isSetpointTag(tag)) return 'setpoint'
  const unit = String(tag.unit || '').toLowerCase()
  const s = `${tag.id || ''} ${tag.desc || ''}`.toLowerCase()
  if (/\bk?wh?\b|kwh|kw\b/.test(unit) || /전력|소비전력|파워|전력량/.test(s)) return 'power'
  if (/lux|klux|w\/m/.test(unit) || /일사|일광|외기|외부온|기온|풍속|강우|강수/.test(s)) return 'env'
  return 'pv'
}

// 태그 배열 → 역할별 분류
export function classifyTags(tags = []) {
  const out = { pv: [], setpoint: [], equipment: [], power: [], env: [] }
  for (const t of tags) out[tagRole(t)].push(t)
  return out
}

// pv ↔ 설정값(sv) 연결: pv.sv 명시 or 이름 매칭(설정 X ↔ X) or 유일 setpoint
export function findSetpointFor(pvTag, setpoints = []) {
  if (!setpoints.length) return null
  if (pvTag.sv) return setpoints.find(s => s.id === pvTag.sv) || null
  const key = String(pvTag.desc || pvTag.id).replace(/설정|목표|sv/gi, '').trim()
  const byName = setpoints.find(s => String(s.desc || s.id).includes(key) && key)
  if (byName) return byName
  return setpoints.length === 1 ? setpoints[0] : null
}

// 표시용 숫자 포맷 문자열 (엑셀 numFmt / toFixed 자릿수 겸용)
export const roleFmt = tag => {
  const d = Math.max(0, Number(tag?.decimals) || 0)
  return d > 0 ? '0.' + '0'.repeat(d) : '0'
}
export const fmtDecimals = tag => Math.max(0, Number(tag?.decimals) || 0)

// 시리즈 자동 색상 팔레트
export const SERIES_PALETTE = ['#f87171', '#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#22d3ee', '#fb923c', '#c084fc', '#4ade80']
export const EQUIP_PALETTE = ['#38bdf8', '#2563eb', '#fb923c', '#2dd4bf', '#a78bfa', '#f472b6', '#facc15', '#f87171']
