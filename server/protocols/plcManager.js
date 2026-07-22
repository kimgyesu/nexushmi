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
  }

  status() {
    return {
      connected: this.connected,
      config: { ...this.cfg },
      pollDevices: this.pollDevices,
      values: this.values,
      lastError: this.lastError,
    }
  }

  async connect(cfg = {}) {
    await this.disconnect()
    // 별칭 정규화: port→path, baud→baudRate
    if (cfg.port && !cfg.path) cfg.path = cfg.port
    if (cfg.baud && !cfg.baudRate) cfg.baudRate = Number(cfg.baud)
    if (cfg.station != null) cfg.station = Number(cfg.station)
    this.cfg = { ...this.cfg, ...cfg }
    this.transport = new SerialTransport(this.cfg)
    try {
      await this.transport.open()
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

  async disconnect() {
    this._stopPolling()
    if (this.transport) { try { await this.transport.close() } catch { /* ignore */ } }
    this.transport = null
    this.connected = false
  }

  // 디바이스 여러 개 읽기 — items: ['%MW100'] 또는 [{device:'%MD10', type:'FLOAT'}]
  async read(items) {
    if (!this.connected) throw new Error('PLC 미연결')
    const list = (items || []).map(it => (typeof it === 'string' ? { device: it, type: 'WORD' } : it))
    const out = {}
    for (let i = 0; i < list.length; i += 16) {
      const chunk = list.slice(i, i + 16)
      const devices = chunk.map(c => c.device)
      const frame = LsXgtCnet.buildReadIndividual(this.cfg.station, devices, { useBcc: this.cfg.useBcc })
      const resp = await this.transport.request(frame, { timeout: this.cfg.timeout, expectBcc: this.cfg.useBcc })
      const parsed = LsXgtCnet.parseResponse(resp, { littleEndian: this.cfg.littleEndian })
      if (!parsed.ok) throw new Error(`PLC 에러 ${parsed.error}: ${parsed.errorText || ''}`)
      chunk.forEach((c, idx) => {
        const hex = parsed.hexValues[idx]
        // 타입별 디코딩 (DWORD/FLOAT는 부호/IEEE754 처리)
        out[c.device] = hex != null
          ? LsXgtCnet.decodeValue(hex, c.type || 'WORD', { littleEndian: this.cfg.littleEndian })
          : parsed.values[idx]
      })
    }
    Object.assign(this.values, out)
    return out
  }

  // 디바이스 쓰기 — type: WORD/DWORD/FLOAT
  async write(device, value, type = 'WORD') {
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
