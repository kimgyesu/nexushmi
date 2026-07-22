// 디바이스(제어기/PLC) 모델 — 통신 설정 포함, 태그는 드롭다운으로 선택
export const DEVICE_PROTOCOLS = ['시뮬레이션', 'XGT Cnet (LS)', 'Modbus RTU', 'Modbus TCP', 'OPC-UA', 'MQTT', '기타']
export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200]
export const PARITIES = [{ id: 'none', label: 'None' }, { id: 'even', label: 'Even' }, { id: 'odd', label: 'Odd' }]

// 시리얼(직렬) 통신 프로토콜 — 포트/국번/속도/패리티가 필요
export const SERIAL_PROTOCOLS = ['XGT Cnet (LS)', 'Modbus RTU']
export const isSerial = p => SERIAL_PROTOCOLS.includes(p)

export const DEVICE_COLUMNS = [
  { key: 'name',     header: '디바이스명 (드라이버)', width: 200, type: 'text' },
  { key: 'protocol', header: '프로토콜',   width: 130, type: 'protocol' },
  { key: 'port',     header: '포트',       width: 80,  type: 'text' },   // COM3 또는 IP
  { key: 'station',  header: '국번',       width: 55,  type: 'number' },
  { key: 'baud',     header: '통신속도',   width: 90,  type: 'baud' },
  { key: 'parity',   header: '패리티',     width: 75,  type: 'parity' },
  { key: 'desc',     header: '설명',       width: 140, type: 'text' },
]

export function makeDevice(p = {}) {
  return {
    name: String(p.name ?? '').trim() || ('DEV_' + Math.random().toString(36).slice(2, 6).toUpperCase()),
    kind: String(p.kind ?? ''),
    driverId: String(p.driverId ?? ''),   // 드라이버 카탈로그 id (제조사/모델 선택 시 지정)
    protocol: DEVICE_PROTOCOLS.includes(p.protocol) ? p.protocol : '시뮬레이션',
    port: String(p.port ?? ''),        // 시리얼: COM3 / TCP: IP
    station: Number.isFinite(+p.station) ? +p.station : 1,
    baud: BAUD_RATES.includes(+p.baud) ? +p.baud : 115200,
    dataBits: Number(p.dataBits) || 8,
    parity: ['none', 'even', 'odd'].includes(p.parity) ? p.parity : 'none',
    stopBits: Number(p.stopBits) || 1,
    address: String(p.address ?? ''),
    desc: String(p.desc ?? ''),
  }
}

export const DEFAULT_DEVICES = [
  makeDevice({ name: 'PLC_01', kind: 'LS XGB', protocol: 'XGT Cnet (LS)', port: 'COM3', station: 1, baud: 115200, desc: '1호기 제어반' }),
  makeDevice({ name: 'PLC_02', kind: 'LS XGB', protocol: '시뮬레이션', station: 2, desc: '2호기 제어반' }),
]
