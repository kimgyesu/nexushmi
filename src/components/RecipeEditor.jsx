import { useState } from 'react'
import { X, Plus, Trash2, FlaskConical, Type, Hash, Tag } from 'lucide-react'

const genId = p => p + Math.random().toString(36).slice(2, 8)

// 주소 증가: "D100" + 40 → "D140" (접두문자 유지, 숫자부만 더함)
function addrStep(base, add) {
  const m = String(base || '').match(/^([A-Za-z%]*)(\d+)(.*)$/)
  if (!m || !add) return base || ''
  const [, pre, num, suf] = m
  return pre + (parseInt(num, 10) + add) + suf
}

/* 레시피 편집 — 행렬형(열=파라미터/디바이스, 행=레시피) + 주소 인덱스 자동증가
   recipeSet: { id, name, index, showAddr, selectorTag,
     columns:[{id,title,type:'text'|'number',addr,unit,decimals}],
     items:[{no, values:{colId:val}}] } */
export default function RecipeEditor({ recipeSets = [], tags = [], onChange, onRegisterTags, onClose }) {
  const [activeId, setActiveId] = useState(recipeSets[0]?.id || null)
  const active = recipeSets.find(s => s.id === activeId) || null
  const updateSet = (id, patch) => onChange(recipeSets.map(s => s.id === id ? { ...s, ...patch } : s))

  const cols = active?.columns || []
  const items = active?.items || []
  const index = Number(active?.index) || 0

  const addSet = () => {
    const id = genId('rs_')
    onChange([...recipeSets, { id, name: `레시피셋 ${recipeSets.length + 1}`, index: 0, showAddr: true, selectorTag: '', columns: [], items: [] }])
    setActiveId(id)
  }
  const delSet = id => {
    if (!window.confirm('이 레시피셋을 삭제할까요?')) return
    const next = recipeSets.filter(s => s.id !== id)
    onChange(next); if (activeId === id) setActiveId(next[0]?.id || null)
  }

  // ── 열(파라미터/디바이스) ──
  const addColumn = () => updateSet(active.id, { columns: [...cols, { id: genId('c_'), title: '', type: 'number', fmt: 'WORD', addr: '', unit: '', digits: 0, decimals: 1 }] })
  const setCol = (cid, k, v) => updateSet(active.id, { columns: cols.map(c => c.id === cid ? { ...c, [k]: v } : c) })
  const delColumn = cid => updateSet(active.id, {
    columns: cols.filter(c => c.id !== cid),
    items: items.map(it => { const v = { ...it.values }; delete v[cid]; return { ...it, values: v } }),
  })

  // ── 행(레시피) ──
  const nextNo = () => (items.length ? Math.max(...items.map(i => +i.no || 0)) + 1 : 1)
  const addItem = () => updateSet(active.id, { items: [...items, { no: nextNo(), values: {} }] })
  const delItem = idx => updateSet(active.id, { items: items.filter((_, i) => i !== idx) })
  const setCell = (idx, cid, v) => updateSet(active.id, { items: items.map((it, i) => i === idx ? { ...it, values: { ...it.values, [cid]: v } } : it) })

  // 열의 디바이스 주소로 태그 자동 등록 (주소 없으면 알림)
  const autoRegisterTags = () => {
    if (!onRegisterTags || !cols.length) return
    // 선택 워드 주소도 함께 태그 등록 (레시피 번호 기록용)
    const allCols = active.selectorAddr
      ? [...cols, { title: (active.name || '레시피') + '_번호', addr: active.selectorAddr, type: 'number', fmt: 'WORD', decimals: 0 }]
      : cols
    const res = onRegisterTags(allCols)
    let msg = ''
    if (res.created?.length) msg += `✅ 태그 ${res.created.length}개 자동 등록:\n${res.created.join(', ')}\n\n`
    if (res.missing?.length) msg += `⚠ 주소가 비어 등록 못한 열: ${res.missing.join(', ')}\n→ 각 열의 "디바이스" 주소를 입력한 뒤 다시 눌러주세요.`
    if (!res.created?.length && !res.missing?.length) msg = '이미 모든 열의 주소가 태그로 등록되어 있습니다.'
    window.alert(msg.trim())
  }

  const wordTags = tags.filter(t => t.type === 'WORD')
  const cellCls = 'w-full bg-[#0d1117] border border-[#243247] rounded px-1.5 py-1 text-[12px] text-[#e2e8f0] font-mono focus:outline-none focus:border-[#22c55e]'

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="flex flex-col rounded-xl overflow-hidden" style={{ width: 'min(1150px, 96vw)', height: 'min(88vh, 680px)', background: '#0f1520', border: '1px solid #166534', boxShadow: '0 0 40px rgba(22,101,52,0.35)' }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ background: '#0c1f14', borderBottom: '1px solid #166534' }}>
          <FlaskConical size={16} className="text-[#4ade80]" />
          <span className="text-[13px] font-bold text-[#86efac]">레시피 편집</span>
          <span className="text-[10px] text-[#64748b] ml-1">열=디바이스(주소·형식) · 행=레시피 · 주소 인덱스 자동증가</span>
          <button onClick={onClose} className="ml-auto text-[#64748b] hover:text-[#e2e8f0]"><X size={16} /></button>
        </div>

        {/* 레시피셋 탭 */}
        <div className="flex items-center gap-1 px-3 py-2 flex-shrink-0 overflow-x-auto" style={{ borderBottom: '1px solid #1e2a3a' }}>
          {recipeSets.map(s => (
            <button key={s.id} onClick={() => setActiveId(s.id)}
              className="px-3 py-1 rounded text-[11px] font-bold whitespace-nowrap"
              style={activeId === s.id ? { background: '#14532d', color: '#4ade80', border: '1px solid #22c55e' } : { background: '#1a202c', color: '#94a3b8', border: '1px solid #2d3748' }}>
              {s.name}
            </button>
          ))}
          <button onClick={addSet} className="px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1" style={{ background: '#1a202c', color: '#22c55e', border: '1px dashed #166534' }}>
            <Plus size={12} /> 새 레시피셋
          </button>
        </div>

        {!active ? (
          <div className="flex-1 flex items-center justify-center">
            <button onClick={addSet} className="px-4 py-2 rounded text-[12px] font-bold" style={{ background: '#14532d', color: '#4ade80', border: '1px solid #22c55e' }}>+ 새 레시피셋 만들기</button>
          </div>
        ) : (<>
          {/* 셋 설정 바 */}
          <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0 flex-wrap" style={{ borderBottom: '1px solid #1e2a3a', background: '#0c141e' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#cbd5e1] font-semibold">이름</span>
              <input value={active.name} onChange={e => updateSet(active.id, { name: e.target.value })}
                className="bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1 text-[11px] text-[#e2e8f0] w-36 focus:outline-none focus:border-[#22c55e]" />
            </div>
            <div className="flex items-center gap-1.5" title="행이 늘어날 때 각 셀 주소에 더해지는 값 (예: 100 → 2행은 +100)">
              <span className="text-[10px] text-[#fbbf24] font-semibold">인덱스(행 주소 증가)</span>
              <input type="number" value={active.index ?? 0} onChange={e => updateSet(active.id, { index: +e.target.value || 0 })}
                className="bg-[#0d1117] border border-[#78500f] rounded px-2 py-1 text-[11px] text-[#fbbf24] w-20 font-mono focus:outline-none focus:border-[#fbbf24]" />
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={active.showAddr !== false} onChange={e => updateSet(active.id, { showAddr: e.target.checked })} style={{ accentColor: '#22c55e' }} />
              <span className="text-[10px] text-[#94a3b8]">주소 표시</span>
            </label>
            <div className="flex items-center gap-1.5" title="레시피 선택 시 이 워드 주소에 번호(1,2,3…)가 기록됩니다">
              <span className="text-[10px] text-[#38bdf8] font-semibold">선택 워드 주소</span>
              <input value={active.selectorAddr || ''} onChange={e => updateSet(active.id, { selectorAddr: e.target.value.toUpperCase() })} placeholder="D50"
                className="bg-[#0d1117] border border-[#243247] rounded px-2 py-1 text-[11px] text-[#38bdf8] font-mono w-24 focus:outline-none focus:border-[#38bdf8]" />
            </div>
            <button onClick={() => delSet(active.id)} className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold" style={{ background: '#2a0e0e', color: '#f87171', border: '1px solid #7f1d1d' }}>
              <Trash2 size={11} /> 셋 삭제
            </button>
          </div>

          {/* 툴바 */}
          <div className="flex items-center gap-2 px-4 py-2 flex-shrink-0">
            <button onClick={addColumn} className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold" style={{ background: '#0d2515', color: '#4ade80', border: '1px solid #166534' }}>
              <Plus size={12} /> 열(디바이스) 추가
            </button>
            <button onClick={addItem} disabled={!cols.length} className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold disabled:opacity-40" style={{ background: '#0d1b2e', color: '#60a5fa', border: '1px solid #1e40af' }}>
              <Plus size={12} /> 행(레시피) 추가
            </button>
            <button onClick={autoRegisterTags} disabled={!cols.length} title="각 열의 디바이스 주소로 태그를 자동 생성·등록"
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-bold disabled:opacity-40" style={{ background: '#2a1e3a', color: '#c4b5fd', border: '1px solid #6d28d9' }}>
              <Tag size={12} /> 태그 자동 등록
            </button>
            {index > 0 && cols.length > 0 && (
              <span className="text-[9px] text-[#78716c]">행마다 주소 +{index} 자동증가</span>
            )}
          </div>

          {/* 행렬 표 */}
          <div className="flex-1 overflow-auto px-4 pb-3">
            {cols.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-6">
                <FlaskConical size={38} className="text-[#22c55e]" style={{ opacity: 0.5 }} />
                <p className="text-[15px] font-bold text-[#e2e8f0]">레시피 만들기</p>
                <div className="flex flex-col gap-2.5 text-left" style={{ maxWidth: 460 }}>
                  {[
                    ['1', <>위 <b className="text-[#4ade80]">+ 열(디바이스) 추가</b> → 각 열의 <b className="text-[#e2e8f0]">제목·형식(문자/숫자)·주소(D100)</b> 입력 <span className="text-[#64748b]">(태그 등록 없이 주소 직접)</span></>],
                    ['2', <>필요하면 위 <b className="text-[#fbbf24]">인덱스</b>에 행 주소 증가폭 입력 (예: 100)</>],
                    ['3', <><b className="text-[#60a5fa]">+ 행(레시피) 추가</b> → 번호 자동, 주소는 인덱스로 자동 계산</>],
                    ['4', <>각 칸에 값 입력 (문자열/숫자)</>],
                  ].map(([n, txt]) => (
                    <div key={n} className="flex items-start gap-2.5 text-[12px] text-[#cbd5e1]">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0" style={{ background: '#14532d', color: '#4ade80', border: '1px solid #22c55e' }}>{n}</span>
                      <span className="leading-5">{txt}</span>
                    </div>
                  ))}
                </div>
                <button onClick={addColumn} className="mt-1 px-5 py-2 rounded text-[13px] font-bold flex items-center gap-1.5" style={{ background: '#14532d', color: '#4ade80', border: '1px solid #22c55e' }}>
                  <Plus size={15} /> 열(디바이스) 추가부터 시작
                </button>
              </div>
            ) : (
              <table className="border-collapse" style={{ minWidth: '100%' }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[2] px-2 py-1 text-[10px] text-[#94a3b8] font-bold" style={{ background: '#0f1520', borderBottom: '2px solid #2d3748', minWidth: 54 }}>번호</th>
                    {cols.map(c => (
                      <th key={c.id} className="px-1.5 py-1.5 align-top" style={{ background: '#111a26', borderBottom: '2px solid #2d3748', borderLeft: '1px solid #1a2230', minWidth: 128 }}>
                        {/* 제목 + 삭제 */}
                        <div className="flex items-center gap-1">
                          <input value={c.title} onChange={e => setCol(c.id, 'title', e.target.value)} placeholder="제목 예:작업이름"
                            className="bg-[#0d1117] border border-[#2d3748] rounded text-[11px] font-bold text-[#e2e8f0] w-full text-center px-1 py-1 focus:outline-none focus:border-[#22c55e] placeholder-[#4a5568]" />
                          <button onClick={() => delColumn(c.id)} className="text-[#7f1d1d] hover:text-[#ef4444] flex-shrink-0" title="열 삭제"><X size={11} /></button>
                        </div>
                        {/* 디바이스 주소 (첫 행 기준) */}
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[8px] text-[#64748b] w-8 flex-shrink-0">디바이스</span>
                          <input value={c.addr || ''} onChange={e => setCol(c.id, 'addr', e.target.value.toUpperCase())} placeholder="D100"
                            className="bg-[#0d1117] border border-[#243247] rounded text-[10px] text-[#38bdf8] font-mono w-full text-center px-1 py-0.5 focus:outline-none focus:border-[#38bdf8]" />
                        </div>
                        {/* 형식 토글 */}
                        <div className="flex items-center gap-1 mt-1">
                          <button onClick={() => setCol(c.id, 'type', 'text')}
                            className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px] font-bold"
                            style={c.type === 'text' ? { background: '#1e1b4b', color: '#c4b5fd', border: '1px solid #6d28d9' } : { background: '#161c26', color: '#4a5568', border: '1px solid #2d3748' }}>
                            <Type size={9} /> 문자
                          </button>
                          <button onClick={() => setCol(c.id, 'type', 'number')}
                            className="flex-1 flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px] font-bold"
                            style={c.type !== 'text' ? { background: '#0d2515', color: '#4ade80', border: '1px solid #166534' } : { background: '#161c26', color: '#4a5568', border: '1px solid #2d3748' }}>
                            <Hash size={9} /> 숫자
                          </button>
                        </div>
                        {/* 숫자: 자료형 + 자리수 · 소숫점 / 문자: 최대길이 */}
                        {c.type !== 'text' ? (<>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[8px] text-[#64748b] w-8 flex-shrink-0">자료형</span>
                            <select value={c.fmt || 'WORD'} onChange={e => setCol(c.id, 'fmt', e.target.value)}
                              className="bg-[#0d1117] border border-[#243247] rounded text-[9px] text-[#4ade80] font-mono w-full px-1 py-0.5 focus:outline-none focus:border-[#22c55e]">
                              <option value="WORD">WORD (16비트)</option>
                              <option value="DWORD">DWORD (32비트)</option>
                              <option value="FLOAT">FLOAT (실수)</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <label className="flex items-center gap-0.5 flex-1"><span className="text-[8px] text-[#64748b]">자리</span>
                              <input type="number" min={0} max={12} value={c.digits ?? 0} onChange={e => setCol(c.id, 'digits', +e.target.value || 0)}
                                className="bg-[#0d1117] border border-[#243247] rounded text-[9px] text-[#94a3b8] w-full text-center px-0.5 py-0.5 focus:outline-none focus:border-[#22c55e]" /></label>
                            <label className="flex items-center gap-0.5 flex-1"><span className="text-[8px] text-[#64748b]">소수</span>
                              <input type="number" min={0} max={6} value={c.decimals ?? 0} onChange={e => setCol(c.id, 'decimals', +e.target.value || 0)}
                                className="bg-[#0d1117] border border-[#243247] rounded text-[9px] text-[#94a3b8] w-full text-center px-0.5 py-0.5 focus:outline-none focus:border-[#22c55e]" /></label>
                          </div>
                        </>) : (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[8px] text-[#64748b] w-8 flex-shrink-0">길이</span>
                            <input type="number" min={1} max={64} value={c.maxLen ?? 12} onChange={e => setCol(c.id, 'maxLen', +e.target.value || 12)}
                              className="bg-[#0d1117] border border-[#243247] rounded text-[9px] text-[#94a3b8] w-full text-center px-0.5 py-0.5 focus:outline-none focus:border-[#22c55e]" />
                          </div>
                        )}
                        {/* 단위 */}
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[8px] text-[#64748b] w-8 flex-shrink-0">단위</span>
                          <input value={c.unit || ''} onChange={e => setCol(c.id, 'unit', e.target.value)} placeholder="mm"
                            className="bg-[#0d1117] border border-[#1e2a3a] rounded text-[9px] text-[#94a3b8] w-full text-center px-1 py-0.5 focus:outline-none focus:border-[#22c55e]" />
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 && (
                    <tr><td colSpan={cols.length + 1} className="text-center py-6 text-[11px] text-[#4a5568]">+ 행(레시피) 추가 를 눌러 레시피를 만드세요.</td></tr>
                  )}
                  {items.map((it, idx) => (
                    <tr key={idx} className="group">
                      <td className="sticky left-0 z-[1] px-2 py-1 text-center" style={{ background: '#0f1520', borderBottom: '1px solid #1a2230' }}>
                        <div className="flex items-center justify-center gap-1">
                          <span className="flex items-center justify-center min-w-[22px] h-[18px] px-1 rounded text-[11px] font-bold" style={{ background: '#14532d', color: '#4ade80' }}>{it.no}</span>
                          <button onClick={() => delItem(idx)} className="text-[#7f1d1d] hover:text-[#ef4444] opacity-0 group-hover:opacity-100 flex-shrink-0" title="행 삭제"><Trash2 size={11} /></button>
                        </div>
                      </td>
                      {cols.map(c => (
                        <td key={c.id} className="px-1 py-1" style={{ borderBottom: '1px solid #1a2230', borderLeft: '1px solid #141c28' }}>
                          <input type={c.type === 'number' ? 'number' : 'text'}
                            value={it.values?.[c.id] ?? ''}
                            maxLength={c.type === 'text' ? (c.maxLen || 64) : undefined}
                            step={c.type === 'number' && c.decimals ? 1 / Math.pow(10, c.decimals) : undefined}
                            onChange={e => setCell(idx, c.id, c.type === 'number' ? (e.target.value === '' ? '' : +e.target.value) : e.target.value)}
                            className={cellCls} style={{ textAlign: c.type === 'number' ? 'right' : 'left' }} />
                          {active.showAddr !== false && c.addr && (
                            <div className="text-[8px] text-[#475569] font-mono text-center mt-0.5">{addrStep(c.addr, idx * index)}</div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>)}

        {/* 푸터 */}
        <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid #1e2a3a', background: '#0c141e' }}>
          <p className="text-[9px] text-[#4a5568]">셀 주소 = 열 기준주소 + (행순서 × 인덱스). 런타임에서 번호 워드 값에 따라 해당 행이 다운로드됩니다.</p>
          <button onClick={onClose} className="ml-auto px-4 py-1.5 rounded text-[11px] font-bold" style={{ background: '#14532d', color: '#fff', border: '1px solid #22c55e' }}>완료</button>
        </div>
      </div>
    </div>
  )
}
