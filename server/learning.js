// ════════════════════════════════════════════════════════════
//  학습 라이브러리 — 프로젝트에서 패턴을 추출해 저장/누적하고,
//  압축 요약을 AI에 제공한다.
//
//  ① 저장소 어댑터: Store 인터페이스(save/read/list/exists)를 통해서만
//     접근 → 나중에 클라우드(GCS/Drive API/DB)로 구현만 교체하면 됨.
//  ② 기본 구현: LocalStore (로컬 폴더 = Obsidian vault / Google Drive 동기화 폴더).
//
//  저장 포맷(이식성):
//    <vault>/HMI패턴/<프로젝트>.md          — 사람용(Obsidian) 마크다운 표 + 썸네일 embed
//    <vault>/HMI패턴/_profiles/<프로젝트>.json — 기계용 구조 프로파일(AI 학습)
//    <vault>/HMI패턴/attachments/<프로젝트>.svg — 화면 썸네일
// ════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'

// ── ① 저장소 어댑터 인터페이스 ──
// 어떤 백엔드든 아래 4개만 구현하면 됨. (로컬 → 클라우드 교체 지점)
class LocalStore {
  constructor(root) { this.root = root }
  _abs(rel) { return path.join(this.root, rel) }
  save(rel, data) {
    const f = this._abs(rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, data)
    return f
  }
  read(rel) {
    const f = this._abs(rel)
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
  }
  list(sub = '') {
    const d = this._abs(sub)
    return fs.existsSync(d) ? fs.readdirSync(d) : []
  }
  exists(rel) { return fs.existsSync(this._abs(rel)) }
}
// 나중에: class CloudStore { save/read/list/exists } — 같은 인터페이스로 교체

const SUBDIR = 'HMI패턴'
const PROFILE_DIR = `${SUBDIR}/_profiles`
const ATTACH_DIR = `${SUBDIR}/attachments`

