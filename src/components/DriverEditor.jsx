import { useState, useRef } from 'react'
import { X, Cpu, Upload, FileText, Bot } from 'lucide-react'

const CONNS = [
  { id: 'serial', label: '시리얼 (RS232/485)' },
  { id: 'ethernet', label: '이더넷 (TCP)' },
  { id: 'virtual', label: '가상 (시뮬레이션)' },
]
const TRANSFORMS = [
  { id: 'raw', label: 'raw — 입력 그대로 (Modbus 레지스터 번호 등)' },
  { id: 'upper', label: 'upper — 대문자만 정리 (지멘스 M0.0, 옴론 CIO …)' },
  { id: 'ls', label: 'ls — LS % 형식 자동 (%MX0/%MW0, 비트·워드 구분)' },
]

const rid = () => 'custom-' + Math.random().toString(36).slice(2, 8)

export default function DriverEditor({ driver, onSave, onClose }) {
  const fileRef = useRef(null)
  const [f, setF] = useState(() => ({
    id: driver?.id || rid(),
    vendor: driver?.vendor || '',
    name: driver?.name || '',
    protocol: driver?.protocol || '',
    conn: driver?.conn || 'serial',
    transform: driver?.addr?.transform || 'upper',
    bit: driver?.addr?.bit || 'X', word: driver?.addr?.word || 'W', dword: driver?.addr?.dword || 'D',
    example: driver?.addr?.example || '',
    hint: driver?.addr?.hint || '',
    validate: driver?.addr?.validate || '',
    baud: driver?.defaults?.baud || 9600,
    parity: driver?.defaults?.parity || 'none',
    station: driver?.defaults?.station ?? 1,
    manual: driver?.manual || null,
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
    const defaults = {}
    if (f.conn === 'serial') { defaults.baud = Number(f.baud); defaults.parity = f.parity }
    defaults.station = Number(f.station)
    const out = {
      id: f.id, vendor: f.vendor.trim(), name: f.name.trim(),
      protocol: f.protocol.trim() || f.name.trim(), conn: f.conn, custom: true,
      addr: {
        transform: f.transform, example: f.example.trim(), hint: f.hint.trim() || '주소 입력',
        validate: f.validate.trim(),
        ...(f.transform === 'ls' ? { bit: f.bit || 'X', word: f.word || 'W', dword: f.dword || 'D' } : {}),
      },
      defaults,
      ...(f.manual ? { manual: f.manual } : {}),
    }
    onSave(out)
  }

  const inp = 'w-full text-[12px] rounded px-2 py-1.5 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]'
  const lbl = 'text-[10px] font-bold text-[#7c8aa5] mb-1 block'

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="w-[560px] max-h-[88vh] overflow-y-auto rounded-xl" style={{ background: '#0d1420', border: '1px solid #1e2a4a' }}>
        <div className="flex items-center gap-2 px-4 py-3 sticky top-0" style={{ background: '#0d1420', borderBottom: '1px solid #1e2a4a' }}>
          <Cpu size={16} className="text-[#a78bfa]" />
          <span className="text-[13px] font-bold text-[#e2e8f0]">{driver ? '드라이버 편집' : '커스텀 드라이버 추가'}</span>
          <button onClick={onClose} className="ml-auto text-[#64748b] hover:text-white p-1"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={lbl}>제조사</label><input className={inp} value={f.vendor} onChange={e => set('vendor', e.target.value)} placeholder="예: 지멘스, 우리회사PLC" /></div>
            <div><label className={lbl}>모델 / 드라이버명</label><input className={inp} value={f.name} onChange={e => set('name', e.target.value)} placeholder="예: S7-1200" /></div>
            <div><label className={lbl}>프로토콜</label><input className={inp} value={f.protocol} onChange={e => set('protocol', e.target.value)} placeholder="예: S7comm, Modbus RTU" /></div>
            <div><label className={lbl}>통신 방식</label>
              <select className={inp} value={f.conn} onChange={e => set('conn', e.target.value)}>{CONNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1e2a4a', paddingTop: 12 }}>
            <label className={lbl}>주소 처리 방식</label>
            <select className={inp} value={f.transform} onChange={e => set('transform', e.target.value)}>{TRANSFORMS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            {f.transform === 'ls' && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div><label className={lbl}>비트 크기문자</label><input className={inp} value={f.bit} onChange={e => set('bit', e.target.value)} /></div>
                <div><label className={lbl}>워드 크기문자</label><input className={inp} value={f.word} onChange={e => set('word', e.target.value)} /></div>
                <div><label className={lbl}>더블워드 크기문자</label><input className={inp} value={f.dword} onChange={e => set('dword', e.target.value)} /></div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div><label className={lbl}>주소 예시</label><input className={inp} value={f.example} onChange={e => set('example', e.target.value)} placeholder="예: M0.0, DB1.DBW0" /></div>
              <div><label className={lbl}>입력 힌트(placeholder)</label><input className={inp} value={f.hint} onChange={e => set('hint', e.target.value)} placeholder="예: 지멘스 형식" /></div>
            </div>
            <div className="mt-2"><label className={lbl}>주소 검증 정규식 (선택)</label><input className={`${inp} font-mono`} value={f.validate} onChange={e => set('validate', e.target.value)} placeholder="예: ^[IQM]\\d+(\\.\\d+)?$" /></div>
          </div>

          {f.conn === 'serial' && (
            <div className="grid grid-cols-3 gap-2" style={{ borderTop: '1px solid #1e2a4a', paddingTop: 12 }}>
              <div><label className={lbl}>통신속도</label><input type="number" className={inp} value={f.baud} onChange={e => set('baud', e.target.value)} /></div>
              <div><label className={lbl}>패리티</label><select className={inp} value={f.parity} onChange={e => set('parity', e.target.value)}><option value="none">None</option><option value="even">Even</option><option value="odd">Odd</option></select></div>
              <div><label className={lbl}>기본 국번</label><input type="number" className={inp} value={f.station} onChange={e => set('station', e.target.value)} /></div>
            </div>
          )}

          {/* 통신 매뉴얼 업로드 (나중에 AI가 읽어 자동 생성/검증) */}
          <div style={{ borderTop: '1px solid #1e2a4a', paddingTop: 12 }}>
            <label className={lbl}>통신 매뉴얼 (PDF) — 첨부하면 나중에 편집기 AI가 읽어 드라이버를 자동 생성·검증</label>
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
