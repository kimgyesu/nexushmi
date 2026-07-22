import { useState, useEffect } from 'react'
import {
  FilePlus2, FolderOpen, Save, SaveAll, FileText,
  X, Clock, Trash2, ChevronRight, FileSymlink, Puzzle,
} from 'lucide-react'

/* ── 최근 파일 localStorage 키 ── */
const RECENT_KEY = 'nexushmi.recentFiles'
const MAX_RECENT = 12

export function addRecentFile(entry) {
  // entry: { name, fileName, savedAt }
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const filtered = prev.filter(r => r.fileName !== entry.fileName)
    const next = [{ ...entry, savedAt: new Date().toISOString() }, ...filtered].slice(0, MAX_RECENT)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {}
}

export function getRecentFiles() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') }
  catch { return [] }
}

function clearRecentFiles() {
  localStorage.removeItem(RECENT_KEY)
}

/* ── 날짜 포맷 ── */
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}  ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/* ── NexusHMI 로고 ── */
function Logo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="fmbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1a6dd4"/>
          <stop offset="100%" stopColor="#0e4fb0"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="12" fill="url(#fmbg)"/>
      <polyline points="6,32 16,32 22,18 28,46 34,24 40,38 46,32 58,32"
        fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

/* ── 파일 카드 아이콘 (미니) ── */
function FileIcon({ size = 32 }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 32 38">
      <rect width="32" height="38" rx="4" fill="#0d1b3e" stroke="#1e40af" strokeWidth="1.5"/>
      <path d="M20 0 L32 12" fill="none" stroke="#0a0f1a" strokeWidth="2"/>
      <path d="M20 0 L20 12 L32 12" fill="#1e3a6e" stroke="#1e40af" strokeWidth="1.5"/>
      <polyline points="5,22 9,22 11,17 14,27 17,19 20,24 22,22 27,22"
        fill="none" stroke="#4a9eff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="16" y="35" textAnchor="middle" fontSize="5.5" fontFamily="monospace" fill="#3b82f6" fontWeight="bold">.nexus</text>
    </svg>
  )
}

/* ── 좌측 메뉴 아이템 ── */
function MenuItem({ icon: Icon, label, desc, active, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-3.5 transition-colors text-left select-none"
      style={active
        ? { background: '#1e3a5f', borderLeft: '3px solid #3b82f6', paddingLeft: 17 }
        : { borderLeft: '3px solid transparent' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#141e2e' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={active ? { background: '#1e40af' } : { background: '#1a2233' }}>
        <Icon size={18} style={{ color: danger ? '#f87171' : active ? '#93c5fd' : '#94a3b8' }} />
      </div>
      <div className="flex flex-col">
        <span className="text-[13px] font-semibold" style={{ color: danger ? '#f87171' : active ? '#e2e8f0' : '#94a3b8' }}>
          {label}
        </span>
        {desc && <span className="text-[10px]" style={{ color: '#4a5568' }}>{desc}</span>}
      </div>
    </button>
  )
}

/* ── 최근 파일 행 ── */
function RecentRow({ file, onOpen, onRemove }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors"
      style={{ background: hover ? '#141e2e' : 'transparent' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(file)}
    >
      <FileIcon size={28} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-[#e2e8f0] truncate">{file.name}
          <span className="font-normal text-[#3b82f6]">.nexus</span>
        </p>
        <p className="text-[10px] text-[#4a5568] font-mono truncate mt-0.5">{file.fileName}</p>
        <p className="text-[10px] text-[#374151] font-mono mt-0.5">{fmtDate(file.savedAt)}</p>
      </div>
      {hover && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(file.fileName) }}
          className="p-1.5 rounded hover:bg-[#450a0a] text-[#4a5568] hover:text-[#ef4444] transition-colors shrink-0"
          title="목록에서 제거">
          <X size={13} />
        </button>
      )}
      {!hover && <ChevronRight size={14} className="text-[#2d3748] shrink-0" />}
    </div>
  )
}

