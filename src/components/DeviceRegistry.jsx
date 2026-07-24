import { useState, useEffect } from 'react'
import { Cpu, Plus, Trash2, X, FileText, Lock } from 'lucide-react'
import { DEVICE_COLUMNS, DEVICE_PROTOCOLS, BAUD_RATES, PARITIES, isSerial, makeDevice } from '../data/devices'
import { vendorsList, driversByVendor, getDriver, driverForDevice, isCustomDriver } from '../data/drivers'
import { plcStatus } from '../utils/api'
import { useAccess } from '../auth/access'
import DriverEditor from './DriverEditor'

// 통신방식 라벨
const CONN_LABEL = { serial: 'RS-232 / 485', ethernet: '이더넷', virtual: '가상' }

// 드라이버 선택 2단 패널 (제조사 → 기종/프로토콜) — CIMON/XGT 스타일
function DriverPicker({ current, onPick, onClose }) {
  const vendors = vendorsList()
  const [vendor, setVendor] = useState(() => {
    const cur = current ? getDriver(current) : null
    return cur?.vendor || vendors.find(v => v !== '가상') || vendors[0] || ''
  })
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="flex flex-col bg-[#0f1520] border border-[#2d3748] rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 'min(660px, 94vw)', height: 'min(480px, 88vh)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 h-11 bg-[#0d1117] border-b border-[#2d3748] flex-shrink-0">
          <Cpu size={15} className="text-[#60a5fa]" />
          <span className="text-[12px] font-bold text-[#e2e8f0]">드라이버 선택</span>
          <span className="text-[10px] text-[#4a5568] ml-1">제조사 → 기종/프로토콜</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0]"><X size={15} /></button>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* 좌 — 제조사 */}
          <div className="w-48 overflow-y-auto border-r border-[#2d3748]" style={{ background: '#0b0f18' }}>
            {vendors.map(v => (
              <button key={v} onClick={() => setVendor(v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors"
                style={v === vendor
                  ? { background: '#1e3a5f', color: '#93c5fd', borderLeft: '2px solid #3b82f6' }
                  : { color: '#cbd5e1', borderLeft: '2px solid transparent' }}
                onMouseEnter={e => { if (v !== vendor) e.currentTarget.style.background = '#141b28' }}
                onMouseLeave={e => { if (v !== vendor) e.currentTarget.style.background = 'transparent' }}>
                <span className="flex-1 truncate">{v}</span>
                <span className="text-[9px] text-[#4a5568]">{driversByVendor(v).length}</span>
              </button>
            ))}
          </div>
          {/* 우 — 기종/프로토콜 */}
          <div className="flex-1 overflow-y-auto p-2">
            {driversByVendor(vendor).map(d => {
              const sel = d.id === current
              return (
                <button key={d.id} onClick={() => { onPick(d.id); onClose() }}
                  className="w-full flex flex-col gap-0.5 px-3 py-2 rounded text-left mb-1 transition-colors"
                  style={sel ? { background: '#14532d', border: '1px solid #22c55e' } : { background: '#0f172a', border: '1px solid #1e2a4a' }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.borderColor = '#3b82f6' }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.borderColor = '#1e2a4a' }}>
                  <span className="text-[12px] font-bold" style={{ color: sel ? '#4ade80' : '#7dd3fc' }}>{d.name}</span>
                  <span className="text-[9.5px] text-[#64748b]">
                    {d.protocol} · {CONN_LABEL[d.conn] || d.conn}
                    {d.defaults?.baud ? ` · ${d.defaults.baud}bps` : ''}
                  </span>
                </button>
              )
            })}
            {driversByVendor(vendor).length === 0 && <p className="text-[11px] text-[#4a5568] px-3 py-4">이 제조사의 드라이버가 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({ device, col, index, onChange }) {
  const value = device[col.key] ?? ''
  const set = v => onChange(index, { [col.key]: v })
  const cls = 'w-full text-[10px] font-mono rounded px-1.5 py-1 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af]'
  const serial = driverForDevice(device).conn === 'serial'
  const [pickerOpen, setPickerOpen] = useState(false)

  // 디바이스명 = 드라이버 선택 (드라이버명·설정이 그대로 반영). 별도 드라이버 칸 없음
  if (col.key === 'name') {
    const selectDriver = id => {
      const d = getDriver(id)
      onChange(index, d ? { driverId: id, name: d.name, kind: d.name, protocol: d.protocol, ...d.defaults } : { driverId: '', name: '' })
    }
    const cur = device.driverId ? getDriver(device.driverId) : null
    return (
      <>
        <button onClick={() => setPickerOpen(true)} title="클릭 → 제조사·기종 선택"
          className="w-full text-[10px] font-mono font-bold rounded px-1.5 py-1 bg-[#0f172a] border border-[#1e2a4a] text-left hover:border-[#3b82f6] transition-colors truncate"
          style={{ color: cur ? '#7dd3fc' : '#64748b' }}>
          {cur ? cur.name : '— 드라이버 선택 ▾'}
        </button>
        {pickerOpen && <DriverPicker current={device.driverId} onPick={selectDriver} onClose={() => setPickerOpen(false)} />}
      </>
    )
  }

  if (col.type === 'protocol') {
    // 드라이버 지정 시 프로토콜은 자동(읽기전용), 없으면 수동 선택(하위호환)
    if (device.driverId) return <span className="text-[10px] font-mono" style={{ color: '#22c55e' }}>{getDriver(device.driverId)?.protocol || value}</span>
    return (
      <select value={value} onChange={e => set(e.target.value)} className={cls} style={{ color: '#22c55e' }}>
        {DEVICE_PROTOCOLS.map(p => <option key={p} value={p} style={{ background: '#0f172a', color: '#e2e8f0' }}>{p}</option>)}
      </select>
    )
  }
  if (col.type === 'baud') {
    if (!serial) return <span className="text-[9px] text-[#4a5568]">—</span>
    return (
      <select value={value} onChange={e => set(Number(e.target.value))} className={cls}>
        {BAUD_RATES.map(b => <option key={b} value={b} style={{ background: '#0f172a', color: '#e2e8f0' }}>{b}</option>)}
      </select>
    )
  }
  if (col.type === 'parity') {
    if (!serial) return <span className="text-[9px] text-[#4a5568]">—</span>
    return (
      <select value={value} onChange={e => set(e.target.value)} className={cls}>
        {PARITIES.map(p => <option key={p.id} value={p.id} style={{ background: '#0f172a', color: '#e2e8f0' }}>{p.label}</option>)}
      </select>
    )
  }
  if (col.type === 'number') {
    return <input type="number" value={value} onChange={e => set(Number(e.target.value))} className={cls} />
  }
  // 포트: 통신방식에 따라 (시리얼=COM3 / 이더넷=IP / 가상=—)
  if (col.key === 'port') {
    const conn = driverForDevice(device).conn
    if (conn === 'virtual') return <span className="text-[9px] text-[#4a5568]">—</span>
    return <input value={value} onChange={e => set(e.target.value)} placeholder={conn === 'serial' ? 'COM3' : 'IP'} className={cls} />
  }
  return <input type="text" value={value} spellCheck={false} onChange={e => set(e.target.value)} className={cls} />
}

// 연결 버튼 (시리얼 디바이스만)
// 연결 상태 표시 (버튼 아님) — 실제 연결은 런타임(RUN)에서 자동으로, 여기선 브리지 상태만 반영
function ConnStatus({ device }) {
  const [connected, setConnected] = useState(false)
  const access = useAccess()
  const driver = driverForDevice(device)
  const serialDev = driver.conn === 'serial'
  const norm = v => String(v || '').toUpperCase().trim()

  useEffect(() => {
    if (!serialDev) return
    let alive = true
    const check = () => plcStatus().then(s => {
      if (!alive) return
      const here = !!s?.connected && (!norm(device.port) || norm(s?.config?.path) === norm(device.port))
      setConnected(here)
    }).catch(() => { if (alive) setConnected(false) })
    check()
    const id = setInterval(check, 3000)
    return () => { alive = false; clearInterval(id) }
  }, [device.port, serialDev])

  if (!serialDev) return <span className="text-[9px] text-[#4a5568]">—</span>
  if (!access.plc) return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold"
      title="실장비 연결은 프리미엄 — 편집·시뮬레이션은 무료"
      style={{ background: '#2a1a08', color: '#fbbf24', border: '1px solid #a16207' }}>
      <Lock size={10} /> 프리미엄
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-bold"
      title={connected ? '실행 중 자동 연결됨' : 'RUN(실행) 시 자동 연결됩니다'}
      style={connected
        ? { background: '#14532d', color: '#22c55e', border: '1px solid #166534' }
        : { background: '#1a202c', color: '#64748b', border: '1px solid #2d3748' }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: connected ? '#22c55e' : '#475569' }} />
      {connected ? '연결됨' : '대기 (RUN 시 자동)'}
    </span>
  )
}

