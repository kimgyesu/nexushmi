// 태그 데이터 모델 — 디바이스/유틸리티 메타데이터 포함
// 엑셀 가져오기/내보내기, 시뮬레이터, 태그 등록 창에서 공통 사용

export const TAG_TYPES = ['BIT', 'WORD', 'DWORD', 'FLOAT']
// BIT=비트, WORD=16비트 정수, DWORD=32비트 정수(2워드), FLOAT=32비트 실수(IEEE754)

// 태그 등록 표 / 엑셀 컬럼 정의
// aliases: 가져오기 시 헤더 이름이 달라도 매핑되도록 (한글/영문 허용)
// 입력 모드: HMI 런타임에서 이 태그에 값을 쓸 수 있는 방식
export const INPUT_MODES = [
  { value: 'none',    label: '없음',     desc: '읽기 전용 — 입력 불가' },
  { value: 'numeric', label: '숫자 입력', desc: '숫자 키패드로 값 입력 (min~max 범위)' },
  { value: 'text',    label: '문자 입력', desc: '텍스트로 직접 입력' },
]

export const TAG_COLUMNS = [
  { key: 'utility',   header: '그룹',     width: 110, aliases: ['utility', '유틸리티', '설비', '그룹', 'group', 'equipment'] },
  { key: 'id',        header: '태그ID',   width: 150, aliases: ['태그id', 'tag', 'tagid', 'id', 'tagname', '태그이름', '태그명'] },
  { key: 'desc',      header: '설명',     width: 150, aliases: ['desc', 'description', '설명', '코멘트', 'comment', '이름'] },
  { key: 'device',    header: '디바이스', width: 110, aliases: ['device', '디바이스', '장치', 'plc', '제어기'] },
  { key: 'address',   header: '주소',     width: 90,  aliases: ['address', 'addr', '주소', '어드레스'] },
  { key: 'type',      header: '타입',     width: 80,  aliases: ['type', '타입', '자료형', '데이터타입', 'datatype'] },
  { key: 'unit',      header: '단위',     width: 70,  aliases: ['unit', '단위'] },
  { key: 'min',       header: '최소',     width: 70,  aliases: ['min', '최소', '최소값', 'minvalue', 'lo'] },
  { key: 'max',       header: '최대',     width: 70,  aliases: ['max', '최대', '최대값', 'maxvalue', 'hi'] },
  { key: 'value',     header: '초기값',   width: 80,  aliases: ['value', '초기값', '현재값', 'val', '값'] },
]

// 기본(데모) 태그 — 디바이스/유틸리티 예시 포함
export const DEFAULT_TAGS = [
  { id: 'TAG_FAN_RUN',       desc: '냉각팬 운전', device: 'PLC_01', utility: '냉각설비',   address: 'M0.0',  type: 'BIT',   value: 1,    unit: '',     min: 0,   max: 1    },
  { id: 'TAG_CHAMBER_PRESS', desc: '챔버 압력',   device: 'PLC_01', utility: '챔버',       address: 'D100',  type: 'FLOAT', value: 2.45, unit: 'MPa',  min: 0.5, max: 5.0  },
  { id: 'TAG_MOTOR_CURR',    desc: '주모터 전류', device: 'PLC_01', utility: '주모터',     address: 'D102',  type: 'FLOAT', value: 12.8, unit: 'A',    min: 0,   max: 30   },
  { id: 'TAG_PUMP_SPEED',    desc: '펌프 속도',   device: 'PLC_02', utility: '펌프',       address: 'D200',  type: 'WORD',  value: 1450, unit: 'RPM',  min: 0,   max: 3600 },
  { id: 'TAG_TEMP_ZONE1',    desc: '구역1 온도',  device: 'PLC_02', utility: '냉각설비',   address: 'D202',  type: 'FLOAT', value: 78.3, unit: '°C',   min: 20,  max: 150  },
  { id: 'TAG_VALVE_STATUS',  desc: '주밸브 상태', device: 'PLC_01', utility: '배관',       address: 'M0.1',  type: 'BIT',   value: 0,    unit: '',     min: 0,   max: 1    },
  { id: 'TAG_FEED_RATE',     desc: '공급 유량',   device: 'PLC_02', utility: '배관',       address: 'D204',  type: 'FLOAT', value: 45.6, unit: 'L/m',  min: 0,   max: 100  },
  { id: 'TAG_VIBRATION',     desc: '진동 수치',   device: 'PLC_01', utility: '주모터',     address: 'D106',  type: 'FLOAT', value: 0.12, unit: 'mm/s', min: 0,   max: 1.5  },
]