/* ════════════════════════════════════════
   메인 FileMenu 컴포넌트
════════════════════════════════════════ */
export default function FileMenu({
  projectName, screens, tags, devices, symbols, resolution, activeScreenId,
  onClose,
  onNewProject,
  onOpenFile,       // (file) => void
  onSave,           // 빠른 저장 (마지막 위치)
  onSaveAs,         // 다른 이름으로 저장 다이얼로그
  onLoadDemo,
  onLoadGreenhouse,
}) {
  const [activeMenu, setActiveMenu] = useState('recent')
  const [recents, setRecents] = useState(getRecentFiles())

  function refreshRecents() { setRecents(getRecentFiles()) }

  function handleRemoveRecent(fileName) {
    try {
      const prev = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
      localStorage.setItem(RECENT_KEY, JSON.stringify(prev.filter(r => r.fileName !== fileName)))
      refreshRecents()
    } catch {}
  }

  function handleClearAll() {
    if (!window.confirm('최근 파일 목록을 모두 지울까요?')) return
    clearRecentFiles(); refreshRecents()
  }

  /* 최근 파일 열기 (파일 input 트리거 불가 → 안내) */
  function handleOpenRecent(file) {
    window.alert(`"${file.fileName}" 파일을 직접 열어주세요.\n\n파일 열기 버튼을 사용하여 해당 파일을 선택하세요.`)
  }

  /* .nexus 파일 형식 등록 스크립트 다운로드 */
  function downloadRegisterScript() {
    const ps1 = `# NexusHMI .nexus 파일 형식 + 아이콘 등록 스크립트
# 관리자 권한 자동 요청

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Start-Process powershell "-ExecutionPolicy Bypass -File \`"$PSCommandPath\`"" -Verb RunAs
    exit
}

Add-Type -AssemblyName System.Drawing

$iconDir = "$env:ProgramData\\NexusHMI"
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
$iconPath = "$iconDir\\nexus.ico"

function New-NexusIcon($path) {
    $sz = 32
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $bg = [System.Drawing.Color]::FromArgb(255, 20, 60, 180)
    $br = New-Object System.Drawing.SolidBrush($bg)
    $g.FillRectangle($br, 0, 0, $sz, $sz); $br.Dispose()
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 2.5)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pts = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(2,16), [System.Drawing.PointF]::new(6,16),
        [System.Drawing.PointF]::new(9,8),  [System.Drawing.PointF]::new(12,24),
        [System.Drawing.PointF]::new(15,12),[System.Drawing.PointF]::new(18,20),
        [System.Drawing.PointF]::new(22,16),[System.Drawing.PointF]::new(30,16)
    )
    $g.DrawLines($pen, $pts); $pen.Dispose(); $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $png = $ms.ToArray(); $ms.Dispose(); $bmp.Dispose()
    $fs = [System.IO.File]::OpenWrite($path)
    $bw = New-Object System.IO.BinaryWriter($fs)
    $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
    $bw.Write([byte]$sz); $bw.Write([byte]$sz); $bw.Write([byte]0); $bw.Write([byte]0)
    $bw.Write([uint16]1); $bw.Write([uint16]32)
    $bw.Write([uint32]$png.Length); $bw.Write([uint32]22)
    $bw.Write($png); $bw.Close(); $fs.Close()
}

New-NexusIcon $iconPath
Write-Host "  아이콘 생성: $iconPath" -ForegroundColor Cyan

$ext     = "HKLM:\\SOFTWARE\\Classes\\.nexus"
$prog    = "HKLM:\\SOFTWARE\\Classes\\NexusHMI.Project"
New-Item -Path $ext  -Force | Out-Null
Set-ItemProperty -Path $ext -Name "(Default)" -Value "NexusHMI.Project"
New-Item -Path $prog -Force | Out-Null
Set-ItemProperty -Path $prog -Name "(Default)" -Value "NexusHMI 프로젝트"
New-Item -Path "$prog\\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "$prog\\DefaultIcon" -Name "(Default)" -Value "\`"$iconPath\`",0"
New-Item -Path "$prog\\shell\\open\\command" -Force | Out-Null
Set-ItemProperty -Path "$prog\\shell\\open\\command" -Name "(Default)" -Value "explorer.exe \`"%1\`""

$sig = '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int w, int u, IntPtr i1, IntPtr i2);'
Add-Type -MemberDefinition $sig -Name WinAPI -Namespace Shell
[Shell.WinAPI]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Write-Host ""
Write-Host "✅ NexusHMI 파일 형식 등록 완료!" -ForegroundColor Green
Write-Host "   탐색기 F5 또는 재시작 후 아이콘이 적용됩니다." -ForegroundColor Yellow
pause`

    const bat = `@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0NexusHMI-파일형식등록.ps1"
`
    // PS1 다운로드
    const blob1 = new Blob([ps1], { type: 'text/plain' })
    const a1 = document.createElement('a')
    a1.href = URL.createObjectURL(blob1)
    a1.download = 'NexusHMI-파일형식등록.ps1'
    a1.click()
    URL.revokeObjectURL(a1.href)

    // BAT 다운로드
    setTimeout(() => {
      const blob2 = new Blob([bat], { type: 'text/plain' })
      const a2 = document.createElement('a')
      a2.href = URL.createObjectURL(blob2)
      a2.download = 'NexusHMI-파일형식등록.bat'
      a2.click()
      URL.revokeObjectURL(a2.href)
      window.alert('두 파일이 다운로드됩니다.\n\n▶ NexusHMI-파일형식등록.bat 을 더블클릭하여 실행하세요.\n  (최초 1회, 관리자 권한 자동 요청)')
    }, 300)
  }

  /* 파일 열기 input */
  function handleOpenFile() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.nexus,.json'
    input.onchange = e => {
      const f = e.target.files?.[0]
      if (f) { onOpenFile(f); onClose() }
    }
    input.click()
  }

  const MENU_ITEMS = [
    {
      id: 'new',
      icon: FilePlus2,
      label: '새 프로젝트',
      action: () => { onNewProject(); onClose() },
    },
    {
      id: 'open',
      icon: FolderOpen,
      label: '열기',
      action: handleOpenFile,
    },
    { id: 'divider1' },
    {
      id: 'save',
      icon: Save,
      label: '저장',
      action: () => { onSave(); onClose() },
    },
    {
      id: 'saveas',
      icon: SaveAll,
      label: '다른 이름으로 저장',
      action: () => { onSaveAs(); onClose() },
    },
    { id: 'divider2' },
    {
      id: 'demo',
      icon: FileSymlink,
      label: '데모: 스마트팩토리',
      action: () => { onLoadDemo(); onClose() },
    },
    {
      id: 'demo-gh',
      icon: FileSymlink,
      label: '데모: 스마트 온실',
      action: () => { onLoadGreenhouse?.(); onClose() },
    },
    {
      id: 'recent',
      icon: Clock,
      label: '최근 파일',
      action: () => setActiveMenu('recent'),
      isSection: true,
    },
    { id: 'divider3' },
    {
      id: 'register',
      icon: Puzzle,
      label: '.nexus 파일 형식 등록',
      desc: '탐색기 아이콘 적용 (최초 1회)',
      action: downloadRegisterScript,
    },
    { id: 'divider4' },
    {
      id: 'close',
      icon: X,
      label: '닫기',
      action: onClose,
      danger: true,
    },
  ]

  return (
    <div className="fixed inset-0 z-[500] flex" style={{ background: 'rgba(0,0,0,0.85)' }}>
      <div className="flex w-full h-full" style={{ background: '#0a0f1a' }}>

        {/* ── 좌측 패널 ── */}
        <div className="flex flex-col border-r border-[#1e2736] flex-shrink-0"
          style={{ width: 260, background: '#080d16' }}>

          {/* 앱 헤더 */}
          <div className="flex items-center gap-3 px-5 py-5 border-b border-[#1e2736]">
            <Logo size={40} />
            <div>
              <p className="text-[15px] font-black text-[#e2e8f0] tracking-wide">NexusHMI</p>
              <p className="text-[10px] text-[#4a5568] font-mono">v1.0.0 · Industrial SCADA</p>
            </div>
          </div>

          {/* 현재 프로젝트 표시 */}
          <div className="px-5 py-3 border-b border-[#1e2736]" style={{ background: '#0d1520' }}>
            <p className="text-[9px] text-[#374151] uppercase tracking-widest mb-1">현재 프로젝트</p>
            <p className="text-[12px] font-bold text-[#60a5fa] font-mono truncate">{projectName || '(없음)'}</p>
            <p className="text-[9px] text-[#2d3748] font-mono mt-0.5">
              화면 {screens?.length ?? 0}개 · 태그 {tags?.length ?? 0}개
            </p>
          </div>

          {/* 메뉴 목록 */}
          <nav className="flex-1 overflow-y-auto py-2">
            {MENU_ITEMS.map((item, i) => {
              if (item.id?.startsWith('divider'))
                return <div key={i} className="h-px my-2 mx-5" style={{ background: '#1e2736' }} />
              return (
                <MenuItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  desc={item.desc}
                  active={activeMenu === item.id}
                  danger={item.danger}
                  onClick={() => {
                    if (item.isSection) setActiveMenu(item.id)
                    else item.action?.()
                  }}
                />
              )
            })}
          </nav>
        </div>

        {/* ── 우측 콘텐츠 ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* 우측 헤더 */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-[#1e2736]"
            style={{ background: '#080d16' }}>
            <div>
              <h2 className="text-[18px] font-black text-[#e2e8f0]">최근 파일</h2>
              <p className="text-[10px] text-[#4a5568] mt-0.5">최근에 저장한 NexusHMI 프로젝트 목록</p>
            </div>
            <div className="flex items-center gap-2">
              {recents.length > 0 && (
                <button onClick={handleClearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] text-[#6b7280] hover:text-[#ef4444] hover:bg-[#450a0a] border border-[#1e2736] transition-colors">
                  <Trash2 size={11} /> 목록 지우기
                </button>
              )}
              <button onClick={onClose}
                className="p-2 rounded hover:bg-[#1e2736] text-[#4a5568] hover:text-[#94a3b8] transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* 최근 파일 목록 */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {recents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
                <FileIcon size={56} />
                <div className="text-center">
                  <p className="text-[14px] font-bold text-[#4a5568]">최근 파일 없음</p>
                  <p className="text-[11px] text-[#374151] mt-1">프로젝트를 저장하면 여기에 표시됩니다.</p>
                </div>
              </div>
            ) : (
              <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }}>
                {recents.map(file => (
                  <RecentRow
                    key={file.fileName}
                    file={file}
                    onOpen={handleOpenRecent}
                    onRemove={handleRemoveRecent}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 하단 빠른 실행 */}
          <div className="flex items-center gap-3 px-8 py-4 border-t border-[#1e2736]"
            style={{ background: '#080d16' }}>
            <button onClick={() => { onNewProject(); onClose() }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold transition-colors"
              style={{ background: '#1a2233', border: '1px solid #374151', color: '#94a3b8' }}
              onMouseEnter={e => e.currentTarget.style.background = '#1e2736'}
              onMouseLeave={e => e.currentTarget.style.background = '#1a2233'}>
              <FilePlus2 size={13} className="text-[#60a5fa]" /> 새 프로젝트
            </button>
            <button onClick={handleOpenFile}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold transition-colors"
              style={{ background: '#1a2233', border: '1px solid #374151', color: '#94a3b8' }}
              onMouseEnter={e => e.currentTarget.style.background = '#1e2736'}
              onMouseLeave={e => e.currentTarget.style.background = '#1a2233'}>
              <FolderOpen size={13} className="text-[#f59e0b]" /> 파일 열기
            </button>
            <button onClick={() => { onSaveAs(); onClose() }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-bold text-white transition-all"
              style={{ background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', border: '1px solid #3b82f6', boxShadow: '0 0 12px #3b82f633' }}>
              <SaveAll size={13} /> 다른 이름으로 저장
            </button>
            <div className="ml-auto text-[9px] text-[#374151] font-mono">
              ESC로 닫기
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
