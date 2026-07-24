// PLC 연결 raw 테스트 (HMI 없이 터미널에서 검증) — Modbus RTU / LS XGT 전용
//   포트 목록 :  node server/plcTest.js ports
//   자동 스캔 :  node server/plcTest.js scan  --port COM3                    (Modbus 전용)
//   값 읽기   :  node server/plcTest.js read  --port COM3 --baud 9600 --station 1 --addr 100 --type WORD
//   값 쓰기   :  node server/plcTest.js write --port COM3 --baud 9600 --station 1 --addr 100 --value 1234
//   연속 폴링 :  node server/plcTest.js poll  --port COM3 --baud 9600 --station 1 --addr 100
//   XGT 전용  :  ... --protocol xgt --baud 115200 --addr %MW100   (주소는 %MW100 형식)
import { modbus } from './protocols/modbusManager.js'
import { plc } from './protocols/plcManager.js'
import { SerialTransport } from './protocols/serialTransport.js'

// --key value 파싱
const args = {}
const argv = process.argv.slice(2)
const cmd = argv[0] || 'help'
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { args[argv[i].slice(2)] = argv[i + 1]; i++ }
}
const cfg = {
  path: args.port || process.env.PLC_PORT || 'COM3',
  baudRate: Number(args.baud) || 9600,
  parity: args.parity || 'none',
  dataBits: Number(args.databits) || 8,
  stopBits: Number(args.stopbits) || 1,
  station: Number(args.station) || 1,
}
const addr = args.addr ?? '100'
const type = (args.type || 'WORD').toUpperCase()
const proto = (args.protocol || 'modbus').toLowerCase()
const mgr = proto === 'xgt' ? plc : modbus   // 프로토콜별 매니저 (read/write/poll 공용 인터페이스)
// --ls : LS XGB Modbus 매핑 적용 (M100·D100=읽기영역, M500·D500=쓰기영역). HMI와 동일하게 D/M 주소를 읽음.
// M/D 주소를 쓰면 자동으로 켜짐 (명시적으로 --ls 없어도)
const usesLsAddr = /^[md]\d+$/i.test(String(addr).trim())
if (args.ls === undefined && usesLsAddr) args.ls = true
if (args.ls) cfg.lsMap = { bitReadStart: 100, bitWriteStart: 500, wordReadStart: 100, wordWriteStart: 500 }

// Modbus CRC16
function crc16(buf) {
  let crc = 0xFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : crc >> 1
  }
  return crc
}
const hx = b => b.length ? [...b].map(x => x.toString(16).padStart(2, '0')).join(' ') : '(없음)'