function toNumber(v, fallback) {
  if (v === '' || v == null) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// 가상 디바이스 상수 — 디바이스 연결 없이 항상 시뮬레이션
export const VIRTUAL_DEVICE = '__virtual__'
export const isVirtualTag = t => t?.device === VIRTUAL_DEVICE
// 실 디바이스가 지정 안 된 태그(빈 값 또는 __virtual__)는 가상으로 취급
export const isVirtualDevice = d => !d || d === VIRTUAL_DEVICE

// 가상 주소 접두사 — 비트 NB, 워드 ND (자체 생성)
export const VBIT_PREFIX = 'NB'
export const VWORD_PREFIX = 'ND'
const wordSize = type => (type === 'DWORD' || type === 'FLOAT') ? 2 : 1

// 가상 태그의 다음 자유 주소 계산 (BIT→NB, 그 외→ND, DWORD/FLOAT는 2워드 차지)
export function nextVirtualAddress(tags = [], type = 'WORD') {
  if (type === 'BIT') {
    let max = 0
    for (const t of tags) { const m = /^NB(\d+)$/i.exec(t.address || ''); if (m) max = Math.max(max, +m[1]) }
    return VBIT_PREFIX + (max + 1)
  }
  let maxEnd = 0
  for (const t of tags) {
    const m = /^ND(\d+)$/i.exec(t.address || '')
    if (m) maxEnd = Math.max(maxEnd, +m[1] + wordSize(t.type) - 1)
  }
  return VWORD_PREFIX + (maxEnd + 1)
}

// 가상 태그이고 주소가 비어있으면 NB/ND 자동 부여해서 반환
export function withVirtualAddress(tag, existingTags = []) {
  if (!isVirtualDevice(tag.device) || (tag.address && String(tag.address).trim())) return tag
  return { ...tag, address: nextVirtualAddress(existingTags, tag.type) }
}

// 부분 데이터 → 정규화된 태그 객체
export function makeTag(p = {}) {
  const type = TAG_TYPES.includes(String(p.type).toUpperCase())
    ? String(p.type).toUpperCase()
    : 'FLOAT'
  const min = toNumber(p.min, 0)
  const max = toNumber(p.max, type === 'BIT' ? 1 : 100)
  const value = toNumber(p.value, min)
  const id = String(p.id ?? '').trim() || ('TAG_' + Math.random().toString(36).slice(2, 7).toUpperCase())
  const rawDevice = String(p.device ?? '')
  const device = rawDevice === '가상' ? VIRTUAL_DEVICE : rawDevice
  const validModes = INPUT_MODES.map(m => m.value)
  const inputMode = validModes.includes(p.inputMode) ? p.inputMode : 'none'
  return {
    id,
    desc: String(p.desc ?? ''),
    device,
    utility: String(p.utility ?? ''),
    address: String(p.address ?? ''),
    type,
    inputMode,
    unit: String(p.unit ?? ''),
    min,
    max,
    decimals: Math.max(0, Math.min(6, toNumber(p.decimals, 0))),
    digits: Math.max(0, toNumber(p.digits, 0)),
    value,
    ...(p.alarmHint ? { alarmHint: String(p.alarmHint) } : {}),
  }
}

// 표시 형식 적용 — 정수는 암시적 소수점(raw/10^소숫점), 자리수만큼 0채움
// 예) raw 4000, 소숫점 2 → "40.00" / 자리수 6, 소숫점 2 → "0040.00"
export function formatTagValue(tag, rawValue = tag?.value) {
  if (!tag) return String(rawValue ?? '')
  if (tag.type === 'BIT') return rawValue === 1 ? '1' : '0'
  const decimals = Math.max(0, Math.min(6, Number(tag.decimals) || 0))
  const v = tag.type === 'FLOAT' ? Number(rawValue) : Number(rawValue) / Math.pow(10, decimals)
  let s = v.toFixed(decimals)
  const digits = Number(tag.digits) || 0
  if (digits > 0) {
    const neg = s.startsWith('-')
    if (neg) s = s.slice(1)
    const dot = s.indexOf('.')
    let intp = dot >= 0 ? s.slice(0, dot) : s
    const frac = dot >= 0 ? s.slice(dot) : ''
    const intDigits = Math.max(1, digits - decimals)
    intp = intp.padStart(intDigits, '0')
    s = (neg ? '-' : '') + intp + frac
  }
  return s
}

// 설정값(Setpoint/SV) 태그 판별 — 이름/설명에 "설정" 또는 단어 "SV" 포함
export function isSetpointTag(tag) {
  if (!tag) return false
  const s = `${tag.id || ''} ${tag.desc || ''}`.toLowerCase()
  return /설정|set\s*point|setpoint/.test(s) || /(^|[^a-z])sv([^a-z]|$)/.test(s)
}

// 시뮬레이터: 다음 값 계산
export function nextValue(tag) {
  // 설정값(SV)은 운전자가 정한 값을 유지 (자동 변동 안 함)
  if (isSetpointTag(tag)) return tag.value
  if (tag.type === 'BIT') {
    return Math.random() > 0.85 ? 1 - tag.value : tag.value
  }
  if (tag.type === 'WORD' || tag.type === 'DWORD') {
    const range = tag.max - tag.min
    const delta = Math.round((Math.random() - 0.5) * Math.max(2, range * 0.04))
    return Math.max(tag.min, Math.min(tag.max, tag.value + delta))
  }
  // FLOAT
  const range = tag.max - tag.min
  const delta = (Math.random() - 0.5) * range * 0.04
  return parseFloat(Math.max(tag.min, Math.min(tag.max, tag.value + delta)).toFixed(2))
}



