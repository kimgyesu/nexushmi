// LS ELECTRIC (LS산전) XGB Cnet — XGT 전용 프로토콜 (ASCII) 코덱
//
// 프레임 개요 (요청: PC → PLC)
//   요청 : ENQ | 국번(2) | 명령(R/W) | 명령타입(SS/SB) | ...데이터... | EOT | BCC(2)
//   응답 : ACK | 국번(2) | 명령      | 명령타입       | ...데이터... | ETX | BCC(2)
//   에러 : NAK | 국번(2) | 명령      | 명령타입       | 에러코드(4)  | ETX | BCC(2)
//
//   - 명령이 "소문자(r/w)"이면 프레임 끝에 BCC(2 ASCII Hex) 추가, "대문자(R/W)"이면 미사용
//     (매뉴얼 V1.8 7.1.1: 소문자 → BCC 첨가, 대문자 → BCC 미첨가)
//   - SS = 직접변수 개별(여러 변수 각각), SB = 직접변수 연속(한 변수에서 N개)
//   - 디바이스 표기: %MW100, %MX0010, %DW100, %PW0 ... (%[영역][크기][번호])
//   - 데이터 바이트 순서: 빅엔디안 (최상위 바이트 먼저). 예) H1234 → ASCII "1234"

// XGT 서버 에러코드 (부록3.1) — Hex 2Byte(ASCII 4Byte)
const ERROR_CODES = {
  '0003': '블록 수 초과 (개별 읽기/쓰기 블록수 16 초과)',
  '0004': '변수 길이 에러 (변수 이름 16자 초과)',
  '0007': '데이터 타입 에러 (X/B/W/D/L 이외)',
  '0011': '데이터 에러 (영역/형식/% 누락 등)',
  '0090': '모니터 실행 에러 (미등록)',
  '0190': '모니터 실행 에러 (등록번호 범위 초과)',
  '0290': '모니터 등록 에러 (등록번호 범위 초과)',
  '1132': '디바이스 메모리 에러 (잘못된 디바이스 문자)',
  '1232': '데이터 크기 에러 (60워드 초과)',
  '1234': '여유 프레임 에러 (불필요한 내용 추가됨)',
  '1332': '데이터 타입 불일치 (블록간 타입 다름)',
  '1432': '데이터 값 에러 (Hex 변환 불가)',
  '7132': '변수 요구 영역 초과 (디바이스 지원 범위 초과)',
}
export function errorText(code) {
  return ERROR_CODES[code] || `알 수 없는 에러 (${code})`
}

const ENQ = 0x05, ACK = 0x06, NAK = 0x15, EOT = 0x04, ETX = 0x03

const hex2 = n => (n & 0xff).toString(16).toUpperCase().padStart(2, '0')
const hex4 = n => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0')
const codes = s => [...s].map(c => c.charCodeAt(0))

// BCC = ENQ~EOT(또는 ETX) 까지 바이트 합의 하위 1바이트 → 2 ASCII Hex
function bcc(bytes) {
  let sum = 0
  for (const b of bytes) sum = (sum + b) & 0xff
  return hex2(sum)
}

function finalize(bytes, useBcc) {
  return useBcc ? Buffer.from([...bytes, ...codes(bcc(bytes))]) : Buffer.from(bytes)
}

// 디바이스 크기(바이트): X(비트)=1, B=1, W=2, D=4, L=8
function deviceBytes(device) {
  const m = /^%[A-Z]([XBWDL])/i.exec(device)
  const sz = (m ? m[1] : 'W').toUpperCase()
  return { X: 1, B: 1, W: 2, D: 4, L: 8 }[sz] ?? 2
}

// 값 → ASCII Hex (지정 바이트 수, 빅엔디안 기본)
function valueToHex(value, bytes, { littleEndian = false } = {}) {
  let v = Number(value) >>> 0
  let hex = v.toString(16).toUpperCase().padStart(bytes * 2, '0').slice(-bytes * 2)
  if (littleEndian) {
    // 바이트 단위 역순
    hex = (hex.match(/../g) || []).reverse().join('')
  }
  return hex
}

// ASCII Hex → 값 (빅엔디안 기본, 부호 없는 정수)
function hexToValue(hex, { littleEndian = false } = {}) {
  let h = hex
  if (littleEndian) h = (hex.match(/../g) || []).reverse().join('')
  return parseInt(h, 16)
}

const swapHex = hex => (hex.match(/../g) || []).reverse().join('')

// 타입별 디코딩: WORD/DWORD(부호있는 정수 INT/DINT), FLOAT(IEEE754 32비트)
export function decodeValue(hex, type, { littleEndian = false } = {}) {
  const h = littleEndian ? swapHex(hex) : hex
  if (type === 'FLOAT') {
    return Buffer.from(h.padStart(8, '0').slice(-8), 'hex').readFloatBE(0)
  }
  const bits = h.length * 4
  let n = parseInt(h, 16)
  const half = 2 ** (bits - 1)
  if (n >= half) n -= 2 ** bits // 2의 보수(부호)
  return n
}

