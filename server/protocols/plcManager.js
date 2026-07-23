// LS XGB Cnet PLC 매니저 — 연결/읽기/쓰기/주기 폴링
import { SerialTransport } from './serialTransport.js'
import { LsXgtCnet } from './lsXgtCnet.js'

const DEFAULTS = {
  path: process.env.PLC_PORT || 'COM3',
  baudRate: Number(process.env.PLC_BAUD) || 115200,
  dataBits: 8, parity: 'none', stopBits: 1,
  station: Number(process.env.PLC_STATION) || 1,
  useBcc: true,        // 소문자 명령 + BCC (잡음 환경 권장)
  littleEndian: false, // XGT = 빅엔디안
  timeout: 1000,
  pollMs: 1000,
}

export class PlcManager {
  constructor() {
    this.cfg = { ...DEFAULTS }
    this.transport = null
    this.connected = false
    this.lastError = null
    this.values = {}            // device(%MW100) -> 정수값
    this.pollDevices = []       // 주기 폴링 대상 디바이스 목록
    this.pollTimer = null
    this.busy = false
    this._connecting = null     // 연결 호출 직렬화 (StrictMode 이중마운트 방지)
    this._q = null              // 트랜잭션 직렬화 체인 (읽기↔쓰기 겹침 방지)
  }

  status() {
    return {
      protocol: 'xgt',
      connected: this.connected,
      config: { ...this.cfg },
      pollDevices: this.pollDevices,
      values: this.values,
      lastError: this.lastError,
    }
  }

  // 동시 연결 호출 직렬화 (StrictMode 이중마운트/빠른 재RUN 시 포트 꼬임 방지)
  async connect(cfg = {}) {
    while (this._connecting) { try { await this._connecting } catch { /* ignore */ } }
    this._connecting = this._doConnect(cfg)
    try { return await this._connecting }
    finally { this._connecting = null }
  }

  async _doConnect(cfg = {}) {
    // 별칭 정규화: port→path, baud→baudRate
    if (cfg.port && !cfg.path) cfg.path = cfg.port
    if (cfg.baud && !cfg.baudRate) cfg.baudRate = Number(cfg.baud)
    if (cfg.station != null) cfg.station = Number(cfg.station)
    const next = { ...this.cfg, ...cfg }
    // 같은 설정으로 포트가 실제 열려있으면 재사용 (close→reopen 레이스 방지)
    if (this.connected && this.transport && this.transport.isOpen() &&
        this.cfg.path === next.path && this.cfg.baudRate === next.baudRate && this.cfg.station === next.station) {
      this.cfg = next
      return true
    }
    await this.disconnect()
    this.cfg = next
    const transport = new SerialTransport(this.cfg)
    try {
      await transport.open()
      this.transport = transport
      this.connected = true
      this.lastError = null
      if (this.pollDevices.length) this._startPolling()
      return true
    } catch (e) {
      this.connected = false
      this.lastError = e.message
      throw e
    }
  }

  // 모든 시리얼 트랜잭션을 순서대로 처리 (읽기 폴링 ↔ 쓰기 겹침 방지)
  _run(fn) {
    const result = (this._q || Promise.resolve()).then(() => fn())
    this._q = result.catch(() => {})
    return result
  }

  async disconnect() {
    this._stopPolling()
    if (this.transport) { try { await this.transport.close() } catch { /* ignore */ } }
    this.transport = null
    this.connected = false
  }

  // 디바이스 여러 개 읽기 — items: ['%MW100'] 또는 [{device:'%MD10', type:'FLOAT'}]
  read(items) { return this._run(() => this._readRaw(items)) }
  async _readRaw(items) {
    if (!this.connected) throw new Error('PLC 미연결')
    const list = (items || []).map(it => (typeof it === 'string' ? { device: it, type: 'WORD' } : it))
    // XGT 개별읽기(RSS)는 한 요청에 "같은 크기(X/B/W/D/L)"만 허용 → 크기문자별로 그룹핑
    const groups = {}
    for (const c of list) {
      const m = /^%[A-Z]([XBWDL])/i.exec(c.device)
      const sz = (m ? m[1] : 'W').toUpperCase()
      ;(groups[sz] || (groups[sz] = [])).push(c)
    }
    const out = {}
    const errs = []
    for (const g of Object.values(groups)) {
     for (let i = 0; i < g.length; i += 16) {
      const chunk = g.slice(i, i + 16)
      try {
        const devices = chunk.map(c => c.device)
        const frame = LsXgtCnet.buildReadIndividual(this.cfg.station, devices, { useBcc: this.cfg.useBcc })
        const resp = await this.transport.request(frame, { timeout: this.cfg.timeout, expectBcc: this.cfg.useBcc })
        const parsed = LsXgtCnet.parseResponse(resp, { littleEndian: this.cfg.littleEndian })
        if (!parsed.ok) throw new Error(`${parsed.error}: ${parsed.errorText || ''}`)
        chunk.forEach((c, idx) => {
          const hex = parsed.hexValues[idx]
          // 타입별 디코딩 (DWORD/FLOAT는 부호/IEEE754 처리)
          out[c.device] = hex != null
            ? LsXgtCnet.decodeValue(hex, c.type || 'WORD', { littleEndian: this.cfg.littleEndian })
            : parsed.values[idx]
        })
      } catch (e) {
        // 한 블록(16개) 실패해도 나머지는 계속
        errs.push(e.message)
      }
     }
    }
    Object.assign(this.values, out)
    this.lastError = errs.length ? errs.join(' / ') : null
    return out
  }

  // 디바이스 쓰기 — type: WORD/DWORD/FLOAT
  write(device, value, type = 'WORD') { return this._run(() => this._writeRaw(device, value, type)) }
  async _writeRaw(device, value, type = 'WORD') {
    if (!this.connected) throw new Error('PLC 미연결')
    const frame = LsXgtCnet.buildWriteIndividual(this.cfg.station, [{ device, value, type }],
      { useBcc: this.cfg.useBcc, littleEndian: this.cfg.littleEndian })
    const resp = await this.transport.request(frame, { timeout: this.cfg.timeout, expectBcc: this.cfg.useBcc })
    const parsed = LsXgtCnet.parseResponse(resp, { littleEndian: this.cfg.littleEndian })
    if (!parsed.ok) throw new Error(`PLC 쓰기 에러 ${parsed.error}: ${parsed.errorText || ''}`)
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
}

export const plc = new PlcManager()
export default plc
