import { useState, useRef, useEffect } from 'react'
import { playBeep } from '../utils/beep'
import { X, Save, FolderOpen, User, FileText, Monitor, Tag, Cpu, Layers, CheckCircle2 } from 'lucide-react'

/* NexusHMI 로고 인라인 — 파란 배경 + 파형 */
function NexusLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a6dd4"/>
          <stop offset="100%" stopColor="#0e4fb0"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="12" fill="url(#nbg)"/>
      <polyline
        points="6,32 16,32 22,18 28,46 34,24 40,38 46,32 58,32"
        fill="none" stroke="white" strokeWidth="4.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  )
}

/* 프로젝트 파일 미리보기 카드 */
function FilePreviewCard({ name }) {
  const fileName = (name || '새 프로젝트').replace(/[^\w가-힣\- ]/g, '_')
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      {/* 파일 아이콘 */}
      <div className="relative">
        {/* 파일 종이 모양 */}
        <div className="flex flex-col items-center justify-center rounded-lg relative"
          style={{ width: 72, height: 84, background: '#0d1b3e', border: '2px solid #1e40af', boxShadow: '0 0 18px #1e40af66' }}>
          {/* 모서리 접힘 */}
          <div className="absolute top-0 right-0"
            style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 16px 16px 0', borderColor: `transparent #0a0f1a transparent transparent` }} />
          <div className="absolute top-0 right-0"
            style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '16px 0 0 16px', borderColor: `transparent transparent transparent #1e3a6e` }} />
          {/* 로고 */}
          <NexusLogo size={36} />
          {/* 확장자 배지 */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <span className="text-[9px] font-bold tracking-widest px-2 py-0.5 rounded"
              style={{ background: '#1e40af', color: '#93c5fd' }}>.nexus</span>
          </div>
        </div>
      </div>
      {/* 파일명 */}
      <p className="text-[11px] font-mono text-[#cbd5e1] max-w-[120px] text-center truncate">
        {fileName}<span className="text-[#4a9eff]">.nexus</span>
      </p>
    </div>
  )
}

/* ── 입력 필드 ── */
function Field({ label, icon: Icon, iconColor = '#60a5fa', children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        {Icon && <Icon size={11} style={{ color: iconColor }} />}
        <label className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wider">{label}</label>
      </div>
      {children}
    </div>
  )
}

const inputCls = 'w-full text-[12px] font-mono rounded px-2.5 py-2 bg-[#0a0f1a] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#3b82f6] placeholder-[#4a5568]'

/* ── 저장 성공 토스트 ── */
function SuccessToast({ fileName, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])
  return (
    <div className="fixed bottom-6 right-6 z-[500] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl animate-fade-in"
      style={{ background: '#0d2515', border: '1px solid #22c55e', minWidth: 260 }}>
      <CheckCircle2 size={18} className="text-[#22c55e] shrink-0" />
      <div>
        <p className="text-[12px] font-bold text-[#4ade80]">저장 완료</p>
        <p className="text-[10px] text-[#6b7280] font-mono truncate max-w-[200px]">{fileName}</p>
      </div>
      <button onClick={onClose} className="ml-auto text-[#4a5568] hover:text-white"><X size={12} /></button>
    </div>
  )
}

