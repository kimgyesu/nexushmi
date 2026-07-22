import { useRef, useState, useEffect } from 'react'
import { Database, Upload, Download, FileSpreadsheet, Plus, Trash2, X, Cpu, Copy, Boxes, FolderOpen, Folder, FolderMinus, Pencil } from 'lucide-react'
import { TAG_COLUMNS, TAG_TYPES, INPUT_MODES, makeTag, VIRTUAL_DEVICE, isVirtualDevice, assignVirtualAddresses } from '../data/tags'
import { parseTagsFromBuffer, exportTagsToExcel, exportTemplate } from '../utils/tagsIO'
import { normalizeAddress, isValidAddress, applyType } from '../utils/plcAddress'
import { driverForDevice, normalizeForDriver, validateForDriver, driverAreas, parseAreaAddr } from '../data/drivers'
import GroupBuilder from './GroupBuilder'
import TagEditDialog from './TagEditDialog'

const TYPE_COLORS = { BIT: '#a78bfa', WORD: '#f59e0b', FLOAT: '#00d4ff' }
const NONE_GROUP = '__none__'   // 그룹 미지정 태그

// ── 편집 가능한 셀 ──────────────────────────────────────────────────────────
function Cell({ tag, col, index, devices, onChange }) {
  const value = tag[col.key] ?? ''

  if (col.key === 'device') {
    const names = devices.map(d => d.name)
    const isVirtual = value === VIRTUAL_DEVICE
    const extra = value && !names.includes(value) && value !== VIRTUAL_DEVICE ? [value] : []
    return (
      <select value={value}
        onChange={e => {
          const newDev = e.target.value
          const patch = { device: newDev }
          // 가상→실 디바이스 전환 시 남은 가상(NB/ND) 주소는 비워 새 형식으로 입력
          if (newDev && !isVirtualDevice(newDev) && /^N[BD]\d+$/i.test(String(tag.address || '').trim())) patch.address = ''
          onChange(index, patch)
        }}
        className="w-full text-[10px] font-mono rounded px-1 py-1 bg-[#0f172a] border focus:outline-none focus:border-[#1e40af]"
        style={{ borderColor: isVirtual ? '#7c3aed' : '#1e2a4a', color: isVirtual ? '#a78bfa' : '#94a3b8' }}>
        <option value="" style={{ background: '#0f172a', color: '#4a5568' }}>(선택)</option>
        <option value={VIRTUAL_DEVICE} style={{ background: '#0f172a', color: '#a78bfa', fontWeight: 700 }}>🔮 가상</option>
        {extra.map(n => <option key={n} value={n} style={{ background: '#0f172a', color: '#f59e0b' }}>{n} (미등록)</option>)}
        {names.map(n => <option key={n} value={n} style={{ background: '#0f172a', color: '#e2e8f0' }}>{n}</option>)}
      </select>
    )
  }

  if (col.key === 'inputMode') {
    const COLOR = { none: '#4a5568', numeric: '#00d4ff', text: '#f59e0b' }
    const mode = INPUT_MODES.find(m => m.value === value) || INPUT_MODES[0]
    return (
      <select value={value || 'none'} onChange={e => onChange(index, { inputMode: e.target.value })}
        className="w-full text-[10px] font-mono rounded px-1 py-1 bg-[#0f172a] border border-[#1e2a4a] focus:outline-none"
        style={{ color: COLOR[value] || '#4a5568' }} title={mode.desc}>
        {INPUT_MODES.map(m => <option key={m.value} value={m.value} style={{ background: '#0f172a', color: COLOR[m.value] }}>{m.label}</option>)}
      </select>
    )
  }

  if (col.key === 'type') {
    return (
      <select value={value}
        onChange={e => {
          const type = e.target.value
          const patch = { type }
          const a = tag.address
          // 실 디바이스면 그 디바이스 드라이버 형식으로 주소 재적용 (비트/워드 반영)
          if (a && !isVirtualDevice(tag.device) && !/^N[BD]\d+$/i.test(String(a))) {
            const dev = devices.find(d => d.name === tag.device)
            patch.address = normalizeForDriver(driverForDevice(dev), a, type)
          }
          onChange(index, patch)
        }}
        className="w-full text-[10px] font-mono rounded px-1 py-1 bg-[#0f172a] border border-[#1e2a4a] focus:outline-none"
        style={{ color: TYPE_COLORS[value] ?? '#e2e8f0' }}>
        {TAG_TYPES.map(t => <option key={t} value={t} style={{ background: '#0f172a', color: '#e2e8f0' }}>{t}</option>)}
      </select>
    )
  }

  if (col.key === 'address') {
    // 가상 여부는 '디바이스' 기준으로만 판단 (실 디바이스면 NB/ND 잔여값이 있어도 실 형식으로)
    const isNBND = /^N[BD]\d+$/i.test(String(value).trim())
    if (isVirtualDevice(tag.device)) {
      return (
        <div>
          <input type="text" value={value} spellCheck={false} placeholder="비우면 자동 (NB/ND)"
            onChange={e => onChange(index, { address: e.target.value })}
            className="w-full text-[10px] font-mono rounded px-1.5 py-1 bg-[#1a1530] border border-[#4c1d95] text-[#c4b5fd] focus:outline-none focus:border-[#7c3aed]" />
          {value && <div className="text-[8px] font-mono mt-0.5" style={{ color: isNBND ? '#a78bfa' : '#eab308' }}>{isNBND ? '🔮 가상' : '가상 주소 아님'}</div>}
        </div>
      )
    }
    // 실 디바이스: 그 디바이스의 드라이버 형식으로 정규화·검증 (제조사별)
    const dev = devices.find(d => d.name === tag.device)
    const driver = driverForDevice(dev)
    // 영역 드롭다운 드라이버: [영역▼][숫자] → 크기문자(X/W/D) 자동 → %[영역][크기][번호]
    const areas = driverAreas(driver)
    if (areas) {
      const raw = isNBND ? '' : value    // 실 디바이스에 남은 가상(NB/ND) 값은 무시하고 새로 입력
      const { area, num } = parseAreaAddr(raw)
      const curArea = area || areas[0]
      const compose = (a, n) => n ? normalizeForDriver(driver, `${a}${n}`, tag.type) : ''
      return (
        <div>
          <div className="flex items-center gap-0.5">
            <select value={curArea} onChange={e => onChange(index, { address: compose(e.target.value, num) })}
              className="text-[10px] font-mono rounded px-0.5 py-1 focus:outline-none flex-shrink-0"
              style={{ width: 46, background: '#111c33', border: '1px solid #1e2a4a', color: '#60a5fa' }} title="메모리 영역">
              {areas.map(a => <option key={a} value={a} style={{ background: '#0f172a' }}>{a}</option>)}
            </select>
            <input type="text" inputMode="numeric" value={num} spellCheck={false} placeholder="숫자"
              onChange={e => { const n = e.target.value.replace(/[^0-9.]/g, ''); onChange(index, { address: compose(curArea, n) }) }}
              className="w-full text-[10px] font-mono rounded px-1.5 py-1 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af]" />
          </div>
          {raw && <div className="text-[8px] font-mono mt-0.5 text-[#22c55e]">✓ {value}</div>}
        </div>
      )
    }
    const ok = validateForDriver(driver, value)
    const preview = normalizeForDriver(driver, value, tag.type)
    return (
      <div>
        <input type="text" value={value} spellCheck={false} placeholder={driver.addr.hint}
          onChange={e => onChange(index, { address: e.target.value })}
          onBlur={e => { const a = normalizeForDriver(driver, e.target.value, tag.type); if (a !== value) onChange(index, { address: a }) }}
          className="w-full text-[10px] font-mono rounded px-1.5 py-1 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af]" />
        {value && (
          <div className="text-[8px] font-mono mt-0.5" style={{ color: ok ? '#22c55e' : '#60a5fa' }}>
            {ok ? `✓ ${driver.vendor}` : `→ ${preview}`}
          </div>
        )}
      </div>
    )
  }

  const isNum = ['min', 'max', 'value', 'decimals', 'digits'].includes(col.key)
  return (
    <input type={isNum ? 'number' : 'text'} value={value} spellCheck={false}
      onChange={e => onChange(index, { [col.key]: e.target.value })}
      className="w-full text-[10px] font-mono rounded px-1.5 py-1 bg-[#0f172a] border border-[#1e2a4a] text-[#e2e8f0] focus:outline-none focus:border-[#1e40af]" />
  )
}

