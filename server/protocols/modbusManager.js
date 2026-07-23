// Modbus RTU 매니저 — LS Cnet(Modbus 슬레이브) 등 범용 Modbus 시리얼
//   · PlcManager(XGT)와 동일 인터페이스: status/connect/disconnect/read/write/setPollDevices
//   · modbus-serial 은 lazy import (미설치여도 서버는 뜨고, 연결 시도 때만 에러)
//   · 주소 표기: 순수 숫자 = 0-based 프로토콜 주소(WORD→홀딩레지스터, BIT→코일).
//     4xxxx/3xxxx/1xxxx/0xxxx PLC 표기도 인식(1-based → -1). %MW/%D 등은 숫자부만 사용.

const DEFAULTS = {
  path: process.env.PLC_PORT || 'COM3',
  baudRate: Number(process.env.PLC_BAUD) || 9600,
  dataBits: 8, parity: 'none', stopBits: 1,
  station: Number(process.env.PLC_STATION) || 1,
  wordOrder: 'big',   // DWORD/FLOAT 워드 순서 (big = 상위워드 먼저)
  signedWord: false,  // WORD를 부호형(-32768~32767)로 해석할지
  lsMap: null,        // LS Cnet Modbus 매핑 {bitReadStart,bitWriteStart,wordReadStart,wordWriteStart}
  timeout: 1000,
  pollMs: 1000,
}

// LS 네이티브 주소(M100/D500) → Modbus {kind, addr}. op='read'|'write' 로 영역·기능코드 결정.
//   LS XGB Modbus 슬레이브 매핑(실측): 읽기영역=입력타입(FC02 접점입력·FC04 입력레지스터),
//                                    쓰기영역=출력타입(FC01 코일·FC03 홀딩레지스터)
export function lsAddr(device, lsMap, op) {
  const m = /^([MD])(\d+)$/i.exec(String(device ?? '').trim().toUpperCase())
  if (!m || !lsMap) return null
  const area = m[1].toUpperCase(), num = +m[2]
  if (area === 'M') {   // 비트
    // 쓰기영역(M500↑) 주소는 읽을 때도 출력타입(코일 FC01)으로 — 읽기영역 오프셋 초과 방지
    if (op === 'write' || num >= lsMap.bitWriteStart)
      return { kind: 'coil', addr: num - lsMap.bitWriteStart }   // 코일(FC01/05)
    return { kind: 'di', addr: num - lsMap.bitReadStart }        // 접점입력(FC02, 읽기영역)
  }
  if (op === 'write' || num >= lsMap.wordWriteStart)             // 워드
    return { kind: 'hr', addr: num - lsMap.wordWriteStart }      // 홀딩레지스터(FC03/06)
  return { kind: 'ir', addr: num - lsMap.wordReadStart }         // 입력레지스터(FC04, 읽기영역)
}

// device 문자열 → { kind:'hr'|'ir'|'coil'|'di', addr(0-based) }
export function parseModbusAddr(device, type = 'WORD') {
  const bit = type === 'BIT'
  const s = String(device ?? '').trim().toUpperCase().replace(/\s+/g, '')
  // PLC 표기 (5~6자리, 앞자리 = 테이블)
  let m
  if ((m = /^4(\d{4,5})$/.exec(s))) return { kind: 'hr',   addr: Math.max(0, +m[1] - 1) }
  if ((m = /^3(\d{4,5})$/.exec(s))) return { kind: 'ir',   addr: Math.max(0, +m[1] - 1) }
  if ((m = /^1(\d{4,5})$/.exec(s))) return { kind: 'di',   addr: Math.max(0, +m[1] - 1) }
  if ((m = /^0(\d{4,5})$/.exec(s))) return { kind: 'coil', addr: Math.max(0, +m[1] - 1) }
  // 그 외: %영역/문자 접두 제거하고 숫자부만 = 0-based 프로토콜 주소
  const num = parseInt(s.replace(/^%?[A-Z]+/, '').replace(/[^0-9]/g, ''), 10)
  return { kind: bit ? 'coil' : 'hr', addr: Number.isFinite(num) ? num : 0 }
}

