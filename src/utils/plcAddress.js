// PLC 주소 정규화 — 현장 표기(P40, M1, D100) → XGT Cnet 형식(%PW40, %MW1, %DW100)
//
// 규칙: 영역은 그대로, 태그 타입으로 크기문자 결정
//   BIT  → X (비트)
//   WORD → W (워드 16비트)
//   FLOAT→ D (더블워드 32비트)

function sizeFor(tagType) {
  if (tagType === 'BIT') return 'X'
  if (tagType === 'DWORD' || tagType === 'FLOAT') return 'D' // 32비트 = 더블워드
  return 'W' // WORD 16비트
}

// raw 예: 'D100' | 'M1' | 'P40' | '%MW100' | '%M100'
export function normalizeAddress(raw, tagType) {
  let s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!s) return ''

  if (s.startsWith('%')) {
    // 이미 % 형식: 크기문자(X/B/W/D/L)가 있으면 그대로, 없으면 타입으로 보정
    const m = /^%([A-Z]+)([XBWDL])?([0-9.]+)$/.exec(s)
    if (!m) return s
    return m[2] ? s : `%${m[1]}${sizeFor(tagType)}${m[3]}`
  }

  // 현장 표기: [영역문자][번호]
  const m = /^([A-Z]+)([0-9.]+)$/.exec(s)
  if (!m) return s
  return `%${m[1]}${sizeFor(tagType)}${m[2]}`
}

export function isValidAddress(addr) {
  return /^%[A-Z]+[XBWDL][0-9.]+$/.test(String(addr ?? '').toUpperCase())
}

// 주소(% 또는 현장표기)에 태그 타입 기준 크기문자를 재적용 → 항상 %[영역][크기][번호]
//   BIT→X, WORD→W, DWORD/FLOAT→D  (비트/워드에 따라 자동 구분)
export function applyType(addr, tagType) {
  const s = String(addr ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!s) return ''
  let m = /^%([A-Z]+?)[XBWDL]?([0-9.]+)$/.exec(s)  // 이미 % 형식 → 크기문자 교체 (영역은 비탐욕)
  if (m) return `%${m[1]}${sizeFor(tagType)}${m[2]}`
  m = /^([A-Z]+)([0-9.]+)$/.exec(s)                 // 현장표기(M0, D100) → % 부여
  if (m) return `%${m[1]}${sizeFor(tagType)}${m[2]}`
  return s
}
