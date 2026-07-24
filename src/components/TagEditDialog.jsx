import { useState, useEffect } from 'react'
import { X, Tag as TagIcon, ChevronLeft, ChevronRight, Calculator, Sparkles, Loader2 } from 'lucide-react'
import { VIRTUAL_DEVICE, isVirtualDevice } from '../data/tags'
import { driverForDevice, driverAreas, normalizeForDriver, validateForDriver, parseAreaAddr } from '../data/drivers'
import { tryFormula, formulaVars } from '../utils/formula'
import { genFormula } from '../utils/api'

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
  formula: t?.formula || '',
  watchActual: t?.watchActual || '',
  watchTol: t?.watchTol ?? 5,
  writeTo: t?.writeTo || '',
  writeMin: t?.writeMin ?? '',
  writeMax: t?.writeMax ?? '',
  writeRate: t?.writeRate ?? '',
  writeHeartbeat: t?.writeHeartbeat || '',
  alarmHigh: t?.alarmHigh ?? '',
  alarmLow: t?.alarmLow ?? '',
  alarmHint: t?.alarmHint || '',
  alarmArea: t?.alarmArea || '',
  alarmBit: t?.alarmBit || '',
  logEvent: !!t?.logEvent,
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
    const compose = (a, n) => n ? normalizeForDriver(driver, `${a}${n}`, form.type) : a
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
        {num && <div className="text-[10px] font-mono mt-1 text-[#22c55e]">✓ {form.address}</div>}
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