function decodeRegs(data, type, wordOrder, signedWord) {
  if (type !== 'DWORD' && type !== 'FLOAT') {
    let v = data[0] & 0xFFFF
    if (signedWord && v > 0x7FFF) v -= 0x10000
    return v
  }
  const hi = data[0] & 0xFFFF, lo = data[1] & 0xFFFF
  const buf = Buffer.alloc(4)
  if (wordOrder === 'little') { buf.writeUInt16BE(lo, 0); buf.writeUInt16BE(hi, 2) }
  else { buf.writeUInt16BE(hi, 0); buf.writeUInt16BE(lo, 2) }
  return type === 'FLOAT' ? buf.readFloatBE(0) : buf.readUInt32BE(0)
}

export class ModbusManager {
  constructor() {
    this.cfg = { ...DEFAULTS }
    this.client = null
    this.connected = false
    this.lastError = null
    this.values = {}
    this.pollDevices = []
    this.pollTimer = null
    this.busy = false
    this._Lib = null
    this._connecting = null
    this._q = null            // Modbus 트랜잭션 직렬화 체인
  }

  async _lib() {
    if (!this._Lib) {
      try { this._Lib = (await import('modbus-serial')).default }
      catch { throw new Error("modbus-serial 미설치 — 'npm install modbus-serial' 후 서버 재시작하세요.") }
    }
    return this._Lib
  }

  status() {
    return {
      protocol: 'modbus',
      connected: this.connected,
      config: { ...this.cfg },
      pollDevices: this.pollDevices,
      values: this.values,
      lastError: this.lastError,
    }
  }

  // 동시 연결 호출 직렬화 (StrictMode 이중 마운트/빠른 재RUN 시 포트 상태 꼬임 방지)
  async connect(cfg = {}) {
    while (this._connecting) { try { await this._connecting } catch { /* ignore */ } }
    this._connecting = this._doConnect(cfg)
    try { return await this._connecting }
    finally { this._connecting = null }
  }

  async _doConnect(cfg = {}) {
    if (cfg.port && !cfg.path) cfg.path = cfg.port
    if (cfg.baud && !cfg.baudRate) cfg.baudRate = Number(cfg.baud)
    if (cfg.station != null) cfg.station = Number(cfg.station)
    const next = { ...this.cfg, ...cfg }
    // 같은 설정으로 "포트가 실제로 열려있으면" 재사용 (lsMap만 갱신). 닫혀있으면 새로 연다.
    if (this.connected && this.client && this.client.isOpen &&
        this.cfg.path === next.path && this.cfg.baudRate === next.baudRate && this.cfg.station === next.station) {
      this.cfg = next
      return true
    }
    await this.disconnect()
    this.cfg = next
    const ModbusRTU = await this._lib()
    const client = new ModbusRTU()
    client.setTimeout(this.cfg.timeout)
    await client.connectRTUBuffered(this.cfg.path, {
      baudRate: this.cfg.baudRate, dataBits: this.cfg.dataBits,
      parity: this.cfg.parity, stopBits: this.cfg.stopBits,
    })
    client.setID(this.cfg.station)
    this.client = client
    this.connected = true
    this.lastError = null
    if (this.pollDevices.length) this._startPolling()
    return true
  }

  async disconnect() {
    this._stopPolling()
    if (this.client) {
      try { await new Promise(r => this.client.close(r)) } catch { /* ignore */ }
    }
    this.client = null
    this.connected = false
  }

  // 모든 Modbus 트랜잭션을 순서대로 처리 (읽기 폴링 ↔ 쓰기 겹침 = 연속 클릭 누락 방지)
  _run(fn) {
    const result = (this._q || Promise.resolve()).then(() => fn())
    this._q = result.catch(() => {})
    return result
  }