// 타입별 인코딩: 쓸 값 → ASCII Hex (bytes 바이트)
export function encodeValue(value, type, bytes, { littleEndian = false } = {}) {
  let h
  if (type === 'FLOAT') {
    const b = Buffer.alloc(4); b.writeFloatBE(Number(value), 0)
    h = b.toString('hex').toUpperCase()
  } else {
    const total = bytes * 8
    let v = Math.trunc(Number(value))
    if (v < 0) v += 2 ** total // 2의 보수
    h = v.toString(16).toUpperCase().padStart(bytes * 2, '0').slice(-bytes * 2)
  }
  return littleEndian ? swapHex(h) : h
}

// ── 요청 프레임 생성 ──

// 개별 읽기 (RSS): devices = ['%MW100','%MX0010', ...] (최대 16개)
function buildReadIndividual(station, devices, { useBcc = true } = {}) {
  const cmd = useBcc ? 'r' : 'R'
  const bytes = [ENQ, ...codes(hex2(station)), ...codes(cmd), ...codes('SS'), ...codes(hex2(devices.length))]
  for (const d of devices) {
    bytes.push(...codes(hex2(d.length)), ...codes(d))
  }
  bytes.push(EOT)
  return finalize(bytes, useBcc)
}

// 연속 읽기 (RSB): device 한 개에서 count 개(워드) 읽기 (최대 60워드)
function buildReadContinuous(station, device, count, { useBcc = true } = {}) {
  const cmd = useBcc ? 'r' : 'R'
  const bytes = [ENQ, ...codes(hex2(station)), ...codes(cmd), ...codes('SB'),
    ...codes(hex2(device.length)), ...codes(device), ...codes(hex2(count))]
  bytes.push(EOT)
  return finalize(bytes, useBcc)
}

// 개별 쓰기 (WSS): items = [{ device:'%MW100', value:1234, type?:'WORD'|'DWORD'|'FLOAT' }, ...]
function buildWriteIndividual(station, items, { useBcc = true, littleEndian = false } = {}) {
  const cmd = useBcc ? 'w' : 'W'
  const bytes = [ENQ, ...codes(hex2(station)), ...codes(cmd), ...codes('SS'), ...codes(hex2(items.length))]
  for (const it of items) {
    const nbytes = deviceBytes(it.device)
    const hexVal = it.type
      ? encodeValue(it.value, it.type, nbytes, { littleEndian })
      : valueToHex(it.value, nbytes, { littleEndian })
    bytes.push(...codes(hex2(it.device.length)), ...codes(it.device), ...codes(hexVal))
  }
  bytes.push(EOT)
  return finalize(bytes, useBcc)
}

// ── 응답 파서 ──
// 반환: { ok, type:'read'|'write'|'error', command, cmdType, values?, error?, raw }
function parseResponse(buf, { littleEndian = false } = {}) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  const head = b[0]
  const text = b.toString('latin1')
  const station = text.slice(1, 3)
  const command = text.slice(3, 4)      // R/W
  const cmdType = text.slice(4, 6)      // SS/SB

  if (head === NAK) {
    const error = text.slice(6, 10)     // 에러코드 4자리 (Hex 2Byte)
    return { ok: false, type: 'error', command, cmdType, station, error, errorText: errorText(error), raw: text }
  }
  if (head !== ACK) {
    return { ok: false, type: 'error', error: 'INVALID_HEADER', raw: text }
  }

  // 쓰기 응답: ACK | st | W(w) | SS | ETX | BCC
  if (command.toUpperCase() === 'W') {
    return { ok: true, type: 'write', command, cmdType, station, raw: text }
  }

  // 읽기 응답
  const etxIdx = b.indexOf(ETX)
  const body = text.slice(6, etxIdx < 0 ? undefined : etxIdx)
  const values = []     // 부호없는 정수(호환)
  const hexValues = []  // 원본 Hex (타입별 디코딩용)
  if (cmdType === 'SS') {
    // 개별: BlockCnt(2) + [ DataLen(2) + Data(DataLen*2) ] x N
    let p = 0
    const blockCnt = parseInt(body.slice(p, p + 2), 16); p += 2
    for (let i = 0; i < blockCnt; i++) {
      const dlen = parseInt(body.slice(p, p + 2), 16); p += 2
      const hex = body.slice(p, p + dlen * 2); p += dlen * 2
      hexValues.push(hex)
      values.push(hexToValue(hex, { littleEndian }))
    }
  } else if (cmdType === 'SB') {
    // 연속: BlockCnt(2, 항상 01) + DataLen(2, byte수) + Data → 2바이트(워드)씩 분해
    let p = 2  // 블록수(01) 건너뜀
    const dlen = parseInt(body.slice(p, p + 2), 16); p += 2
    const hex = body.slice(p, p + dlen * 2)
    for (let i = 0; i < hex.length; i += 4) {
      const h = hex.slice(i, i + 4)
      hexValues.push(h)
      values.push(hexToValue(h, { littleEndian }))
    }
  }
  return { ok: true, type: 'read', command, cmdType, station, values, hexValues, raw: text }
}

export const LsXgtCnet = {
  ENQ, ACK, NAK, EOT, ETX,
  bcc, deviceBytes, valueToHex, hexToValue, decodeValue, encodeValue, errorText,
  buildReadIndividual, buildReadContinuous, buildWriteIndividual, parseResponse,
}
export default LsXgtCnet