export function makeLearning(configPath, defaultVaultDir) {
  // 설정: vault 경로 (로컬/Drive 동기화 폴더). configPath에 저장.
  const loadConfig = () => {
    try { if (fs.existsSync(configPath)) return JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch {}
    return {}
  }
  const saveConfig = (cfg) => { try { fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8') } catch {} }
  let cfg = loadConfig()
  if (!cfg.vaultDir) { cfg.vaultDir = defaultVaultDir; saveConfig(cfg) }

  let store = new LocalStore(cfg.vaultDir)

  const getConfig = () => ({ vaultDir: cfg.vaultDir })
  const setConfig = (vaultDir) => {
    if (vaultDir && typeof vaultDir === 'string') {
      cfg.vaultDir = vaultDir; saveConfig(cfg); store = new LocalStore(vaultDir)
    }
    return getConfig()
  }

  // ── 파일명 안전화 ──
  const safe = (s) => String(s || 'untitled').replace(/[^\w가-힣\- ]/g, '_').trim().slice(0, 60) || 'untitled'

  // ── 패턴 추출 ──
  function extractProfile(project) {
    const screens = Array.isArray(project.screens) ? project.screens
      : [{ elements: project.elements || [], bindings: project.bindings || {} }]
    const tags = Array.isArray(project.tags) ? project.tags : []
    const allEls = screens.flatMap(s => s.elements || [])

    // 태그 명명
    const utilities = [...new Set(tags.map(t => t.utility).filter(Boolean))]
    const prefixes = {}
    for (const t of tags) { const m = String(t.id).match(/^([A-Za-z]+_)/); if (m) prefixes[m[1]] = (prefixes[m[1]] || 0) + 1 }
    const tagPrefix = Object.entries(prefixes).sort((a, z) => z[1] - a[1])[0]?.[0] || ''
    const tagSamples = tags.slice(0, 8).map(t => t.id)

    // 스타일 최빈값
    const mode = (arr) => { const m = {}; let best = null, bc = 0; for (const v of arr) { if (v == null || v === '') continue; m[v] = (m[v] || 0) + 1; if (m[v] > bc) { bc = m[v]; best = v } } return best }
    const gboxes = allEls.filter(e => e.type === 'groupbox')
    const numerics = allEls.filter(e => e.type === 'numeric')
    const style = {
      gboxW: mode(gboxes.map(g => g.width)) || null,
      gboxH: mode(gboxes.map(g => g.height)) || null,
      border: mode(gboxes.map(g => g.borderColor)) || null,
      bg: mode(gboxes.map(g => g.bgColor)) || null,
      valueFont: mode(numerics.map(n => n.valueFontSize)) || null,
    }

    // 패널 구성(설비 → 행) — 그룹박스별 내부 컨트롤 추출
    const bx = (e) => {
      if (e.type === 'groupbox') return { l: e.x, t: e.y, r: e.x + (e.width || 200), b: e.y + (e.height || 120) }
      const hw = e.hw || 45, hh = e.hh || 22
      return { l: e.x - hw, t: e.y - hh, r: e.x + hw, b: e.y + hh, cx: e.x, cy: e.y }
    }
    const CTRL = ['numeric', 'lamp', 'switch', 'gauge', 'bar']
    const recipes = []
    for (const s of screens) {
      const els = s.elements || []
      const boxes = els.filter(e => e.type === 'groupbox')
      for (const g of boxes) {
        const gb = bx(g)
        const inside = els.filter(e => e !== g && CTRL.includes(e.type) && e.x >= gb.l && e.x <= gb.r && e.y >= gb.t && e.y <= gb.b)
        if (!inside.length) continue
        const texts = els.filter(e => e.type === 'text' && e.x >= gb.l && e.x <= gb.r && e.y >= gb.t && e.y <= gb.b)
        const rows = inside.sort((a, z) => a.y - z.y).map(c => {
          // 같은 행(±14px)에서 가장 가까운 왼쪽 라벨
          const lbl = texts.filter(t => Math.abs(t.y - c.y) < 16).sort((a, z) => Math.abs(a.x - c.x) - Math.abs(z.x - c.x))[0]
          return { label: (lbl?.label || '').slice(0, 20), type: c.type }
        })
        recipes.push({ title: String(g.label || '패널').slice(0, 30), rows })
      }
    }

    return {
      project: safe(project.name),
      captured: null, // 서버에서 시각 주입(시간 함수 회피용은 아니고 실서버라 Date OK)
      resolution: project.resolution ? `${project.resolution.w}x${project.resolution.h}` : '',
      tagCount: tags.length, screenCount: screens.length,
      tagPrefix, utilities, tagSamples, style,
      panelRecipes: recipes.slice(0, 20),
    }
  }

  // ── 마크다운 노트(사람/Obsidian용) ──
  function toMarkdown(p, hasThumb) {
    const L = []
    L.push('---')
    L.push(`project: ${p.project}`)
    L.push(`captured: ${p.captured}`)
    L.push(`resolution: ${p.resolution}`)
    L.push(`tags: ${p.tagCount}`)
    L.push(`screens: ${p.screenCount}`)
    L.push('tags-index: [HMI패턴]')
    L.push('---')
    L.push('')
    L.push(`# ${p.project} — HMI 작화 패턴`)
    L.push('')
    if (hasThumb) { L.push(`![[attachments/${p.project}.svg]]`); L.push('') }
    L.push('## 태그 명명')
    L.push(`- 접두어: \`${p.tagPrefix || '(없음)'}\``)
    L.push(`- 그룹(utility): ${p.utilities.length ? p.utilities.join(', ') : '(없음)'}`)
    L.push(`- 예시: ${p.tagSamples.join(', ') || '(없음)'}`)
    L.push('')
    L.push('## 스타일')
    L.push(`- 그룹박스: ${p.style.gboxW || '-'}×${p.style.gboxH || '-'}, 테두리 \`${p.style.border || '-'}\``)
    L.push(`- 값 글꼴 크기: ${p.style.valueFont || '-'}`)
    L.push('')
    L.push('## 패널 구성 (설비 → 행)')
    if (p.panelRecipes.length) {
      L.push('| 설비 | 행 구성 |')
      L.push('|------|--------|')
      for (const r of p.panelRecipes) {
        const rows = r.rows.map(x => `${x.label || '?'}(${x.type})`).join(' · ')
        L.push(`| ${r.title} | ${rows} |`)
      }
    } else {
      L.push('(그룹박스 패널 없음)')
    }
    L.push('')
    L.push('> 이 노트는 NexusHMI가 빌드 시 자동 생성했습니다. 자유롭게 고치거나 주석을 달면 AI가 그대로 학습합니다.')
    return L.join('\n')
  }

  // ── 캡처: 빌드 시 호출 → 라이브러리에 누적 ──
  function capture(project, thumbnailSvg) {
    const p = extractProfile(project)
    p.captured = new Date().toISOString()
    const hasThumb = typeof thumbnailSvg === 'string' && thumbnailSvg.trim().startsWith('<svg')
    if (hasThumb) store.save(`${ATTACH_DIR}/${p.project}.svg`, thumbnailSvg)
    store.save(`${PROFILE_DIR}/${p.project}.json`, JSON.stringify(p, null, 2))
    const mdFile = store.save(`${SUBDIR}/${p.project}.md`, toMarkdown(p, hasThumb))
    return { ok: true, project: p.project, file: mdFile, vaultDir: cfg.vaultDir }
  }

  // ── 프로파일: 라이브러리 전체를 압축 요약해 AI에 주입 ──
  function getProfile() {
    const files = store.list(PROFILE_DIR).filter(f => f.endsWith('.json'))
    const profiles = []
    for (const f of files) {
      try { const raw = store.read(`${PROFILE_DIR}/${f}`); if (raw) profiles.push(JSON.parse(raw)) } catch {}
    }
    if (!profiles.length) return { count: 0, summary: '' }

    // 누적 최빈 패턴으로 압축
    const tally = (fn) => { const m = {}; for (const p of profiles) for (const v of [].concat(fn(p) || [])) { if (v == null || v === '') continue; m[v] = (m[v] || 0) + 1 } return Object.entries(m).sort((a, z) => z[1] - a[1]) }
    const topUtilities = tally(p => p.utilities).slice(0, 12).map(x => x[0])
    const topPrefix = tally(p => p.tagPrefix)[0]?.[0] || ''
    const topBorder = tally(p => p.style?.border)[0]?.[0] || ''
    const topGboxW = tally(p => p.style?.gboxW)[0]?.[0] || ''
    const topGboxH = tally(p => p.style?.gboxH)[0]?.[0] || ''
    const topValueFont = tally(p => p.style?.valueFont)[0]?.[0] || ''

    // 대표 패널 레시피 (설비명 기준 중복 제거, 최대 12개)
    const seen = new Set(); const recipes = []
    for (const p of profiles) for (const r of (p.panelRecipes || [])) {
      const key = r.title
      if (seen.has(key)) continue; seen.add(key)
      recipes.push(`${r.title}: ${r.rows.map(x => `${x.label || '?'}(${x.type})`).join(', ')}`)
      if (recipes.length >= 12) break
    }

    const lines = []
    lines.push(`■ 학습된 작화 패턴 (과거 프로젝트 ${profiles.length}개에서 추출 — 새 작업도 이 방식을 따르세요)`)
    lines.push(`  · 태그 접두어: ${topPrefix || '(없음)'} / 자주 쓰는 그룹: ${topUtilities.join(', ') || '(없음)'}`)
    lines.push(`  · 표준 그룹박스: ${topGboxW || '-'}×${topGboxH || '-'}, 테두리 ${topBorder || '-'}, 값 글꼴 ${topValueFont || '-'}`)
    if (recipes.length) {
      lines.push(`  · 대표 패널 구성(설비 → 행):`)
      for (const r of recipes) lines.push(`    - ${r}`)
    }
    lines.push(`  ⚠ 유사 설비를 만들 땐 위 구성을 우선 재사용하세요.`)
    return { count: profiles.length, summary: lines.join('\n') }
  }

  return { capture, getProfile, getConfig, setConfig }
}
