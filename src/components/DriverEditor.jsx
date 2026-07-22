import { useState, useRef } from 'react'
import { X, Cpu, Upload, FileText, Bot, Sparkles } from 'lucide-react'

const CONNS = [
  { id: 'serial', label: '시리얼 (RS232/485)' },
  { id: 'ethernet', label: '이더넷 (TCP)' },
  { id: 'virtual', label: '가상 (시뮬레이션)' },
]

// 커스텀 드라이버 기본 주소 방식: 영역 드롭다운 + 숫자, 크기문자(X/W/D)는 자동
//   ls 변환이 %[영역][크기][번호] 완성 (예: 영역 M + 워드 + 100 → %MW100)
const DEFAULT_ADDR = {
  transform: 'ls',
  bit: 'X', word: 'W', dword: 'D',
  areas: ['M', 'D', 'R', 'P', 'K', 'L', 'F', 'T', 'C', 'U', 'Z', 'N'],
  hint: '영역+숫자',
}

const rid = () => 'custom-' + Math.random().toString(36).slice(2, 8)

export default function DriverEditor({ driver, onSave, onClose }) {
  const fileRef = useRef(null)
  const [f, setF] = useState(() => ({
    id: driver?.id || rid(),
    vendor: driver?.vendor || '',
    name: driver?.name || '',
    protocol: driver?.protocol || '',
    conn: driver?.conn || 'serial',
    // 시리얼
    baud: driver?.defaults?.baud || 9600,
    parity: driver?.defaults?.parity || 'none',
    // 공통
    station: driver?.defaults?.station ?? 1,
    // 이더넷
    ip: driver?.defaults?.ip || '192.168.0.10',
    subnet: driver?.defaults?.subnet || '255.255.255.0',
    gateway: driver?.defaults?.gateway || '192.168.0.1',
    port: driver?.defaults?.port ?? 502,
    manual: driver?.manual || null,
    // 기존 주소 방식은 그대로 보존(없으면 접두어 자동)
    addr: driver?.addr || DEFAULT_ADDR,
  }))
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  function pickManual(e) {
    const file = e.target.files?.[0]; if (!file) return
    const r = new FileReader()
    r.onload = () => set('manual', { name: file.name, dataUrl: r.result, size: file.size })
    r.readAsDataURL(file)
  }

  function save() {
    if (!f.vendor.trim() || !f.name.trim()) { alert('제조사와 모델/드라이버명을 입력하세요.'); return }
    const defaults = { station: Number(f.station) }
    if (f.conn === 'serial') { defaults.baud = Number(f.baud); defaults.parity = f.parity }
    if (f.conn === 'ethernet') {
      defaults.ip = f.ip.trim(); defaults.subnet = f.subnet.trim()
      defaults.gateway = f.gateway.trim(); defaults.port = Number(f.port)
    }
    const out = {
      id: f.id, vendor: f.vendor.trim(), name: f.name.trim(),
      // 프로토콜은 매뉴얼/AI가 자동 채움 — 지금은 모델명으로 임시 대체(드라이버 매칭용)
      protocol: f.protocol.trim() || f.name.trim(), conn: f.conn, custom: true,
      addr: f.addr,
      defaults,
      ...(f.manual ? { manual: f.manual } : {}),
    }
    onSave(out)
  }

  const inp = 'w-full text-[12px] rounded px-2 py-1.5 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]'
  const inpRO = 'w-full text-[12px] rounded px-2 py-1.5 bg-[#0b1220] border border-[#182238] text-[#64748b] focus:outline-none cursor-not-allowed'
  const lbl = 'text-[10px] font-bold text-[#7c8aa5] mb-1 block'
  const req = <span className="text-[#f87171] ml-0.5">*</span>

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className="w-[560px] max-h-[88vh] overflow-y-auto rounded-xl" style={{ background: '#0d1420', border: '1px solid #1e2a4a' }}>
        <div className="flex items-center gap-2 px-4 py-3 sticky top-0" style={{ background: '#0d1420', borderBottom: '1px solid #1e2a4a' }}>
          <Cpu size={16} className="text-[#a78bfa]" />
          <span className="text-[13px] font-bold text-[#e2e8f0]">{driver ? '드라이버 편집' : '커스텀 드라이버 추가'}</span>
          <button onClick={onClose} className="ml-auto text-[#64748b] hover:text-white p-1"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>제조사{req}</label><input className={inp} value={f.vendor} onChange={e => set('vendor', e.target.value)} placeholder="예: 지멘스, 우리회사PLC" /></div>
            <div><label className={lbl}>모델 / 드라이버명{req}</label><input className={inp} value={f.name} onChange={e => set('name', e.target.value)} placeholder="예: S7-1200" /></div>
            <div>
              <label className={lbl}>프로토콜 <span className="text-[#4a5568] font-normal">(매뉴얼에서 자동)</span></label>
              <input className={inpRO} value={f.protocol} readOnly tabIndex={-1}
                placeholder="매뉴얼 업로드 시 자동 생성" />
            </div>
            <div><label className={lbl}>통신 방식{req}</label>
              <select className={inp} value={f.conn} onChange={e => set('conn', e.target.value)}>{CONNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            </div>
          </div>

          {/* 통신 파라미터 — 통신방식에 따라 전환 */}
          {f.conn === 'serial' && (
            <div className="grid grid-cols-4 gap-2" style={{ borderTop: '1px solid #1e2a4a', paddingTop: 12 }}>
              <div><label className={lbl}>통신속도</label>
                <select className={inp} value={f.baud} onChange={e => set('baud', e.target.value)}>
                  {[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div><label className={lbl}>패리티</label><select className={inp} value={f.parity} onChange={e => set('parity', e.target.value)}><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></div>
              <div className="col-span-2"><label className={lbl}>기본 국번</label><input type="number" className={inp} value={f.station} onChange={e => set('station', e.target.value)} /></div>
            </div>
          )}
          {f.conn === 'ethernet' && (
            <div style={{ borderTop: '1px solid #1e2a4a', paddingTop: 12 }}>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>IP 주소</label><input className={`${inp} font-mono`} value={f.ip} onChange={e => set('ip', e.target.value)} placeholder="192.168.0.10" /></div>
                <div><label className={lbl}>서브넷 마스크</label><input className={`${inp} font-mono`} value={f.subnet} onChange={e => set('subnet', e.target.value)} placeholder="255.255.255.0" /></div>
                <div><label className={lbl}>게이트웨이</label><input className={`${inp} font-mono`} value={f.gateway} onChange={e => set('gateway', e.target.value)} placeholder="192.168.0.1" /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={lbl}>포트</label><input type="number" className={inp} value={f.port} onChange={e => set('port', e.target.value)} /></div>
                  <div><label className={lbl}>국번(Unit)</label><input type="number" className={inp} value={f.station} onChange={e => set('station', e.target.value)} /></div>
                </div>
              </div>
            </div>
          )}
          {f.conn === 'virtual' && (
            <div className="text-[10px] text-[#4a5568] flex items-center gap-1.5" style={{ borderTop: '1px solid #1e2a4a', paddingTop: 12 }}>
              가상(시뮬레이션) 드라이버는 통신 파라미터가 필요 없습니다.
            </div>
          )}

          {/* 주소 입력 안내 — 이 폼에서 설정하지 않고 태그 생성 시 자동 */}
          <div className="flex items-start gap-2 p-2.5 rounded" style={{ background: '#0f172a', border: '1px solid #1e2a4a', borderTop: '1px solid #1e2a4a' }}>
            <Sparkles size={13} className="text-[#a78bfa] mt-0.5 flex-shrink-0" />
            <div className="text-[10px] text-[#94a3b8] leading-relaxed">
              <b className="text-[#cbd5e1]">주소 방식</b>은 여기서 설정하지 않습니다. 태그를 만들 때
              <span className="text-[#a78bfa] font-mono"> 영역(M·D·R…) </span>을 드롭다운에서 고르고 <b className="text-[#cbd5e1]">숫자만</b> 입력하면, 비트/워드 선택에 따라 크기문자가 붙어
              <span className="text-[#60a5fa] font-mono"> %MW100·%MX0·%DD10 </span>처럼 자동 완성됩니다. 매뉴얼을 첨부하면 영역·형식이 실제 사양으로 보정됩니다.
            </div>
          </div>

          {/* 통신 매뉴얼 업로드 (나중에 AI가 읽어 프로토콜·주소 자동 생성/검증) */}
          <div style={{ borderTop: '1px solid #1e2a4a', paddingTop: 12 }}>
            <label className={lbl}>통신 매뉴얼 (PDF) — 첨부하면 나중에 편집기 AI가 읽어 프로토콜·주소를 자동 생성·검증</label>
            <input ref={fileRef} type="file" accept=".pdf" onChange={pickManual} className="hidden" />
            {f.manual ? (
              <div className="flex items-center gap-2 p-2 rounded" style={{ background: '#0f172a', border: '1px solid #1e2a4a' }}>
                <FileText size={14} className="text-[#60a5fa]" />
                <span className="text-[11px] text-[#cbd5e1] truncate flex-1">{f.manual.name} <span className="text-[#4a5568]">({Math.round((f.manual.size || 0) / 1024)}KB)</span></span>
                <button onClick={() => set('manual', null)} className="text-[#f87171] p-1"><X size={12} /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-3 py-2 rounded text-[11px] text-[#60a5fa]" style={{ background: '#0f172a', border: '1px dashed #1e40af' }}>
                <Upload size={13} /> 매뉴얼 PDF 업로드
              </button>
            )}
            <div className="flex items-center gap-1.5 mt-2 text-[10px] text-[#4a5568]"><Bot size={11} /> AI 자동 생성은 다음 단계에서 이 매뉴얼을 사용합니다.</div>
          </div>
        </div>

        <div className="flex gap-2 px-4 py-3 sticky bottom-0" style={{ background: '#0d1420', borderTop: '1px solid #1e2a4a' }}>
          <button onClick={onClose} className="flex-1 py-2 rounded text-[12px] font-bold text-[#94a3b8]" style={{ border: '1px solid #2d3748' }}>취소</button>
          <button onClick={save} className="flex-1 py-2 rounded text-[12px] font-bold text-white" style={{ background: '#7c3aed', border: '1px solid #8b5cf6' }}>저장</button>
        </div>
      </div>
    </div>
  )
}