export default function DeviceRegistry({ open, devices, drivers = [], onClose, onUpdateDevice, onAddDevice, onDeleteDevice, onSaveDriver, onDeleteDriver }) {
  const [editorDriver, setEditorDriver] = useState(undefined) // undefined=닫힘, null=새로, obj=편집
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="flex flex-col bg-[#0f1520] border border-[#2d3748] rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 'min(1080px, 95vw)', height: 'min(600px, 90vh)' }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 h-12 bg-[#0d1117] border-b border-[#2d3748] flex-shrink-0">
          <Cpu size={16} className="text-[#60a5fa]" />
          <span className="text-[13px] font-bold text-[#e2e8f0]">디바이스 등록</span>
          <span className="text-[10px] text-[#4a5568] ml-1">{devices.length}대 · 통신 설정 포함</span>
          <button onClick={() => setEditorDriver(null)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold text-[#a78bfa] hover:bg-[#2d1b4e] transition-colors"
            style={{ border: '1px solid #7c3aed' }}>
            <Plus size={13} /> 드라이버 추가
          </button>
          <button onClick={() => onAddDevice(makeDevice({ name: '' }))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold text-[#00d4ff] hover:bg-[#0f2444] transition-colors"
            style={{ border: '1px solid #1e40af' }}>
            <Plus size={13} /> 디바이스 추가
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-[#e2e8f0] transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* 커스텀 드라이버 칩 */}
        {drivers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 flex-wrap flex-shrink-0" style={{ background: '#0b0f18', borderBottom: '1px solid #1e2a4a' }}>
            <span className="text-[9px] text-[#7c8aa5] font-bold">내 드라이버:</span>
            {drivers.map(d => (
              <span key={d.id} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]" style={{ background: '#1a1530', border: '1px solid #4c1d95', color: '#c4b5fd' }}>
                <button onClick={() => setEditorDriver(d)} title="클릭 → 드라이버 수정 (명칭·설정 변경)" className="font-bold hover:text-[#ddd6fe] hover:underline">{d.vendor} · {d.name}</button>
                {d.manual && <FileText size={9} className="text-[#60a5fa]" title="매뉴얼 첨부됨" />}
                <button onClick={() => setEditorDriver(d)} title="수정" className="text-[#a78bfa] hover:text-[#ddd6fe]"><Cpu size={9} /></button>
                <button onClick={() => { if (confirm(`드라이버 "${d.name}" 삭제?`)) onDeleteDriver?.(d.id) }} title="삭제" className="text-[#f87171] hover:text-[#fca5a5]"><X size={10} /></button>
              </span>
            ))}
          </div>
        )}

        {/* 테이블 */}
        <div className="flex-1 overflow-auto">
          {devices.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
              <Cpu size={32} className="text-[#2d3748]" />
              <p className="text-[12px] text-[#718096]">등록된 디바이스가 없습니다.</p>
              <p className="text-[10px] text-[#4a5568]">
                <span className="text-[#00d4ff]">디바이스 추가</span> 후 프로토콜을 <span className="text-[#22c55e]">XGT Cnet (LS)</span>로 선택하면<br />
                포트·국번·통신속도·패리티를 설정할 수 있습니다.
              </p>
            </div>
          ) : (
            <table className="text-[11px]" style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
              <thead>
                <tr className="bg-[#1a202c] sticky top-0 z-10">
                  <th className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase" style={{ borderBottom: '1px solid #2d3748', width: 32 }}>#</th>
                  {DEVICE_COLUMNS.map(col => (
                    <th key={col.key} className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase whitespace-nowrap"
                      style={{ borderBottom: '1px solid #2d3748', minWidth: col.width }}>{col.header}</th>
                  ))}
                  <th className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase" style={{ borderBottom: '1px solid #2d3748', width: 110 }}>상태</th>
                  <th style={{ borderBottom: '1px solid #2d3748', width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {devices.map((device, i) => (
                  <tr key={i} className="border-b border-[#1e2736] hover:bg-[#161d2a]">
                    <td className="px-2 py-1 text-[9px] text-[#4a5568] font-mono text-center">{i + 1}</td>
                    {DEVICE_COLUMNS.map(col => (
                      <td key={col.key} className="px-1 py-1" style={{ minWidth: col.width }}>
                        <Cell device={device} col={col} index={i} onChange={onUpdateDevice} />
                      </td>
                    ))}
                    <td className="px-1 py-1"><ConnStatus device={device} /></td>
                    <td className="px-1 py-1 text-center">
                      <button onClick={() => onDeleteDevice(i)} title="삭제"
                        className="p-1 rounded hover:bg-[#450a0a] text-[#4a5568] hover:text-[#ef4444] transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center px-4 h-10 bg-[#0d1117] border-t border-[#2d3748] flex-shrink-0">
          <span className="text-[9px] text-[#4a5568]">
            프로토콜이 <span className="text-[#22c55e]">XGT Cnet (LS)</span>면 포트(COM)·국번·통신속도를 설정하세요. <span className="text-[#00d4ff]">RUN(실행) 시 자동 연결</span>됩니다. (데이터8·스톱1 기본)
          </span>
          <button onClick={onClose}
            className="ml-auto px-4 py-1.5 rounded text-[11px] font-bold text-white transition-colors"
            style={{ background: '#1e40af', border: '1px solid #3b82f6' }}>
            닫기
          </button>
        </div>
      </div>

      {editorDriver !== undefined && (
        <DriverEditor driver={editorDriver}
          onSave={d => { onSaveDriver?.(d); setEditorDriver(undefined) }}
          onClose={() => setEditorDriver(undefined)} />
      )}
    </div>
  )
}