/* ════════════════ 메인 다이얼로그 ════════════════ */
export default function SaveProjectDialog({ projectData, onClose, onSaved }) {
  const [name, setName]     = useState(projectData?.name ?? '새 프로젝트')
  const [author, setAuthor] = useState(projectData?.author ?? '')
  const [desc, setDesc]     = useState(projectData?.desc ?? '')
  const [saving, setSaving] = useState(false)
  const [toast, setToast]   = useState(null)
  const nameRef = useRef(null)

  useEffect(() => { nameRef.current?.select() }, [])

  const safeFileName = name.trim().replace(/[\\/:*?"<>|]/g, '_') || '새_프로젝트'

  /* File System Access API 사용 (Chrome/Edge 지원) */
  const supportsFilePicker = typeof window.showSaveFilePicker === 'function'

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const payload = {
      ...projectData,
      name: name.trim(),
      author: author.trim() || undefined,
      desc: desc.trim() || undefined,
      _format: 'nexushmi',
      _v: 2,
      _savedAt: new Date().toISOString(),
    }
    const json = JSON.stringify(payload, null, 2)

    try {
      if (supportsFilePicker) {
        // OS 저장 위치 선택 다이얼로그
        const handle = await window.showSaveFilePicker({
          suggestedName: `${safeFileName}.nexus`,
          types: [{
            description: 'NexusHMI 프로젝트 파일',
            accept: { 'application/json': ['.nexus'] },
          }],
        })
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        setToast(handle.name)
        onSaved?.(name.trim(), handle.name, handle)
        onClose()
      } else {
        // 폴백: 브라우저 다운로드
        const blob = new Blob([json], { type: 'application/json' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `${safeFileName}.nexus`
        a.click()
        URL.revokeObjectURL(url)
        const fn = `${safeFileName}.nexus`
        setToast(fn)
        onSaved?.(name.trim(), fn)
        onClose()
      }
    } catch (err) {
      if (err?.name !== 'AbortError') {
        window.alert('저장 실패: ' + err?.message)
      }
    } finally {
      setSaving(false)
    }
  }

  const stats = [
    { icon: Monitor, color: '#60a5fa', label: '화면', value: projectData?.screens?.length ?? 0 },
    { icon: Tag,     color: '#a78bfa', label: '태그', value: projectData?.tags?.length ?? 0 },
    { icon: Cpu,     color: '#f59e0b', label: '디바이스', value: projectData?.devices?.length ?? 0 },
    { icon: Layers,  color: '#4ade80', label: '심볼', value: projectData?.symbols?.length ?? 0 },
  ]

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-[400] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', cursor:'not-allowed' }}
        onClick={e => { if (e.target === e.currentTarget) playBeep() }}>

        <div className="rounded-2xl border border-[#374151] shadow-2xl overflow-hidden flex"
          style={{ background: '#0d1117', width: 580, maxHeight: '90vh',
            boxShadow: '0 0 0 1px #1e40af33, 0 30px 60px rgba(0,0,0,0.8)' }}>

          {/* 좌측 파일 미리보기 패널 */}
          <div className="flex flex-col items-center pt-2 pb-4 border-r border-[#1e2736] flex-shrink-0"
            style={{ width: 160, background: '#080e18' }}>
            <FilePreviewCard name={name} />

            {/* 프로젝트 통계 */}
            <div className="w-full px-3 space-y-1.5 mt-1">
              {stats.map(s => {
                const Icon = s.icon
                return (
                  <div key={s.label} className="flex items-center gap-2 px-2 py-1 rounded"
                    style={{ background: '#0d1520' }}>
                    <Icon size={10} style={{ color: s.color }} />
                    <span className="text-[9px] text-[#6b7280] flex-1">{s.label}</span>
                    <span className="text-[10px] font-bold font-mono" style={{ color: s.color }}>{s.value}</span>
                  </div>
                )
              })}
            </div>

            {/* 저장 방식 안내 */}
            <div className="mx-3 mt-4 px-2 py-2 rounded text-[8.5px] text-[#4a5568] leading-relaxed text-center"
              style={{ background: '#0a0f1a', border: '1px solid #1e2736' }}>
              {supportsFilePicker
                ? '💾 저장 위치를\n직접 선택할 수\n있습니다'
                : '📥 다운로드\n폴더에 저장됩니다'}
            </div>
          </div>

          {/* 우측 입력 패널 */}
          <div className="flex flex-col flex-1 min-w-0">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1e2736]" style={{ background: '#080e18' }}>
              <NexusLogo size={32} />
              <div>
                <p className="text-[14px] font-bold text-[#f1f5f9]">프로젝트 저장</p>
                <p className="text-[10px] text-[#4a5568]">NexusHMI · .nexus 형식</p>
              </div>
              <button onClick={onClose} className="ml-auto p-1.5 rounded hover:bg-[#1e2736] text-[#4a5568] hover:text-[#94a3b8] transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* 입력 폼 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              <Field label="프로젝트 이름" icon={FileText} iconColor="#60a5fa">
                <input
                  ref={nameRef}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  className={inputCls}
                  placeholder="예: PLANT_A_LINE1"
                />
                <p className="text-[9px] text-[#4a5568] mt-1 font-mono">
                  파일명: <span className="text-[#60a5fa]">{safeFileName}.nexus</span>
                </p>
              </Field>

              <Field label="저자 / 작성자" icon={User} iconColor="#a78bfa">
                <input
                  value={author}
                  onChange={e => setAuthor(e.target.value)}
                  className={inputCls}
                  placeholder="이름 또는 팀명 (선택)"
                />
              </Field>

              <Field label="설명 / 메모" icon={FileText} iconColor="#f59e0b">
                <textarea
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  rows={3}
                  className={inputCls + ' resize-none'}
                  placeholder="프로젝트 설명, 버전, 변경 이력 등 (선택)"
                />
              </Field>

              {/* 저장 위치 안내 */}
              {supportsFilePicker ? (
                <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg"
                  style={{ background: '#0d2015', border: '1px solid #166534' }}>
                  <FolderOpen size={14} className="text-[#22c55e] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-[#4ade80]">저장 위치 선택 가능</p>
                    <p className="text-[9px] text-[#6b7280] mt-0.5">
                      "저장" 클릭 시 OS 파일 저장 대화상자가 열립니다.<br />
                      원하는 폴더와 파일명을 직접 지정할 수 있습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg"
                  style={{ background: '#1a1505', border: '1px solid #713f12' }}>
                  <FolderOpen size={14} className="text-[#f59e0b] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-[#fbbf24]">브라우저 다운로드 폴더에 저장</p>
                    <p className="text-[9px] text-[#6b7280] mt-0.5">
                      Chrome/Edge에서 저장 위치 선택 기능이 지원됩니다.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 하단 버튼 */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-[#1e2736]" style={{ background: '#080e18' }}>
              <button onClick={onClose}
                className="px-5 py-2.5 rounded-lg text-[11px] font-bold text-[#94a3b8] border border-[#374151] hover:bg-[#1e2736] transition-colors">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim() || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-bold text-white transition-all"
                style={name.trim() && !saving
                  ? { background: 'linear-gradient(135deg, #1e40af, #1d4ed8)', border: '1px solid #3b82f6', boxShadow: '0 0 16px #3b82f644' }
                  : { background: '#1e2736', border: '1px solid #374151', color: '#4a5568', cursor: 'not-allowed' }}>
                {saving
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> 저장 중...</>
                  : <><Save size={14} /> {supportsFilePicker ? '저장 위치 선택 후 저장' : '저장'}</>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 성공 토스트 */}
      {toast && <SuccessToast fileName={toast} onClose={() => setToast(null)} />}
    </>
  )
}
