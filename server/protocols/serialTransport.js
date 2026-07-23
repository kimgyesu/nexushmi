// 시리얼 송수신 — 요청 프레임 전송 후 응답(ETX[+BCC])까지 수신, 타임아웃/재시도
import { SerialPort } from 'serialport'

const ETX = 0x03

export class SerialTransport {
  constructor({ path, baudRate = 115200, dataBits = 8, parity = 'none', stopBits = 1 }) {
    this.opts = { path, baudRate, dataBits, parity, stopBits }
    this.port = null
  }

  static async listPorts() {
    const CHIP = { '0403': 'FTDI', '1a86': 'CH340', '10c4': 'CP210x', '067b': 'Prolific' }
    const ports = await SerialPort.list()
    return ports.map(p => {
      const vid = (p.vendorId || '').toLowerCase()
      const chip = CHIP[vid] || ''
      return {
        path: p.path,
        manufacturer: p.manufacturer || '',
        serialNumber: p.serialNumber || '',
        vendorId: p.vendorId || '', productId: p.productId || '',
        friendlyName: p.friendlyName || p.pnpId || '',
        chip,                              // FTDI/CH340/CP210x/Prolific
        likelyAdapter: !!chip,             // RS485 어댑터로 추정 → UI 자동선택 힌트
      }
    })
  }

  isOpen() {
    return !!(this.port && this.port.isOpen)
  }

  open() {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({ ...this.opts, autoOpen: false })
      this.port.open(err => (err ? reject(err) : resolve()))
    })
  }

  close() {
    return new Promise((resolve) => {
      if (this.port && this.port.isOpen) this.port.close(() => resolve())
      else resolve()
    })
  }

  // 프레임 전송 → 응답 수신 (ETX 발견 후 BCC 2바이트까지). expectBcc: 소문자 명령(BCC 사용) 여부
  request(frame, { timeout = 1000, expectBcc = true } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isOpen()) return reject(new Error('포트가 열려 있지 않습니다'))
      let buf = Buffer.alloc(0)

      const onData = (chunk) => {
        buf = Buffer.concat([buf, chunk])
        const etx = buf.indexOf(ETX)
        if (etx >= 0) {
          const need = etx + 1 + (expectBcc ? 2 : 0)
          if (buf.length >= need) {
            cleanup()
            resolve(buf.subarray(0, need))
          }
        }
      }
      const onErr = (e) => { cleanup(); reject(e) }
      const cleanup = () => {
        clearTimeout(timer)
        this.port.off('data', onData)
        this.port.off('error', onErr)
      }
      const timer = setTimeout(() => { cleanup(); reject(new Error('응답 타임아웃')) }, timeout)

      this.port.on('data', onData)
      this.port.on('error', onErr)
      // 수신 버퍼 비우고 전송
      this.port.flush(() => {
        this.port.write(frame, (err) => { if (err) onErr(err) })
      })
    })
  }
}

export default SerialTransport