export default function TagEditDialog({ open, isNew, tag, groups = [], devices = [], allTags = [], pos, canPrev, canNext, onCommit, onNav, onClose }) {
  const [tab, setTab] = useState('general')
  const [form, setForm] = useState(() => fromTag(tag))
  const [aiDesc, setAiDesc] = useState('')       // AI 수식 생성용 설명
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')

  async function makeFormulaAI() {
    if (!aiDesc.trim() || aiBusy) return
    setAiBusy(true); setAiErr('')
    try {
      const f = await genFormula(aiDesc.trim(), allTags)
      if (f) set('formula', f)
      else setAiErr('수식을 만들지 못했어요')
    } catch (e) { setAiErr(e.message) }
    finally { setAiBusy(false) }
  }
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
      formula: form.formula.trim(),
      watchActual: form.formula.trim() ? form.watchActual : '',
      watchTol: num(form.watchTol, 5),
      writeTo: form.writeTo.trim(),
      writeMin: form.writeMin, writeMax: form.writeMax, writeRate: form.writeRate,
      writeHeartbeat: form.writeHeartbeat.trim(),
      alarmHigh: form.alarmHigh, alarmLow: form.alarmLow, alarmHint: form.alarmHint.trim(),
      alarmArea: form.alarmArea.trim(), alarmBit: form.alarmBit, logEvent: form.logEvent,
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

  // 계산 태그(수식) 미리보기 — 다른 태그 현재값으로 계산
  const tagVals = {}; for (const t of allTags) if (t.id !== form.id) tagVals[t.id] = Number(t.value) || 0
  const fExpr = form.formula.trim()
  const fPreview = fExpr ? tryFormula(fExpr, tagVals) : null
  const fUnknown = fExpr ? formulaVars(fExpr).filter(v => !(v in tagVals) && !['PI', 'E', 'TRUE', 'FALSE'].includes(v.toUpperCase())) : []
  // 예상↔실제 감시 미리보기
  const watchAct = fExpr && form.watchActual ? allTags.find(t => t.id === form.watchActual) : null
  let watchDev = null, watchOver = false
  if (watchAct && fPreview && !fPreview.error) {
    const exp = Number(fPreview.value), actual = Number(watchAct.value) || 0
    const base = Math.abs(exp) > 1e-9 ? Math.abs(exp) : (Math.abs(actual) || 1)
    watchDev = Math.abs(exp - actual) / base * 100
    watchOver = watchDev > (Number(form.watchTol) || 5)
  }

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
                {/* 계산 태그 (수식) */}
                <div className="p-2.5 rounded" style={{ background: '#0b1220', border: '1px solid #1e3a5f' }}>
                  <label className={lbl + ' flex items-center gap-1'}><Calculator size={11} className="text-[#60a5fa]" /> 계산 수식 <span className="text-[#4a5568] font-normal">(다른 태그로 자동 계산 — 비우면 일반 태그)</span></label>
                  {/* AI 수식 생성 */}
                  <div className="flex gap-1 mb-1.5">
                    <input className={inp + ' text-[11px]'} value={aiDesc} onChange={e => setAiDesc(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); makeFormulaAI() } }}
                      placeholder="AI에게 설명: 리코일러는 감길수록 느리게 (직경 커질수록 RPM↓)" />
                    <button onClick={makeFormulaAI} disabled={aiBusy || !aiDesc.trim()}
                      className="flex items-center gap-1 px-2.5 rounded text-[11px] font-bold whitespace-nowrap"
                      style={{ background: '#4c1d95', color: '#e9d5ff', border: '1px solid #7c3aed', opacity: (aiBusy || !aiDesc.trim()) ? 0.5 : 1 }}>
                      {aiBusy ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} AI 생성
                    </button>
                  </div>
                  {aiErr && <div className="text-[10px] text-[#f87171] mb-1">⚠ {aiErr}</div>}
                  <textarea className={inp + ' font-mono resize-none'} rows={2} value={form.formula}
                    onChange={e => set('formula', e.target.value)}
                    placeholder="예: TAG_LINE_SPEED / (PI * (TAG_DIA/1000))" />
                  {fExpr && (
                    <div className="mt-1.5 text-[11px] font-mono">
                      {fUnknown.length > 0
                        ? <span className="text-[#f59e0b]">⚠ 없는 태그: {fUnknown.join(', ')}</span>
                        : fPreview?.error
                          ? <span className="text-[#f87171]">❌ {fPreview.error}</span>
                          : <span className="text-[#22c55e]">✓ 현재 계산값 = {Number(fPreview?.value).toFixed(form.decimals || 2)}</span>}
                    </div>
                  )}
                  <div className="mt-1 text-[9px] text-[#4a5568] leading-relaxed">
                    태그ID로 참조 · <span className="font-mono">+ - * / % ^ ( )</span> · 함수 <span className="font-mono">sqrt abs min max round</span> · 조건 <span className="font-mono">A&gt;10 ? 1 : 0</span> · 상수 <span className="font-mono">PI</span>
                  </div>
                </div>

                {/* 예상 ↔ 실제 감시 (계산 수식이 있을 때만) */}
                {fExpr && (
                  <div className="p-2.5 rounded" style={{ background: '#1a1206', border: '1px solid #78500f' }}>
                    <label className={lbl}>🔍 예상 ↔ 실제 감시 <span className="text-[#4a5568] font-normal">(런타임 AI가 편차 넘으면 알림)</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] text-[#7c8aa5] block mb-0.5">실제 측정 태그</span>
                        <select className={inp} value={form.watchActual} onChange={e => set('watchActual', e.target.value)}>
                          <option value="">(감시 안 함)</option>
                          {allTags.filter(t => t.id !== form.id && !t.formula).map(t => <option key={t.id} value={t.id}>{t.desc || t.id}</option>)}
                        </select>
                      </div>
                      <div>
                        <span className="text-[9px] text-[#7c8aa5] block mb-0.5">허용 편차 %</span>
                        <input type="number" className={inp} value={form.watchTol} min={0} onChange={e => set('watchTol', e.target.value)} />
                      </div>
                    </div>
                    {watchDev != null && (
                      <div className="mt-1.5 text-[11px] font-mono" style={{ color: watchOver ? '#f59e0b' : '#22c55e' }}>
                        예상 {Number(fPreview.value).toFixed(1)} vs 실제 {(Number(watchAct?.value) || 0).toFixed(1)} → 편차 {Math.round(watchDev)}% {watchOver ? '⚠ 허용 초과' : '✓ 정상'}
                      </div>
                    )}
                  </div>
                )}

                {/* PLC 출력 (setpoint 제어) — 이 태그값을 PLC에 씀 (램프·클램프·워치독) */}
                <div className="p-2.5 rounded" style={{ background: '#0a1a0f', border: '1px solid #166534' }}>
                  <label className={lbl}>⚙ PLC 출력 (setpoint 제어) <span className="text-[#4a5568] font-normal">(이 태그값을 PLC에 씀 — 램프·클램프·워치독)</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[9px] text-[#7c8aa5] block mb-0.5">출력 주소 (PLC) — 비우면 출력 안 함</span>
                      <input className={inp + ' font-mono'} value={form.writeTo} onChange={e => set('writeTo', e.target.value)} placeholder="예: D500 · %DW500" />
                    </div>
                    <div>
                      <span className="text-[9px] text-[#7c8aa5] block mb-0.5">최대 변화율 (단위/초, 0=무제한)</span>
                      <input type="number" className={inp} value={form.writeRate} onChange={e => set('writeRate', e.target.value)} placeholder="램프" />
                    </div>
                    <div>
                      <span className="text-[9px] text-[#7c8aa5] block mb-0.5">하한 (클램프)</span>
                      <input type="number" className={inp} value={form.writeMin} onChange={e => set('writeMin', e.target.value)} />
                    </div>
                    <div>
                      <span className="text-[9px] text-[#7c8aa5] block mb-0.5">상한 (클램프)</span>
                      <input type="number" className={inp} value={form.writeMax} onChange={e => set('writeMax', e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <span className="text-[9px] text-[#7c8aa5] block mb-0.5">워치독 하트비트 주소 (선택 — PLC가 멈춤 감지 시 안전조치)</span>
                      <input className={inp + ' font-mono'} value={form.writeHeartbeat} onChange={e => set('writeHeartbeat', e.target.value)} placeholder="예: D510" />
                    </div>
                  </div>
                  {form.writeTo.trim() && (
                    <div className="mt-1.5 text-[9px] text-[#4ade80] leading-relaxed">
                      ✓ 런타임 200ms마다: 이 태그값 → 램프(변화율제한) → 클램프[{form.writeMin || '-∞'}~{form.writeMax || '∞'}] → <span className="font-mono">{form.writeTo}</span> 쓰기{form.writeHeartbeat ? ` + 하트비트 ${form.writeHeartbeat}` : ''}
                    </div>
                  )}
                </div>

                {/* 상한/하한 경보 임계값 (예: 토크 — 끊김 전 경고) */}
                <div className="p-2.5 rounded" style={{ background: '#1a0e0e', border: '1px solid #7f1d1d' }}>
                  <label className={lbl}>🚨 경보 설정 <span className="text-[#4a5568] font-normal">{form.type === 'BIT' ? '(디지털 알람 접점 지정)' : '(초과 시 능동 감시 알림 · 상한 90% 근접=주의)'}</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {form.type === 'BIT' ? (<>
                      <div className="col-span-2">
                        <span className="text-[9px] text-[#7c8aa5] block mb-0.5">디지털 알람 <span className="text-[#4a5568]">— 스위치·램프와 구분하려면 지정</span></span>
                        <select className={inp} value={form.alarmBit || ''} onChange={e => set('alarmBit', e.target.value)}>
                          <option value="">알람 아님 (스위치·램프 등 일반 접점)</option>
                          <option value="on">🔴 ON(1)이 알람 — 고장·경보·트립 접점</option>
                          <option value="off">🔴 OFF(0)이 알람 — 정상신호가 꺼지면 이상 (예: 운전중 접점 OFF)</option>
                        </select>
                      </div>
                      <label className="col-span-2 flex items-center gap-2 cursor-pointer py-1">
                        <input type="checkbox" checked={!!form.logEvent} onChange={e => set('logEvent', e.target.checked)}
                          style={{ width: 14, height: 14, accentColor: '#22c55e' }} />
                        <span className="text-[10px] text-[#cbd5e1]">📝 이벤트 로그 기록
                          <span className="text-[9px] text-[#7c8aa5]"> — 이 스위치의 ON/OFF 시각을 이력에 남김 (젬마가 검색 · 부하 출력은 끄기)</span>
                        </span>
                      </label>
                    </>) : (<>
                      <div>
                        <span className="text-[9px] text-[#7c8aa5] block mb-0.5">상한 경보값</span>
                        <input type="number" className={inp} value={form.alarmHigh} onChange={e => set('alarmHigh', e.target.value)} placeholder="예: 80" />
                      </div>
                      <div>
                        <span className="text-[9px] text-[#7c8aa5] block mb-0.5">하한 경보값</span>
                        <input type="number" className={inp} value={form.alarmLow} onChange={e => set('alarmLow', e.target.value)} placeholder="예: 5" />
                      </div>
                    </>)}
                    <div className="col-span-2">
                      <span className="text-[9px] text-[#7c8aa5] block mb-0.5">알람 구역 (area) <span className="text-[#4a5568]">— 비우면 그룹({form.utility || '미지정'}) 사용. 알람 목록에서 구역별 필터</span></span>
                      <input className={inp} value={form.alarmArea} onChange={e => set('alarmArea', e.target.value)} placeholder="예: 권취부 · 언코일부 · 유틸리티" />
                    </div>
                    <div className="col-span-2">
                      <span className="text-[9px] text-[#7c8aa5] block mb-0.5">경보 시 안내 (원인·조치 — AI가 함께 표시)</span>
                      <input className={inp} value={form.alarmHint} onChange={e => set('alarmHint', e.target.value)} placeholder="예: 라인 얇음 — 토크 급증 시 끊김 위험, 장력·속도 확인" />
                    </div>
                  </div>
                </div>
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
