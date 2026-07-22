import { useState, useEffect } from 'react'
import { Brain, X, FolderOpen, RefreshCw } from 'lucide-react'
import { getLearningConfig, setLearningConfig, getLearningProfile } from '../utils/api'

// 학습 라이브러리 설정 — vault 경로(=Obsidian/Google Drive 폴더) 지정 + 학습 상태
export default function LearningSettings({ open, onClose, onProfileChange }) {
  const [vaultDir, setVaultDir] = useState('')
  const [draft, setDraft] = useState('')
  const [count, setCount] = useState(0)
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)

  const refresh = () => {
    getLearningConfig().then(r => { if (r?.vaultDir) { setVaultDir(r.vaultDir); setDraft(r.vaultDir) } })
    getLearningProfile().then(r => { if (r) { setCount(r.count || 0); setSummary(r.summary || '') } })
  }
  useEffect(() => { if (open) refresh() }, [open])
  if (!open) return null

  const save = async () => {
    if (!draft.trim() || draft === vaultDir) return
    setSaving(true)
    const r = await setLearningConfig(draft.trim())
    setSaving(false)
    if (r?.vaultDir) { setVaultDir(r.vaultDir); getLearningProfile().then(p => { if (p) { setCount(p.count || 0); setSummary(p.summary || ''); onProfileChange?.(p.summary || '') } }) }
  }

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="rounded-xl border border-[#374151] shadow-2xl overflow-hidden" style={{ background: '#0d1117', width: 560, maxWidth: '92vw' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#374151]" style={{ background: '#0c1f14' }}>
          <Brain size={14} className="text-[#34d399]" />
          <span className="text-[13px] font-bold text-[#f1f5f9]">학습 라이브러리</span>
          <span className="text-[10px] text-[#64748b]">— 빌드(RUN)할 때마다 패턴이 여기 쌓입니다</span>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-[#374151] text-[#6b7280] hover:text-white"><X size={14} /></button>
        </div>

        <div className="p-4 space-y-4">
          {/* 상태 */}
          <div className="flex items-center gap-3">
            <div className="rounded-lg px-4 py-3 text-center" style={{ background: '#0c1f14', border: '1px solid #166534' }}>
              <div className="text-[22px] font-bold text-[#34d399] font-mono leading-none">{count}</div>
              <div className="text-[9px] text-[#64748b] mt-1">학습된 프로젝트</div>
            </div>
            <p className="text-[10px] text-[#94a3b8] leading-relaxed flex-1">
              RUN(▶) 할 때마다 현재 화면의 <b className="text-[#cbd5e1]">패턴(태그 명명·패널 구성·스타일)</b>과 썸네일이
              아래 폴더에 저장되고, 다음 작업부터 <b className="text-[#cbd5e1]">캔버스 AI가 그 방식대로</b> 만듭니다.
            </p>
          </div>

          {/* vault 경로 */}
          <div>
            <p className="text-[10px] font-bold text-[#94a3b8] mb-1.5 flex items-center gap-1"><FolderOpen size={11} /> 저장 폴더 (vault)</p>
            <div className="flex gap-2">
              <input value={draft} onChange={e => setDraft(e.target.value)} spellCheck={false}
                placeholder="예) C:\Users\...\Google Drive\HMI학습  또는  Obsidian vault 폴더"
                className="flex-1 text-[11px] font-mono rounded px-2.5 py-2 bg-[#0a0f1a] border border-[#374151] text-[#e2e8f0] focus:outline-none focus:border-[#22c55e]" />
              <button onClick={save} disabled={saving || !draft.trim() || draft === vaultDir}
                className="px-3 py-2 rounded text-[11px] font-bold text-white disabled:opacity-40"
                style={{ background: '#166534', border: '1px solid #22c55e' }}>{saving ? '…' : '변경'}</button>
              <button onClick={refresh} title="새로고침" className="px-2 py-2 rounded text-[#64748b] border border-[#374151] hover:bg-[#1e2736]"><RefreshCw size={12} /></button>
            </div>
            <p className="text-[9px] text-[#4a5568] mt-1.5 leading-relaxed">
              이 폴더를 <b className="text-[#64748b]">Google Drive 동기화 폴더</b>나 <b className="text-[#64748b]">Obsidian vault</b> 안에 두면 →
              자동 백업·다기기 동기화 + 노트로 직접 확인/수정 가능. (마크다운 표 + 썸네일로 저장됨)
            </p>
          </div>

          {/* 현재 학습 요약 */}
          {summary && (
            <div>
              <p className="text-[10px] font-bold text-[#94a3b8] mb-1.5">현재 AI가 참조하는 학습 요약</p>
              <pre className="text-[9px] text-[#7dd3a8] bg-[#0a0f1a] border border-[#1e2b22] rounded p-2.5 overflow-auto max-h-[160px] whitespace-pre-wrap font-mono">{summary}</pre>
            </div>
          )}
          {!summary && (
            <p className="text-[10px] text-[#4a5568] italic">아직 학습된 패턴이 없습니다. 화면을 만들고 <b className="text-[#22c55e]">RUN ▶</b> 하면 첫 학습이 쌓입니다.</p>
          )}
        </div>
      </div>
    </div>
  )
}
