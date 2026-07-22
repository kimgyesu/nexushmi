// 디바이스 드라이버 카탈로그 — 제조사별 통신·주소 규칙
//   · 드라이버는 "데이터"로 정의 (AI가 매뉴얼 읽고 생성/저장 가능하도록 함수 대신 선언형)
//   · 주소 정규화 로직은 named transform으로 분리 (아래 TRANSFORMS)
//   · 태그 주소칸은 선택된 디바이스의 드라이버 형식을 따라감

// 태그 타입 → 크기 카테고리
function sizeCat(tagType) {
  if (tagType === 'BIT') return 'bit'
  if (tagType === 'DWORD' || tagType === 'FLOAT') return 'dword'
  return 'word'
}

// 주소 정규화 방식 (드라이버 addr.transform 이 가리킴)
const TRANSFORMS = {
  // 그대로(공백 제거만) — Modbus 레지스터 번호, 가상 등
  raw: (raw) => String(raw ?? '').trim().replace(/\s+/g, ''),
  // 대문자화 — 지멘스/옴론/미쓰비시 (형식은 사용자 입력 그대로, 대소문자만 정리)
  upper: (raw) => String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ''),
  // LS XGT % 형식: %[영역][크기문자][번호] — 크기문자는 addr.bit/word/dword
  ls: (raw, tagType, addr) => {
    const size = addr[sizeCat(tagType)] || 'W'
    let s = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
    if (!s) return ''
    let m = /^%([A-Z]+?)[XBWDL]?([0-9.]+)$/.exec(s); if (m) return `%${m[1]}${size}${m[2]}`
    m = /^([A-Z]+)([0-9.]+)$/.exec(s); if (m) return `%${m[1]}${size}${m[2]}`
    return s
  },
}

// ── 드라이버 목록 ──
export const DRIVERS = [
  { id: 'virtual', vendor: '가상', name: '가상 (시뮬레이션)', protocol: '시뮬레이션', conn: 'virtual',
    addr: { transform: 'raw', example: 'NB1 · ND1', hint: '비우면 자동(NB/ND)', validate: '^N[BD]\\d+$' }, defaults: {} },

  { id: 'ls-xgt', vendor: 'LS산전', name: 'LS XGT (XGB/XGK) · Cnet/FEnet', protocol: 'XGT Cnet (LS)', conn: 'serial',
    addr: { transform: 'ls', bit: 'X', word: 'W', dword: 'D', example: 'M0 → %MX0 · D100 → %DW100', hint: '영역+번호 (M0, D100)', validate: '^%[A-Z]+[XBWDL][0-9.]+$' },
    defaults: { baud: 115200, parity: 'none', station: 1 } },

  { id: 'siemens-s7', vendor: 'Siemens', name: 'Siemens S7 (S7-1200/1500/200 Smart)', protocol: 'S7comm', conn: 'ethernet',
    addr: { transform: 'upper', example: 'M0.0 · MW10 · DB1.DBW0', hint: '지멘스 (M0.0, MW10, DBx.DBWy)', validate: '^(%?[IQM]\\d+(\\.\\d+)?|%?[IQM][BWD]\\d+|DB\\d+\\.DB[XBWD]\\d+(\\.\\d+)?)$' },
    defaults: { station: 0 } },

  { id: 'omron-fins', vendor: 'Omron', name: 'Omron FINS (CJ/CP/NX)', protocol: 'FINS', conn: 'ethernet',
    addr: { transform: 'upper', example: 'CIO0.00 · D100 · W0.00', hint: '옴론 (CIO, D, W)', validate: '^(CIO|D|W|H|A|E)\\d+(\\.\\d+)?$' },
    defaults: {} },

  { id: 'mitsubishi-mc', vendor: 'Mitsubishi', name: 'Mitsubishi MC (FX/Q/L)', protocol: 'MC Protocol', conn: 'ethernet',
    addr: { transform: 'upper', example: 'M0 · D100 · X0 · Y10', hint: '미쓰비시 (M, D, X, Y)', validate: '^[XYMDLTCRSBWZ]\\d+$' },
    defaults: {} },

  { id: 'modbus-tcp', vendor: 'Modbus', name: 'Modbus TCP (범용)', protocol: 'Modbus TCP', conn: 'ethernet',
    addr: { transform: 'raw', example: '40001(홀딩) · 00001(코일)', hint: 'Modbus 레지스터 번호', validate: '^[0-4]?[0-9]{1,5}$' },
    defaults: { station: 1 } },

  { id: 'modbus-rtu', vendor: 'Modbus', name: 'Modbus RTU (범용)', protocol: 'Modbus RTU', conn: 'serial',
    addr: { transform: 'raw', example: '40001 · 00001', hint: 'Modbus 레지스터 번호', validate: '^[0-4]?[0-9]{1,5}$' },
    defaults: { baud: 9600, parity: 'none', station: 1 } },

  { id: 'autonics-tk', vendor: 'Autonics', name: 'Autonics TK 시리즈 (Modbus RTU)', protocol: 'Modbus RTU', conn: 'serial',
    addr: { transform: 'raw', example: '1000(PV) · 1003(SV)', hint: 'Modbus 레지스터(10진)', validate: '^\\d{1,5}$' },
    defaults: { baud: 9600, parity: 'none', station: 1 } },
]

export const DRIVERS_BY_ID = Object.fromEntries(DRIVERS.map(d => [d.id, d]))
export const getDriver = id => DRIVERS_BY_ID[id] || null
export const VENDORS = [...new Set(DRIVERS.map(d => d.vendor))]
export const driversByVendor = vendor => DRIVERS.filter(d => d.vendor === vendor)

// 디바이스 → 드라이버 (driverId 우선, 없으면 protocol로 추정, 최후 LS)
export function driverForDevice(device) {
  if (!device) return getDriver('virtual')
  if (device.driverId && DRIVERS_BY_ID[device.driverId]) return DRIVERS_BY_ID[device.driverId]
  const byProto = DRIVERS.find(d => d.protocol === device.protocol)
  return byProto || getDriver('ls-xgt')
}

// 드라이버 기준 주소 정규화 / 검증 / 힌트
export function normalizeForDriver(driver, raw, tagType) {
  const fn = TRANSFORMS[driver?.addr?.transform] || TRANSFORMS.upper
  return fn(raw, tagType, driver?.addr || {})
}
export function validateForDriver(driver, addr) {
  const re = driver?.addr?.validate
  if (!re || !addr) return true
  try { return new RegExp(re, 'i').test(String(addr)) } catch { return true }
}