  // items: ['100'] 또는 [{device:'100', type:'FLOAT'}]
  read(items) { return this._run(() => this._readRaw(items)) }
  async _readRaw(items) {
    if (!this.connected) throw new Error('PLC 미연결')
    const list = (items || []).map(it => (typeof it === 'string' ? { device: it, type: 'WORD' } : it))
    const out = {}
    const errs = []
    for (const c of list) {
      const type = c.type || 'WORD'
      try {
        const ls = lsAddr(c.device, this.cfg.lsMap, 'read')
        const { kind, addr } = ls || parseModbusAddr(c.device, type)
        if (addr < 0) throw new Error('읽기 영역 밖')
        if (kind === 'coil') { const r = await this.client.readCoils(addr, 1); out[c.device] = r.data[0] ? 1 : 0 }
        else if (kind === 'di') { const r = await this.client.readDiscreteInputs(addr, 1); out[c.device] = r.data[0] ? 1 : 0 }
        else {
          const count = (type === 'DWORD' || type === 'FLOAT') ? 2 : 1
          const r = kind === 'ir'
            ? await this.client.readInputRegisters(addr, count)
            : await this.client.readHoldingRegisters(addr, count)
          out[c.device] = decodeRegs(r.data, type, this.cfg.wordOrder, this.cfg.signedWord)
        }
      } catch (e) {
        // 한 주소 실패해도 나머지는 계속 (범위 밖·미매핑 등) — 마지막 에러만 기록
        errs.push(`${c.device}: ${e.message}`)
      }
    }
    Object.assign(this.values, out)
    this.lastError = errs.length ? errs.join(' / ') : null
    return out
  }

  write(device, value, type = 'WORD') { return this._run(() => this._writeRaw(device, value, type)) }
  async _writeRaw(device, value, type = 'WORD') {
    if (!this.connected) throw new Error('PLC 미연결')
    const ls = lsAddr(device, this.cfg.lsMap, 'write')
    const { kind, addr } = ls || parseModbusAddr(device, type)
    if (addr < 0) throw new Error(`${device}: 쓰기 영역 밖 (LS 매핑상 M${this.cfg.lsMap?.bitWriteStart}·D${this.cfg.lsMap?.wordWriteStart} 이상만 쓰기 가능)`)
    if (kind === 'coil') {
      await this.client.writeCoil(addr, !!Number(value))
    } else if (type === 'DWORD' || type === 'FLOAT') {
      const buf = Buffer.alloc(4)
      if (type === 'FLOAT') buf.writeFloatBE(Number(value), 0)
      else buf.writeUInt32BE(Number(value) >>> 0, 0)
      const hi = buf.readUInt16BE(0), lo = buf.readUInt16BE(2)
      await this.client.writeRegisters(addr, this.cfg.wordOrder === 'little' ? [lo, hi] : [hi, lo])
    } else {
      await this.client.writeRegister(addr, Number(value) & 0xFFFF)
    }
    this.values[device] = Number(value)
    return true
  }

  setPollDevices(devices) {
    this.pollDevices = Array.from(new Set((devices || []).filter(Boolean)))
    if (this.connected) this._startPolling()
  }

  _startPolling() {
    this._stopPolling()
    if (!this.pollDevices.length) return
    this.pollTimer = setInterval(async () => {
      if (this.busy || !this.connected) return
      this.busy = true
      try { await this.read(this.pollDevices) }
      catch (e) { this.lastError = e.message }
      finally { this.busy = false }
    }, this.cfg.pollMs)
  }

  _stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
  }

  // PLC 자동 스캔 — 통신속도 × 국번 훑어 응답하는 첫 슬레이브 반환 (연결 안 된 상태에서 사용)
  async scan({ path, bauds = [9600, 19200, 38400, 115200], stationFrom = 1, stationTo = 8, testAddr = 0, parity = 'none' } = {}) {
    const ModbusRTU = await this._lib()
    const port = path || this.cfg.path
    for (const baud of bauds) {
      for (let st = stationFrom; st <= stationTo; st++) {
        const c = new ModbusRTU()
        c.setTimeout(300)
        try {
          await c.connectRTUBuffered(port, { baudRate: baud, dataBits: 8, parity, stopBits: 1 })
          c.setID(st)
          await c.readHoldingRegisters(testAddr, 1)
          await new Promise(r => c.close(r))
          return { ok: true, found: { path: port, baudRate: baud, station: st, parity } }
        } catch {
          try { await new Promise(r => c.close(r)) } catch { /* ignore */ }
        }
      }
    }
    return { ok: false, found: null }
  }
}

export const modbus = new ModbusManager()
export default modbus
