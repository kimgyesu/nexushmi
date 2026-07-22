import { useState, useEffect } from 'react'
import { X, Tag as TagIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { VIRTUAL_DEVICE, isVirtualDevice } from '../data/tags'
import { driverForDevice, driverAreas, normalizeForDriver, validateForDriver, parseAreaAddr } from '../data/drivers'

// 종류 → 타입 매핑
const isDigital = t => t === 'BIT'
const ANALOG_SIZES = [
  { v: 'WORD', label: '워드 (16bit 정수)' },
  { v: 'DWORD', label: '더블워드 (32bit 정수)' },
  { v: 'FLOAT', label: '실수 (32bit float)' },
]

// 태그ID 자동생성 (그룹 + 이름)
const autoId = (utility, desc) => {
  const grp = (utility || '').trim()
  const base = `TAG_${grp ? grp + '_' : ''}${(desc || '').trim() || 'NEW'}`
  return base.toUpperCase().replace(/[^A-Z0-9_가-힣]/g, '_')
}

const fromTag = t => ({
  utility: t?.utility || '',
  id: t?.id || '',
  desc: t?.desc || '',
  note: t?.note || '',
  type: t?.type || 'BIT',
  isVirtual: isVirtualDevice(t?.device),
  device: isVirtualDevice(t?.device) ? '' : (t?.device || ''),
  address: t?.address || '',
  unit: t?.unit || '',
  min: t?.min ?? 0,
  max: t?.max ?? (t?.type === 'BIT' ? 1 : 100),
  decimals: t?.decimals ?? 0,
  digits: t?.digits ?? 0,
  value: t?.value ?? 0,
  inputMode: t?.inputMode || 'none',
})

// ── I/O 어드레스 필드 (실 디바이스: 영역 드롭다운 재사용) ─────────────────────
function AddressField({ form, devices, disabled, onChange }) {
  if (disabled) {
    return <input className={inpRO} value={form.address} readOnly tabIndex={-1} placeholder="가상 태그는 주소 자동(NB/ND)" />
  }
  const dev = devices.find(d => d.name === form.device)
  const driver = driverForDevice(dev)
  const areas = driverAreas(driver)
  if (areas) {
    const isNBND = /^N[BD]\d+$/i.test(String(form.address).trim())
    const raw = isNBND ? '' : form.address
    const { area, num } = parseAreaAddr(raw)
    const curArea = area || areas[0]
    const compose = (a, n) => n ? normalizeForDriver(driver, `${a}${n}`, form.type) : ''
    return (
      <div>
        <div className="flex items-center gap-1">
          <select value={curArea} onChange={e => onChange(compose(e.target.value, num))}
            className="text-[12px] font-mono rounded px-1 py-1.5 focus:outline-none flex-shrink-0"
            style={{ width: 64, background: '#111c33', border: '1px solid #1e2a4a', color: '#60a5fa' }} title="메모리 영역">
            {areas.map(a => <option key={a} value={a} style={{ background: '#0f172a' }}>{a}</option>)}
          </select>
          <input type="text" inputMode="numeric" value={num} spellCheck={false} placeholder="숫자"
            onChange={e => { const n = e.target.value.replace(/[^0-9.]/g, ''); onChange(compose(curArea, n)) }}
            className={inp + ' font-mono'} />
        </div>
        {raw && <div className="text-[10px] font-mono mt-1 text-[#22c55e]">✓ {form.address}</div>}
      </div>
    )
  }
  // 영역 없는 드라이버(Modbus 등): 그대로 입력 + 정규화
  const ok = validateForDriver(driver, form.address)
  return (
    <div>
      <input className={inp + ' font-mono'} value={form.address} spellCheck={false} placeholder={driver.addr?.hint || '주소'}
        onChange={e => onChange(e.target.value)}
        onBlur={e => { const a = normalizeForDriver(driver, e.target.value, form.type); if (a !== form.address) onChange(a) }} />
      {form.address && <div className="text-[10px] font-mono mt-1" style={{ color: ok ? '#22c55e' : '#60a5fa' }}>{ok ? `✓ ${driver.vendor}` : `→ ${normalizeForDriver(driver, form.address, form.type)}`}</div>}
    </div>
  )
}

const inp = 'w-full text-[12px] rounded px-2 py-1.5 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6]'
const inpRO = 'w-full text-[12px] rounded px-2 py-1.5 bg-[#0b1220] border border-[#182238] text-[#64748b] focus:outline-none cursor-not-allowed'
const lbl = 'text-[10px] font-bold text-[#7c8aa5] mb-1 block'

export default function TagEditDialog({ open, isNew, tag, groups = [], devices = [], pos, canPrev, canNext, onCommit, onNav, onClose }) {
  const [tab, setTab] = useState('general')
  const [form, setForm] = useState(() => fromTag(tag))
  const tagKey = isNew ? '__new__' : `${tag?.id}#${pos?.cur}`
  useEffect(() => { setForm(fromTag(tag)); setTab('general') }, [tagKey]) // 태그 전환 시 폼 리로드
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  if (!open) return null

  function buildPatch() {
    const id = form.id.trim() || autoId(form.utility, form.desc)
    const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }
    return {
      utility: form.utility.trim(), id, desc: form.desc, note: form.note.trim(),
      type: form.type, device: form.isVirtual ? VIRTUAL_DEVICE : form.device.trim(),
      address: form.isVirtual ? form.address : form.address,
      unit: form.unit, min: num(form.min, 0), max: num(form.max, form.type === 'BIT' ? 1 : 100),
      decimals: Math.max(0, Math.min(6, num(form.decimals, 0))), digits: Math.max(0, num(form.digits, 0)),
      value: num(form.value, 0), inputMode: form.inputMode,
    }
  }
  function submit() {
    if (!form.desc.trim() && !form.id.trim()) { alert('태그 이름을 입력하세요.'); return }
    onCommit(buildPatch()); onClose()
  }
  function navSave(dir) { onCommit(buildPatch()); onNav(dir) }

  // 종류 라디오
  const setKind = kind => {
    if (kind === 'digital') set('type', 'BIT')
    else if (kind === 'analog') setForm(s => ({ ...s, type: isDigital(s.type) ? 'WORD' : s.type }))
  }
  const kind = isDigital(form.type) ? 'digital' : 'analog'

  const KindRadio = ({ k, label }) => (
    <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-[#cbd5e1]">
      <input type="radio" checked={kind === k} onChange={() => setKind(k)} style={{ accentColor: '#3b82f6' }} /> {label}
    </label>
  )
  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
      <div className="w-[680px] max-h-[90vh] overflow-y-auto rounded-xl" style={{ background: '#0d1420', border: '1px solid #1e2a4a' }}>
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 sticky top-0 z-10" style={{ background: '#0d1420', borderBottom: '1px solid #1e2a4a' }}>
          <TagIcon size={16} className="text-[#a78bfa]" />
          <span className="text-[13px] font-bold text-[#e2e8f0]">{isNew ? '태그 추가' : '태그 편집'}</span>
          {!isNew && pos && <span className="text-[10px] text-[#4a5568]">{pos.cur + 1} / {pos.total}</span>}
          <button onClick={onClose} className="ml-auto text-[#64748b] hover:text-white p-1"><X size={16} /></button>
        </div>

        <div className="flex gap-3 p-4">
          {/* 좌측: 기본 정보 */}
          <div className="w-[280px] flex-shrink-0 space-y-3">
            <div>
              <label className={lbl}>그룹</label>
              <input className={inp} list="tag-groups" value={form.utility} onChange={e => set('utility', e.target.value)} placeholder="예: 옥외저장소" />
              <datalist id="tag-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
            </div>
            <div>
              <label className={lbl}>이름</label>
              <input className={inp} value={form.desc} onChange={e => set('desc', e.target.value)} placeholder="예: TK103 A_B 레벨" autoFocus />
            </div>
            <div>
              <label className={lbl}>종류</label>
              <div className="flex flex-col gap-1.5 p-2 rounded" style={{ background: '#0f172a', border: '1px solid #1e2a4a' }}>
                <KindRadio k="digital" label="디지털 (비트)" />
                <KindRadio k="analog" label="아날로그 (워드/실수)" />
                {kind === 'analog' && (
                  <select value={form.type} onChange={e => set('type', e.target.value)} className={inp + ' mt-1'}>
                    {ANALOG_SIZES.map(s => <option key={s.v} value={s.v}>{s.label}</option>)}
                  </select>
                )}
                <label className="flex items-center gap-1.5 text-[12px] text-[#3a4657] cursor-not-allowed">
                  <input type="radio" disabled /> 문자열 <span className="text-[9px]">(준비중)</span>
                </label>
              </div>
            </div>
            <div>
              <label className={lbl}>주석</label>
              <textarea className={inp + ' resize-none'} rows={3} value={form.note} onChange={e => set('note', e.target.value)} placeholder="메모 (선택)" />
            </div>
          </div>

          {/* 우측: 탭 */}
          <div className="flex-1 min-w-0">
            <div className="flex gap-1 mb-3">
              {[['general', '일반설정'], ['advanced', '고급설정']].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className="px-3 py-1.5 rounded-t text-[12px] font-bold"
                  style={tab === k ? { background: '#0f172a', color: '#e2e8f0', border: '1px solid #1e2a4a', borderBottom: 'none' } : { color: '#64748b' }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'general' && (
              <div className="space-y-3 p-3 rounded" style={{ background: '#0f172a', border: '1px solid #1e2a4a' }}>
                {/* 실태그 / 가상태그 세그먼트 */}
                <div className="flex rounded overflow-hidden" style={{ border: '1px solid #1e2a4a' }}>
                  {[[false, '실태그'], [true, '가상태그']].map(([v, label]) => (
                    <button key={label} onClick={() => set('isVirtual', v)}
                      className="flex-1 py-2 text-[12px] font-bold transition-colors"
                      style={form.isVirtual === v
                        ? { background: v ? '#4c1d95' : '#1e40af', color: '#fff' }
                        : { background: '#0d1420', color: '#64748b' }}>
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  <label className={lbl}>I/O 디바이스</label>
                  <select className={form.isVirtual ? inpRO : inp} value={form.device} disabled={form.isVirtual}
                    onChange={e => set('device', e.target.value)}>
                    <option value="">(선택)</option>
                    {devices.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl}>I/O 어드레스</label>
                  <AddressField form={form} devices={devices} disabled={form.isVirtual} onChange={v => set('address', v)} />
                </div>
                <div className="pt-2 text-[10px] text-[#4a5568] leading-relaxed" style={{ borderTop: '1px solid #1e2a4a' }}>
                  ℹ️ 모든 태그는 실행 시 <b className="text-[#7c8aa5]">자동으로 실시간 감시</b>됩니다(경보·상태). 별도 지정이 필요 없습니다.
                </div>
              </div>
            )}

            {tab === 'advanced' && (
              <div className="space-y-3 p-3 rounded" style={{ background: '#0f172a', border: '1px solid #1e2a4a' }}>
                <div>
                  <label className={lbl}>태그 ID <span className="text-[#4a5568] font-normal">(비우면 자동생성 · 변경 시 화면 바인딩 끊길 수 있음)</span></label>
                  <input className={inp + ' font-mono'} value={form.id} onChange={e => set('id', e.target.value)} placeholder={autoId(form.utility, form.desc)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>단위</label><input className={inp} value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="°C, MPa …" /></div>
                  <div><label className={lbl}>입력 모드</label>
                    <select className={inp} value={form.inputMode} onChange={e => set('inputMode', e.target.value)}>
                      <option value="none">없음 (읽기전용)</option>
                      <option value="numeric">숫자 입력</option>
                      <option value="text">문자 입력</option>
                    </select>
                  </div>
                  <div><label className={lbl}>최소값</label><input type="number" className={inp} value={form.min} onChange={e => set('min', e.target.value)} /></div>
                  <div><label className={lbl}>최대값</label><input type="number" className={inp} value={form.max} onChange={e => set('max', e.target.value)} /></div>
                  <div><label className={lbl}>소수 자리</label><input type="number" className={inp} value={form.decimals} onChange={e => set('decimals', e.target.value)} /></div>
                  <div><label className={lbl}>표시 자릿수</label><input type="number" className={inp} value={form.digits} onChange={e => set('digits', e.target.value)} /></div>
                  <div className="col-span-2"><label className={lbl}>초기값</label><input type="number" className={inp} value={form.value} onChange={e => set('value', e.target.value)} /></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-2 px-4 py-3 sticky bottom-0" style={{ background: '#0d1420', borderTop: '1px solid #1e2a4a' }}>
          {!isNew && (
            <>
              <button onClick={() => navSave(-1)} disabled={!canPrev}
                className="flex items-center gap-1 px-3 py-2 rounded text-[12px] font-bold"
                style={{ border: '1px solid #2d3748', color: canPrev ? '#94a3b8' : '#3a4657', cursor: canPrev ? 'pointer' : 'not-allowed' }}>
                <ChevronLeft size={13} /> 이전
              </button>
              <button onClick={() => navSave(1)} disabled={!canNext}
                className="flex items-center gap-1 px-3 py-2 rounded text-[12px] font-bold"
                style={{ border: '1px solid #2d3748', color: canNext ? '#94a3b8' : '#3a4657', cursor: canNext ? 'pointer' : 'not-allowed' }}>
                다음 <ChevronRight size={13} />
              </button>
            </>
          )}
          <button onClick={onClose} className="ml-auto px-4 py-2 rounded text-[12px] font-bold text-[#94a3b8]" style={{ border: '1px solid #2d3748' }}>취소</button>
          <button onClick={submit} className="px-5 py-2 rounded text-[12px] font-bold text-white" style={{ background: '#7c3aed', border: '1px solid #8b5cf6' }}>등록</button>
        </div>
      </div>
    </div>
  )
}