// ── 그룹 트리 패널 ──────────────────────────────────────────────────────────
function GroupTree({ tags, selected, onSelect, onAddGroup, onDuplicate, onDeleteGroup }) {
  const [hovered, setHovered] = useState(null)
  const groups = [...new Set(tags.map(t => t.utility).filter(Boolean))].sort()
  const noneCount = tags.filter(t => !t.utility).length
  const totalCount = tags.length

  const item = (key, label, count, icon, color, deletable = false) => {
    const active = selected === key
    const isHov = hovered === key
    return (
      <div key={key} className="relative"
        onMouseEnter={() => setHovered(key)}
        onMouseLeave={() => setHovered(null)}>
        <button onClick={() => onSelect(key)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-md transition-colors"
          style={{
            background: active ? '#1e3a5f' : 'transparent',
            borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
          }}>
          <span style={{ color: active ? color : '#4a5568', flexShrink: 0 }}>{icon}</span>
          <span className="flex-1 text-[11px] truncate" style={{ color: active ? '#e2e8f0' : '#94a3b8' }}>{label}</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: '#1a2236', color: active ? '#60a5fa' : '#4a5568' }}>{count}</span>
        </button>
        {/* 호버 시 삭제 버튼 */}
        {deletable && isHov && (
          <button
            onClick={e => { e.stopPropagation(); onDeleteGroup(key) }}
            title="그룹 삭제"
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-[#450a0a] transition-colors"
            style={{ color: '#ef4444' }}>
            <X size={11} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#0b1020', borderRight: '1px solid #1e2736' }}>
      {/* 트리 헤더 */}
      <div className="px-3 py-2.5 border-b border-[#1e2736]">
        <span className="text-[9px] font-bold text-[#4a5568] tracking-widest uppercase">그룹</span>
      </div>

      {/* 그룹 목록 */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {item('__all__', '전체', totalCount, <Database size={13} />, '#60a5fa', false)}

        <div className="my-1 mx-2 border-t border-[#1e2736]" />

        {groups.map(g => {
          const cnt = tags.filter(t => t.utility === g).length
          return item(g, g, cnt, <FolderOpen size={13} />, '#f59e0b', true)
        })}

        {groups.length === 0 && (
          <p className="text-[9px] text-[#2d3748] text-center mt-3 px-2">그룹 없음</p>
        )}

        {noneCount > 0 && (
          <>
            <div className="my-1 mx-2 border-t border-[#1e2736]" />
            {item(NONE_GROUP, '(미지정)', noneCount, <Folder size={13} />, '#6b7280', false)}
          </>
        )}
      </div>

      {/* 그룹 액션 버튼 */}
      <div className="px-2 py-2 border-t border-[#1e2736] flex flex-col gap-1">
        <button onClick={onAddGroup}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-bold text-[#22c55e] hover:bg-[#14532d] transition-colors"
          style={{ border: '1px solid #166534' }}>
          <Plus size={11} /> 그룹 만들기
        </button>
        <button onClick={onDuplicate}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-bold text-[#f59e0b] hover:bg-[#422006] transition-colors"
          style={{ border: '1px solid #78350f' }}>
          <Copy size={11} /> 그룹 복제
        </button>
      </div>
    </div>
  )
}

// ── 빠른 입력 행 ─────────────────────────────────────────────────────────────
// TAG_COLUMNS 순서: id(0) desc(1) device(2) utility(3) address(4) type(5) inputMode(6) unit(7) min(8) max(9) decimals(10) digits(11) value(12)
function QuickAddRow({ selectedGroup, devices, onAdd }) {
  const [form, setForm] = useState({
    desc: '', type: 'WORD', device: '', address: '', unit: '', min: 0, max: 100, decimals: 0
  })

  function handleAdd() {
    if (!form.desc.trim()) return
    const grp = (selectedGroup === '__all__' || selectedGroup === NONE_GROUP) ? '' : selectedGroup
    const idBase = `TAG_${grp ? grp + '_' : ''}${form.desc}`.toUpperCase().replace(/[^A-Z0-9_가-힣]/g, '_')
    // 실 디바이스 주소는 그 드라이버 형식으로 정규화 (가상은 비워두면 addTag가 NB/ND 부여)
    const dev = devices.find(d => d.name === form.device)
    const address = isVirtualDevice(form.device) ? form.address : normalizeForDriver(driverForDevice(dev), form.address, form.type)
    onAdd(makeTag({ ...form, address, id: idBase, utility: grp }))
    setForm({ desc: '', type: 'WORD', device: '', address: '', unit: '', min: 0, max: 100, decimals: 0 })
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleAdd()
  }

  const qCls = "w-full text-[10px] font-mono rounded px-1.5 py-1 bg-[#0a1a0a] border border-[#22c55e] text-[#e2e8f0] placeholder-[#4ade80] focus:outline-none focus:border-[#86efac]"
  const grpLabel = (selectedGroup === '__all__' || selectedGroup === NONE_GROUP) ? '(전역)' : selectedGroup
  // 주소 placeholder — 영역 드롭다운 드라이버면 영역+숫자 힌트
  const qDriver = (!isVirtualDevice(form.device) && form.device) ? driverForDevice(devices.find(d => d.name === form.device)) : null
  const qAreas = qDriver ? driverAreas(qDriver) : null
  const addrPh = isVirtualDevice(form.device) ? '자동 NB/ND' : (qAreas ? `예: ${qAreas[0]}0, ${qAreas[1] || 'D'}100` : 'D100')

  return (
    <tr style={{ background: '#0d2010', borderBottom: '2px solid #22c55e' }}>
      {/* 체크박스 자리 */}
      <td style={{ paddingLeft: 8 }} />
      {/* # 자리 */}
      <td className="px-2 py-1 text-[9px] text-[#22c55e] font-bold">NEW</td>
      {/* col[0] utility — 현재 그룹 자동 */}
      <td className="px-1 py-1 text-[9px] text-[#4ade80] font-mono font-bold" style={{ minWidth: 110 }}>
        {grpLabel}
      </td>
      {/* col[1] id — 자동생성 표시 */}
      <td className="px-1 py-1">
        <span className="text-[9px] text-[#4ade80] font-mono">자동생성</span>
      </td>
      {/* col[2] desc */}
      <td className="px-1 py-1" style={{ minWidth: 150 }}>
        <input value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))}
          onKeyDown={handleKeyDown} placeholder="태그 설명 입력 후 Enter" className={qCls} autoFocus />
      </td>
      {/* col[3] device */}
      <td className="px-1 py-1" style={{ minWidth: 110 }}>
        <select value={form.device} onChange={e => setForm(f => ({ ...f, device: e.target.value }))} className={qCls}>
          <option value="">가상</option>
          {devices.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
      </td>
      {/* col[4] address */}
      <td className="px-1 py-1" style={{ minWidth: 90 }}>
        <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
          onKeyDown={handleKeyDown} placeholder={addrPh} className={qCls} />
      </td>
      {/* col[5] type */}
      <td className="px-1 py-1" style={{ minWidth: 80 }}>
        <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={qCls}>
          {TAG_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </td>
      {/* col[6] unit */}
      <td className="px-1 py-1" style={{ minWidth: 70 }}>
        <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
          placeholder="Hz" className={qCls} style={{ width: 52 }} />
      </td>
      {/* col[7] min */}
      <td className="px-1 py-1" style={{ minWidth: 70 }}>
        <input value={form.min} onChange={e => setForm(f => ({ ...f, min: +e.target.value }))}
          type="number" className={qCls} style={{ width: 52 }} />
      </td>
      {/* col[8] max */}
      <td className="px-1 py-1" style={{ minWidth: 70 }}>
        <input value={form.max} onChange={e => setForm(f => ({ ...f, max: +e.target.value }))}
          type="number" className={qCls} style={{ width: 52 }} />
      </td>
      {/* col[11] digits — 빈칸 */}
      <td />
      {/* col[12] value — 빈칸 */}
      <td />
      {/* 삭제버튼 자리 → 추가 버튼 */}
      <td className="px-1 py-1">
        <button onClick={handleAdd}
          className="px-2 py-1 rounded text-[10px] font-bold text-[#22c55e]"
          style={{ background: '#14532d', border: '1px solid #22c55e' }}>
          + 추가
        </button>
      </td>
    </tr>
  )
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────────────────
export default function TagRegistry({ open, tags, devices = [], projectName, onClose, onOpenDevices, onUpdateTag, onAddTag, onDeleteTag, onReplaceTags, onDuplicateGroup, onCreateGroup }) {
  const fileRef = useRef(null)
  // 컬럼 너비(드래그로 조절) — localStorage에 저장
  const [colW, setColW] = useState(() => {
    const base = Object.fromEntries(TAG_COLUMNS.map(c => [c.key, c.width]))
    try { const s = localStorage.getItem('nexushmi.tagcolw'); if (s) return { ...base, ...JSON.parse(s) } } catch { /* noop */ }
    return base
  })
  useEffect(() => { try { localStorage.setItem('nexushmi.tagcolw', JSON.stringify(colW)) } catch { /* noop */ } }, [colW])
  function startColResize(e, key) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = colW[key] || 100
    const onMove = ev => setColW(w => ({ ...w, [key]: Math.max(44, startW + (ev.clientX - startX)) }))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = '' }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); document.body.style.cursor = 'col-resize'
  }
  // 주소 없는 가상 태그에 NB/ND 일괄 부여
  function handleAssignVirtual() {
    const { tags: out, count } = assignVirtualAddresses(tags)
    if (count === 0) { alert('주소를 부여할 가상 태그가 없습니다. (이미 모두 주소가 있거나 실 디바이스 태그예요)'); return }
    onReplaceTags(out)
    alert(`가상 태그 ${count}개에 NB/ND 주소를 부여했습니다.`)
  }
  const [gbOpen, setGbOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [dupSource, setDupSource] = useState('')
  const [dupName, setDupName] = useState('')
  const [dupDevice, setDupDevice] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('__all__')
  const [checkedIdxs, setCheckedIdxs] = useState(new Set())
  const [editIdx, setEditIdx] = useState(null)   // null=닫힘, -1=새 태그, 그 외=tags 절대인덱스

  if (!open) return null

  const groups = [...new Set(tags.map(t => t.utility).filter(Boolean))].sort()
  const dupCount = tags.filter(t => (t.utility || '') === dupSource).length

  // 선택 그룹에 따라 태그 필터링 (원본 인덱스 유지)
  const filteredWithIdx = tags
    .map((t, i) => ({ tag: t, idx: i }))
    .filter(({ tag }) => {
      if (selectedGroup === '__all__') return true
      if (selectedGroup === NONE_GROUP) return !tag.utility
      return tag.utility === selectedGroup
    })

  // 그룹 선택 시 레이블 계산
  const groupLabel =
    selectedGroup === '__all__' ? `전체 태그 (${tags.length}개)` :
    selectedGroup === NONE_GROUP ? `미지정 태그 (${filteredWithIdx.length}개)` :
    `${selectedGroup} (${filteredWithIdx.length}개)`

  // ── 태그 편집 다이얼로그 (단일 태그 포커스) ──
  const navList = filteredWithIdx.map(x => x.idx)          // 현재 필터의 절대 인덱스들
  const editPos = editIdx >= 0 ? navList.indexOf(editIdx) : -1
  const curGroup = (selectedGroup === '__all__' || selectedGroup === NONE_GROUP) ? '' : selectedGroup
  const editTag = editIdx === -1
    ? { type: 'BIT', utility: curGroup, device: devices[0]?.name || VIRTUAL_DEVICE }  // 새 태그 초안(실태그 기본)
    : (editIdx >= 0 ? tags[editIdx] : null)
  function handleDialogCommit(patch) {
    if (editIdx === -1) onAddTag(makeTag(patch))
    else if (editIdx >= 0) onUpdateTag(editIdx, patch)
  }
  function handleDialogNav(dir) {
    const next = navList[editPos + dir]
    if (next != null) setEditIdx(next)
  }

  function openDup() {
    setDupSource(prev => prev || groups[0] || '')
    setDupDevice(prev => prev || devices[0]?.name || '')
    setDupOpen(o => !o)
  }

  function doDuplicate() {
    if (!dupSource) { window.alert('복제할 원본 그룹을 선택하세요.'); return }
    if (!dupName.trim()) { window.alert('새 그룹 이름을 입력하세요.'); return }
    const r = onDuplicateGroup?.(dupSource, dupName.trim(), dupDevice) || {}
    window.alert(`"${dupSource}" → "${dupName.trim()}" 복제 완료 (${r.added ?? 0}개)`)
    setSelectedGroup(dupName.trim())
    setDupName('')
    setDupOpen(false)
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const buf = await file.arrayBuffer()
      const imported = parseTagsFromBuffer(buf)
      if (imported.length === 0) {
        window.alert('가져올 태그를 찾지 못했습니다.')
        return
      }
      const ok = window.confirm(`${imported.length}개 태그를 가져옵니다.\n현재 목록을 교체할까요? (취소 시 뒤에 추가)`)
      if (ok) {
        onReplaceTags(imported)
      } else {
        const map = new Map(tags.map(t => [t.id, t]))
        for (const t of imported) map.set(t.id, t)
        onReplaceTags(Array.from(map.values()))
      }
    } catch (err) {
      window.alert('파일 오류: ' + err.message)
    }
  }

  function handleAddTag() {
    const utility = (selectedGroup === '__all__' || selectedGroup === NONE_GROUP) ? '' : selectedGroup
    onAddTag(makeTag({ id: '', utility }))
  }

  // 그룹 삭제 — 태그도 삭제 or 미지정으로 이동
  function handleDeleteGroup(groupName) {
    const cnt = tags.filter(t => t.utility === groupName).length
    if (cnt === 0) {
      // 태그 없는 그룹 — 단순 확인
      if (!window.confirm(`"${groupName}" 그룹을 삭제할까요?`)) return
      onReplaceTags(tags.filter(t => t.utility !== groupName))
      setSelectedGroup('__all__')
      return
    }
    const choice = window.confirm(
      `"${groupName}" 그룹 삭제\n\n태그 ${cnt}개를 어떻게 할까요?\n\n` +
      `[확인] → 태그도 함께 삭제\n[취소] → 태그는 '미지정'으로 이동`
    )
    if (choice) {
      // 태그 삭제
      onReplaceTags(tags.filter(t => t.utility !== groupName))
    } else {
      // 미지정으로 이동
      onReplaceTags(tags.map(t => t.utility === groupName ? { ...t, utility: '' } : t))
    }
    setSelectedGroup('__all__')
    setCheckedIdxs(new Set())
  }

  // 체크된 태그 일괄 삭제
  function handleDeleteChecked() {
    if (checkedIdxs.size === 0) return
    if (!window.confirm(`선택한 태그 ${checkedIdxs.size}개를 삭제할까요?`)) return
    onReplaceTags(tags.filter((_, i) => !checkedIdxs.has(i)))
    setCheckedIdxs(new Set())
  }

  function toggleCheck(idx) {
    setCheckedIdxs(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function toggleCheckAll() {
    const allIdxs = filteredWithIdx.map(({ idx }) => idx)
    const allChecked = allIdxs.every(i => checkedIdxs.has(i))
    if (allChecked) {
      setCheckedIdxs(prev => { const n = new Set(prev); allIdxs.forEach(i => n.delete(i)); return n })
    } else {
      setCheckedIdxs(prev => { const n = new Set(prev); allIdxs.forEach(i => n.add(i)); return n })
    }
  }

  const safeName = (projectName || 'tags').replace(/[^\w가-힣\-]/g, '_')

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="flex flex-col bg-[#0f1520] border border-[#2d3748] rounded-lg overflow-hidden shadow-2xl"
        style={{ width: 'min(1200px, 96vw)', height: 'min(700px, 92vh)' }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 h-11 bg-[#0d1117] border-b border-[#2d3748] flex-shrink-0">
          <Database size={15} className="text-[#a78bfa]" />
          <span className="text-[13px] font-bold text-[#e2e8f0]">태그 등록</span>
          <span className="text-[10px] text-[#4a5568] ml-1">{tags.length}개</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#2d3748] text-[#4a5568] hover:text-white transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* 툴바 */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#10151f] border-b border-[#2d3748] flex-shrink-0 flex-wrap">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImportFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold text-white"
            style={{ background: '#16a34a', border: '1px solid #22c55e' }}>
            <Upload size={12} /> 가져오기
          </button>
          <button onClick={() => exportTagsToExcel(tags, `${safeName}_tags.xlsx`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] text-[#cbd5e1] hover:bg-[#2d3748] transition-colors"
            style={{ border: '1px solid #2d3748' }}>
            <Download size={12} /> 내보내기
          </button>
          <button onClick={() => exportTemplate('tag_template.xlsx')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] text-[#718096] hover:bg-[#2d3748] transition-colors"
            style={{ border: '1px solid #2d3748' }}>
            <FileSpreadsheet size={12} /> 템플릿
          </button>
          <div className="w-px h-5 bg-[#2d3748] mx-1" />
          <button onClick={onOpenDevices}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] text-[#60a5fa] hover:bg-[#0f2444] transition-colors"
            style={{ border: '1px solid #1e40af' }}>
            <Cpu size={12} /> 디바이스 <span className="text-[#4a5568] ml-0.5">({devices.length})</span>
          </button>
          <button onClick={handleAssignVirtual} title="주소 없는 가상 태그에 NB/ND 자동 부여"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] text-[#a78bfa] hover:bg-[#2d1b4e] transition-colors"
            style={{ border: '1px solid #7c3aed' }}>
            🔮 가상주소 부여
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-[#4a5568]">{groupLabel}</span>
            {checkedIdxs.size > 0 && (
              <button onClick={handleDeleteChecked}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold text-[#ef4444] hover:bg-[#450a0a] transition-colors"
                style={{ border: '1px solid #7f1d1d' }}>
                <Trash2 size={12} /> 선택 삭제 ({checkedIdxs.size})
              </button>
            )}
            <button onClick={() => setEditIdx(-1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold text-[#a78bfa] hover:bg-[#2d1b4e] transition-colors"
              style={{ border: '1px solid #7c3aed' }} title="상세 편집 다이얼로그로 추가">
              <Plus size={12} /> 상세 추가
            </button>
            <button onClick={handleAddTag}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold text-[#00d4ff] hover:bg-[#0f2444] transition-colors"
              style={{ border: '1px solid #1e40af' }} title="표에 빈 행 추가">
              <Plus size={12} /> 빠른 추가
            </button>
          </div>
        </div>

        {/* 그룹 복제 폼 */}
        {dupOpen && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1206] border-b border-[#78350f] flex-shrink-0 flex-wrap">
            <span className="text-[10px] text-[#f59e0b] font-bold">그룹 복제</span>
            <span className="text-[9px] text-[#4a5568]">원본</span>
            <select value={dupSource} onChange={e => setDupSource(e.target.value)}
              className="text-[10px] font-mono rounded px-2 py-1 bg-[#0f172a] border border-[#78350f] text-[#fbbf24] focus:outline-none">
              {groups.length === 0 && <option value="">(그룹 없음)</option>}
              {groups.map(g => <option key={g} value={g} style={{ background: '#0f172a' }}>{g}</option>)}
            </select>
            <span className="text-[10px] text-[#f59e0b]">→</span>
            <input value={dupName} onChange={e => setDupName(e.target.value)} placeholder="새 그룹 이름" spellCheck={false}
              className="text-[10px] font-mono rounded px-2 py-1 w-32 bg-[#0f172a] border border-[#78350f] text-[#e2e8f0] focus:outline-none focus:border-[#f59e0b]" />
            <span className="text-[9px] text-[#4a5568]">디바이스</span>
            <select value={dupDevice} onChange={e => setDupDevice(e.target.value)}
              className="text-[10px] font-mono rounded px-2 py-1 bg-[#0f172a] border border-[#78350f] text-[#94a3b8] focus:outline-none">
              <option value="">(원본 유지)</option>
              {devices.map(d => <option key={d.name} value={d.name} style={{ background: '#0f172a' }}>{d.name}</option>)}
            </select>
            <span className="text-[9px] text-[#4a5568]">{dupCount}개</span>
            <button onClick={doDuplicate} className="px-3 py-1 rounded text-[10px] font-bold text-white"
              style={{ background: '#d97706', border: '1px solid #f59e0b' }}>복제 실행</button>
            <button onClick={() => setDupOpen(false)} className="px-2 py-1 rounded text-[10px] text-[#718096] hover:bg-[#2d3748]">취소</button>
          </div>
        )}

        {/* 본문: 좌측 트리 + 우측 테이블 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 왼쪽 그룹 트리 */}
          <div style={{ width: 180, flexShrink: 0 }}>
            <GroupTree
              tags={tags}
              selected={selectedGroup}
              onSelect={g => { setSelectedGroup(g); setCheckedIdxs(new Set()) }}
              onAddGroup={() => setGbOpen(true)}
              onDuplicate={openDup}
              onDeleteGroup={handleDeleteGroup}
            />
          </div>

          {/* 오른쪽 태그 테이블 */}
          <div className="flex-1 overflow-auto">
            {true ? (
              <table className="text-[11px]" style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 104 + TAG_COLUMNS.reduce((s, c) => s + (colW[c.key] || c.width), 0) }}>
                <thead>
                  <tr className="bg-[#1a202c] sticky top-0 z-10">
                    {/* 전체 선택 체크박스 */}
                    <th style={{ borderBottom: '1px solid #2d3748', width: 32, paddingLeft: 8 }}>
                      <input type="checkbox"
                        checked={filteredWithIdx.length > 0 && filteredWithIdx.every(({ idx }) => checkedIdxs.has(idx))}
                        onChange={toggleCheckAll}
                        style={{ accentColor: '#ef4444', cursor: 'pointer' }} />
                    </th>
                    <th className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase"
                      style={{ borderBottom: '1px solid #2d3748', width: 32 }}>#</th>
                    {TAG_COLUMNS.map(col => (
                      <th key={col.key}
                        className="px-2 py-1.5 text-left text-[9px] font-bold text-[#4a5568] uppercase whitespace-nowrap relative select-none"
                        style={{ borderBottom: '1px solid #2d3748', width: colW[col.key], minWidth: colW[col.key], maxWidth: colW[col.key] }}>
                        {col.header}
                        <span onMouseDown={e => startColResize(e, col.key)} title="드래그해서 너비 조절"
                          className="absolute top-0 right-0 h-full"
                          style={{ width: 6, cursor: 'col-resize', borderRight: '2px solid transparent' }}
                          onMouseEnter={e => (e.currentTarget.style.borderRight = '2px solid #3b82f6')}
                          onMouseLeave={e => (e.currentTarget.style.borderRight = '2px solid transparent')} />
                      </th>
                    ))}
                    <th style={{ borderBottom: '1px solid #2d3748', width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  <QuickAddRow
                    selectedGroup={selectedGroup}
                    devices={devices}
                    onAdd={tag => onAddTag(tag)}
                  />
                  {filteredWithIdx.map(({ tag, idx }) => {
                    const checked = checkedIdxs.has(idx)
                    return (
                      <tr key={idx}
                        className="border-b border-[#1e2736] hover:bg-[#161d2a]"
                        style={checked ? { background: '#1f1418' } : tag.device === VIRTUAL_DEVICE ? { background: '#1a1030' } : {}}>
                        <td style={{ paddingLeft: 8 }}>
                          <input type="checkbox" checked={checked} onChange={() => toggleCheck(idx)}
                            style={{ accentColor: '#ef4444', cursor: 'pointer' }} />
                        </td>
                        <td className="px-2 py-1 text-[9px] text-[#4a5568] font-mono text-center cursor-pointer hover:text-[#a78bfa]"
                          onDoubleClick={() => setEditIdx(idx)} title="더블클릭: 상세 편집">{idx + 1}</td>
                        {TAG_COLUMNS.map(col => (
                          <td key={col.key} className="px-1 py-1" style={{ width: colW[col.key], minWidth: colW[col.key], maxWidth: colW[col.key] }}>
                            <Cell tag={tag} col={col} index={idx} devices={devices} onChange={onUpdateTag} />
                          </td>
                        ))}
                        <td className="px-1 py-1 text-center whitespace-nowrap">
                          <button onClick={() => setEditIdx(idx)} title="상세 편집"
                            className="p-1 rounded hover:bg-[#2d1b4e] text-[#4a5568] hover:text-[#a78bfa] transition-colors">
                            <Pencil size={12} />
                          </button>
                          <button onClick={() => onDeleteTag(idx)} title="삭제"
                            className="p-1 rounded hover:bg-[#450a0a] text-[#4a5568] hover:text-[#ef4444] transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>

        {/* 푸터 */}
        <div className="flex items-center px-4 h-9 bg-[#0d1117] border-t border-[#2d3748] flex-shrink-0">
          <span className="text-[9px] text-[#4a5568]">
            ⚠ 태그ID 변경 시 화면 바인딩이 끊길 수 있습니다. 변경은 자동 저장됩니다.
          </span>
          <button onClick={onClose}
            className="ml-auto px-4 py-1.5 rounded text-[11px] font-bold text-white"
            style={{ background: '#1e40af', border: '1px solid #3b82f6' }}>
            닫기
          </button>
        </div>
      </div>
    </div>

    <GroupBuilder open={gbOpen} devices={devices} onClose={() => setGbOpen(false)}
      onCreate={(groupName, device, members) => {
        onCreateGroup(groupName, device, members)
        setSelectedGroup(groupName)
      }} />

    <TagEditDialog
      open={editIdx !== null}
      isNew={editIdx === -1}
      tag={editTag}
      groups={groups}
      devices={devices}
      pos={editPos >= 0 ? { cur: editPos, total: navList.length } : null}
      canPrev={editPos > 0}
      canNext={editPos >= 0 && editPos < navList.length - 1}
      onCommit={handleDialogCommit}
      onNav={handleDialogNav}
      onClose={() => setEditIdx(null)}
    />
    </>
  )
}