async function main() {
  if (cmd === 'ports') {
    const ports = await SerialTransport.listPorts()
    if (!ports.length) return console.log('❌ 시리얼 포트를 찾지 못했습니다. 어댑터를 꽂았는지 확인하세요.')
    console.log('🔌 시리얼 포트:')
    for (const p of ports) console.log(`  ${p.path}  ${p.chip ? '['+p.chip+']' : ''}  ${p.friendlyName || p.manufacturer}${p.likelyAdapter ? '   ← RS485 어댑터로 추정' : ''}`)
    return
  }

  if (cmd === 'scan') {
    console.log(`🔍 스캔 시작 (${cfg.path}) — 통신속도 × 국번 1~8 ...`)
    const r = await modbus.scan({ path: cfg.path, testAddr: Number(String(addr).replace(/\D/g, '')) || 0 })
    if (r.ok) console.log(`✅ 응답하는 PLC 발견:`, r.found)
    else console.log('❌ 응답하는 PLC 없음. 배선(A/B)·PLC Modbus 슬레이브 설정·전원 확인.')
    return
  }

  if (cmd === 'raw') {
    // FC03 홀딩레지스터 1개 읽기 요청을 직접 보내고 수신 바이트 전체를 hex로 출력
    const { SerialPort } = await import('serialport')
    const a = Number(String(addr).replace(/\D/g, '')) || 0
    const req = Buffer.from([cfg.station, 0x03, (a >> 8) & 0xFF, a & 0xFF, 0x00, 0x01])
    const cc = crc16(req)
    const frame = Buffer.concat([req, Buffer.from([cc & 0xFF, (cc >> 8) & 0xFF])])
    const port = new SerialPort({ path: cfg.path, baudRate: cfg.baudRate, dataBits: cfg.dataBits, parity: cfg.parity, stopBits: cfg.stopBits, autoOpen: false })
    await new Promise((res, rej) => port.open(e => e ? rej(e) : res()))
    let buf = Buffer.alloc(0)
    port.on('data', d => { buf = Buffer.concat([buf, d]) })
    console.log('▶ 전송:', hx(frame))
    port.write(frame)
    await new Promise(r => setTimeout(r, 700))
    console.log('◀ 수신:', hx(buf))
    if (buf.length === 0) console.log('→ 응답 없음: 배선/극성(A↔B)/국번/전원 확인')
    else if (buf.length >= frame.length && buf.subarray(0, frame.length).equals(frame))
      console.log(`→ ⚠️ ECHO(반향) 감지! 수신 앞 ${frame.length}바이트가 전송과 동일. 컨버터가 자기 송신을 되받고 있음.`)
    else console.log('→ 데이터 수신됨 (에코 아님). 위 바이트로 판단.')
    await new Promise(r => port.close(r))
    return
  }

  if (cmd === 'diag') {
    const parities = args.parity ? [args.parity] : ['none', 'even', 'odd']
    const stops = args.stopbits ? [Number(args.stopbits)] : [1, 2]
    console.log(`🧪 프레임 자동 진단 (${cfg.path} @ ${cfg.baudRate}, 국번${cfg.station}, addr ${addr} ${type})`)
    for (const parity of parities) {
      for (const stopBits of stops) {
        process.stdout.write(`  parity=${parity} stop=${stopBits} ... `)
        try {
          await modbus.connect({ ...cfg, parity, stopBits })
          const v = await modbus.read([{ device: String(addr), type }])
          console.log(`✅ 성공! 값=${v[String(addr)]}  → 이 설정 사용: --parity ${parity} --stopbits ${stopBits}`)
          await modbus.disconnect()
          return
        } catch (e) {
          console.log(`✗ ${e.message}`)
          try { await modbus.disconnect() } catch { /* ignore */ }
        }
      }
    }
    console.log('❌ 모든 프레임 조합 실패 → 배선(A/B 극성)·종단저항·국번·PLC Modbus 설정 재확인.')
    return
  }

  console.log(`🔗 연결(${proto}): ${cfg.path} @ ${cfg.baudRate}/${cfg.parity}/국번${cfg.station}`)
  await mgr.connect(cfg)
  console.log('✅ 포트 열림')

  if (cmd === 'read') {
    const v = await mgr.read([{ device: String(addr), type }])
    console.log(`📖 ${addr} (${type}) =`, v[String(addr)])
  } else if (cmd === 'write') {
    await mgr.write(String(addr), Number(args.value), type)
    console.log(`✏️  ${addr} (${type}) ← ${args.value} 쓰기 완료`)
    const v = await mgr.read([{ device: String(addr), type }])
    console.log(`📖 재확인 =`, v[String(addr)])
  } else if (cmd === 'poll') {
    console.log('🔁 1초마다 읽기 (Ctrl+C 종료)')
    setInterval(async () => {
      try { const v = await mgr.read([{ device: String(addr), type }]); console.log(new Date().toLocaleTimeString(), addr, '=', v[String(addr)]) }
      catch (e) { console.log('⚠️', e.message) }
    }, 1000)
    return  // 폴링은 계속 — disconnect 안 함
  } else {
    console.log('사용법: ports | scan | read | write | poll  (파일 상단 주석 참고)')
  }
  await mgr.disconnect()
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
