// NexusHMI 로컬 서버 — 폴더 자동생성 + SQLite 이력 저장 + 프로젝트/내보내기 API
import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import Anthropic from '@anthropic-ai/sdk'
import { plc } from './protocols/plcManager.js'
import { modbus } from './protocols/modbusManager.js'
import { SerialTransport } from './protocols/serialTransport.js'
import { makeLearning } from './learning.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = process.env.NEXUSHMI_PORT || 3001

// Claude API (편집창 전용) — 키는 서버 환경변수에만 보관
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8'
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

// 데이터 루트: 기본 = 내 문서\NexusHMI  (환경변수로 변경 가능)
const DATA_DIR = process.env.NEXUSHMI_DATA || path.join(os.homedir(), 'Documents', 'NexusHMI')
const PROJECTS_DIR = path.join(DATA_DIR, 'projects')
const HISTORY_DIR = path.join(DATA_DIR, 'history')
const EXPORTS_DIR = path.join(DATA_DIR, 'exports')
const DB_PATH = path.join(HISTORY_DIR, 'history.db')

// ── 폴더 자동 생성 ──
for (const dir of [DATA_DIR, PROJECTS_DIR, HISTORY_DIR, EXPORTS_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}
console.log('[NexusHMI] 데이터 폴더:', DATA_DIR)

// ── 학습 라이브러리 (기본 vault = 데이터폴더\learning-vault; Drive/Obsidian 폴더로 변경 가능) ──
const learning = makeLearning(
  path.join(DATA_DIR, 'learning-config.json'),
  process.env.NEXUSHMI_VAULT || path.join(DATA_DIR, 'learning-vault'),
)
console.log('[NexusHMI] 학습 vault:', learning.getConfig().vaultDir)

// ── SQLite 초기화 ──
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.exec(`
  CREATE TABLE IF NOT EXISTS samples (
    ts      INTEGER NOT NULL,   -- epoch ms
    tag_id  TEXT    NOT NULL,
    value   REAL,
    device  TEXT,
    utility TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_samples_tag_ts ON samples (tag_id, ts);
  CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples (ts);

  CREATE TABLE IF NOT EXISTS events (
    ts      INTEGER NOT NULL,   -- epoch ms
    type    TEXT,               -- alarm | recover | operate | setpoint | system
    level   TEXT,               -- info | warn | alarm
    tag_id  TEXT,
    message TEXT,
    value   REAL
  );
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events (ts);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events (type);
`)
const insertSample = db.prepare('INSERT INTO samples (ts, tag_id, value, device, utility) VALUES (?, ?, ?, ?, ?)')
const insertMany = db.transaction((rows) => {
  for (const r of rows) insertSample.run(r.ts, r.tagId, r.value, r.device ?? '', r.utility ?? '')
})

const insertEvent = db.prepare('INSERT INTO events (ts, type, level, tag_id, message, value) VALUES (?, ?, ?, ?, ?, ?)')
const insertEvents = db.transaction((rows) => {
  for (const r of rows) insertEvent.run(r.ts ?? Date.now(), r.type ?? 'system', r.level ?? 'info', r.tagId ?? '', r.message ?? '', r.value ?? null)
})

// ── 앱 ──
const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' })) // 이미지 첨부(base64) 대응

// 상태
app.get('/api/health', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS n, MIN(ts) AS first, MAX(ts) AS last FROM samples').get()
  res.json({ ok: true, dataDir: DATA_DIR, dbPath: DB_PATH, sampleCount: row.n, firstTs: row.first, lastTs: row.last })
})

// 이력 적재 — body: { ts?, tags: [{id,value,device,utility,type}] }  또는  { samples:[{tagId,value,ts}] }
app.post('/api/history', (req, res) => {
  const now = Date.now()
  let rows = []
  if (Array.isArray(req.body?.samples)) {
    rows = req.body.samples.map(s => ({ ts: s.ts ?? now, tagId: s.tagId, value: Number(s.value), device: s.device, utility: s.utility }))
  } else if (Array.isArray(req.body?.tags)) {
    const ts = req.body.ts ?? now
    rows = req.body.tags
      .filter(t => t && t.id != null && t.value != null)
      .map(t => ({ ts, tagId: t.id, value: Number(t.value), device: t.device, utility: t.utility }))
  }
  rows = rows.filter(r => r.tagId && Number.isFinite(r.value))
  if (rows.length) insertMany(rows)
  res.json({ ok: true, inserted: rows.length })
})

// 이력 조회 — query: tagId(복수 ',' 구분), from, to(epoch ms), agg(raw|avg|min|max), bucket(ms)
app.get('/api/history', (req, res) => {
  const tagIds = String(req.query.tagId || '').split(',').map(s => s.trim()).filter(Boolean)
  const to = Number(req.query.to) || Date.now()
  const from = Number(req.query.from) || (to - 60 * 60 * 1000) // 기본 최근 1시간
  const agg = String(req.query.agg || 'raw')
  const bucket = Number(req.query.bucket) || 0

  if (tagIds.length === 0) return res.json({ series: [] })
  const placeholders = tagIds.map(() => '?').join(',')

  const series = tagIds.map(tag => {
    let rows
    if ((agg === 'avg' || agg === 'min' || agg === 'max') && bucket > 0) {
      const fn = agg.toUpperCase()
      rows = db.prepare(
        `SELECT (ts / ?)*? AS t, ${fn}(value) AS v
         FROM samples WHERE tag_id = ? AND ts BETWEEN ? AND ?
         GROUP BY ts / ? ORDER BY t`
      ).all(bucket, bucket, tag, from, to, bucket)
    } else {
      rows = db.prepare(
        `SELECT ts AS t, value AS v FROM samples
         WHERE tag_id = ? AND ts BETWEEN ? AND ? ORDER BY ts`
      ).all(tag, from, to)
    }
    return { tagId: tag, points: rows }
  })

  // 요약(평균/최소/최대/개수)
  const summaryRows = db.prepare(
    `SELECT tag_id AS tagId, COUNT(*) AS count, AVG(value) AS avg, MIN(value) AS min, MAX(value) AS max
     FROM samples WHERE tag_id IN (${placeholders}) AND ts BETWEEN ? AND ? GROUP BY tag_id`
  ).all(...tagIds, from, to)

  res.json({ from, to, agg, bucket, series, summary: summaryRows })
})

// ── 이벤트/알람 로그 ──
// 기록 — body: { events:[{ts,type,level,tagId,message,value}] } 또는 단일 객체
app.post('/api/events', (req, res) => {
  const body = req.body || {}
  const rows = Array.isArray(body.events) ? body.events : [body]
  const valid = rows.filter(r => r && (r.message || r.tagId))
  if (valid.length) insertEvents(valid)
  res.json({ ok: true, inserted: valid.length })
})

// 검색 — query: from, to, type, level, tagId, q(메시지 검색), limit
app.get('/api/events', (req, res) => {
  const to = Number(req.query.to) || Date.now()
  const from = Number(req.query.from) || (to - 24 * 60 * 60 * 1000)
  const limit = Math.min(Number(req.query.limit) || 500, 5000)
  const where = ['ts BETWEEN ? AND ?']
  const args = [from, to]
  if (req.query.type) { where.push('type = ?'); args.push(String(req.query.type)) }
  if (req.query.level) { where.push('level = ?'); args.push(String(req.query.level)) }
  if (req.query.tagId) { where.push('tag_id = ?'); args.push(String(req.query.tagId)) }
  if (req.query.q) { where.push('(message LIKE ? OR tag_id LIKE ?)'); args.push(`%${req.query.q}%`, `%${req.query.q}%`) }
  const rows = db.prepare(
    `SELECT ts, type, level, tag_id AS tagId, message, value FROM events
     WHERE ${where.join(' AND ')} ORDER BY ts DESC LIMIT ?`
  ).all(...args, limit)
  // 요약(타입별 개수)
  const counts = db.prepare(
    `SELECT type, COUNT(*) AS n FROM events WHERE ${where.join(' AND ')} GROUP BY type`
  ).all(...args)
  res.json({ from, to, events: rows, counts })
})

// 이력에 존재하는 태그 목록
app.get('/api/history/tags', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT tag_id AS tagId, device, utility FROM samples ORDER BY tag_id').all()
  res.json({ tags: rows })
})

// CSV 내보내기 — query: tagId, from, to → exports 폴더에 저장 + 파일 반환
app.get('/api/export.csv', (req, res) => {
  const tagIds = String(req.query.tagId || '').split(',').map(s => s.trim()).filter(Boolean)
  const to = Number(req.query.to) || Date.now()
  const from = Number(req.query.from) || (to - 24 * 60 * 60 * 1000)
  let rows
  if (tagIds.length) {
    const ph = tagIds.map(() => '?').join(',')
    rows = db.prepare(`SELECT ts, tag_id, value, device, utility FROM samples WHERE tag_id IN (${ph}) AND ts BETWEEN ? AND ? ORDER BY ts`).all(...tagIds, from, to)
  } else {
    rows = db.prepare('SELECT ts, tag_id, value, device, utility FROM samples WHERE ts BETWEEN ? AND ? ORDER BY ts').all(from, to)
  }
  const header = 'timestamp,tagId,value,device,utility\n'
  const body = rows.map(r =>
    `${new Date(r.ts).toISOString()},${r.tag_id},${r.value},${r.device ?? ''},${r.utility ?? ''}`
  ).join('\n')
  const csv = header + body
  const fname = `history_${new Date(from).toISOString().slice(0, 10)}_${Date.now()}.csv`
  try { fs.writeFileSync(path.join(EXPORTS_DIR, fname), csv, 'utf8') } catch { /* ignore */ }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`)
  res.send(csv)
})

// 프로젝트 저장 — body: { name, ...project }
app.post('/api/project', (req, res) => {
  const p = req.body || {}
  const name = String(p.name || 'untitled').replace(/[^\w가-힣\- ]/g, '_').trim() || 'untitled'
  const file = path.join(PROJECTS_DIR, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(p, null, 2), 'utf8')
  fs.writeFileSync(path.join(DATA_DIR, 'current.json'), JSON.stringify(p, null, 2), 'utf8')
  res.json({ ok: true, file })
})

// 프로젝트 불러오기 — query: name (없으면 current)
app.get('/api/project', (req, res) => {
  const name = req.query.name ? String(req.query.name) : null
  const file = name ? path.join(PROJECTS_DIR, `${name}.json`) : path.join(DATA_DIR, 'current.json')
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: 'not found' })
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')))
})

// 프로젝트 목록
app.get('/api/projects', (req, res) => {
  const files = fs.existsSync(PROJECTS_DIR) ? fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith('.json')) : []
  res.json({ projects: files.map(f => f.replace(/\.json$/, '')) })
})

// ── 학습 라이브러리 ──
// 빌드 시 캡처 — body: { project, thumbnailSvg? }
app.post('/api/learning/capture', (req, res) => {
  try {
    const { project, thumbnailSvg } = req.body || {}
    if (!project) return res.status(400).json({ ok: false, error: 'project 필요' })
    res.json(learning.capture(project, thumbnailSvg))
  } catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})
// AI 주입용 압축 프로파일
app.get('/api/learning/profile', (req, res) => {
  try { res.json({ ok: true, ...learning.getProfile() }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})
// vault 경로 설정/조회
app.get('/api/learning/config', (req, res) => res.json({ ok: true, ...learning.getConfig() }))
app.post('/api/learning/config', (req, res) => {
  try { res.json({ ok: true, ...learning.setConfig(req.body?.vaultDir) }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// ── Claude API 프록시 (편집창 전용) ──
app.get('/api/claude/health', (req, res) => {
  res.json({ ok: true, hasKey: !!anthropic, model: CLAUDE_MODEL })
})

// body: { system, messages, max_tokens }
app.post('/api/claude', async (req, res) => {
  if (!anthropic) {
    return res.status(400).json({ ok: false, error: 'ANTHROPIC_API_KEY가 서버에 설정되지 않았습니다. 환경변수를 설정한 뒤 서버를 다시 실행하세요.' })
  }
  const { system, messages, max_tokens } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: 'messages가 필요합니다.' })
  }
  try {
    // 이미지 포함 여부 확인 — image 블록이 있으면 cache_control 사용 불가
    const hasImage = messages.some(m =>
      Array.isArray(m.content) && m.content.some(b => b.type === 'image')
    )
    const systemBlock = system
      ? [{ type: 'text', text: system, ...(hasImage ? {} : { cache_control: { type: 'ephemeral' } }) }]
      : undefined

    const msg = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: Math.min(Number(max_tokens) || 8192, 8192),
      system: systemBlock,
      messages,
    })
    const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
    const usage = msg.usage || {}
    res.json({ ok: true, text, usage, model: msg.model,
      stop_reason: msg.stop_reason,
      cached: (usage.cache_read_input_tokens || 0) > 0 })
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message || String(err), type: err?.type })
  }
})

// ── PLC 통신 (LS XGT Cnet 전용 / Modbus RTU) ──
//   protocol: 'xgt'(기본, LS 전용) | 'modbus'(LS Cnet Modbus 슬레이브 등)
const MANAGERS = { xgt: plc, modbus }
let active = plc   // 현재 활성 매니저

// 시리얼 포트 목록 (칩셋 자동 식별)
app.get('/api/plc/ports', async (req, res) => {
  try { res.json({ ok: true, ports: await SerialTransport.listPorts() }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.get('/api/plc/status', (req, res) => res.json({ ok: true, ...active.status() }))

app.post('/api/plc/connect', async (req, res) => {
  try {
    const protocol = req.body?.protocol === 'modbus' ? 'modbus' : 'xgt'
    // 다른 매니저는 끊고 활성 전환
    for (const k of Object.keys(MANAGERS)) if (MANAGERS[k] !== MANAGERS[protocol]) { try { await MANAGERS[k].disconnect() } catch { /* ignore */ } }
    active = MANAGERS[protocol]
    await active.connect(req.body || {})
    res.json({ ok: true, protocol, ...active.status() })
  } catch (e) { res.status(500).json({ ok: false, error: e.message, ...active.status() }) }
})

app.post('/api/plc/disconnect', async (req, res) => {
  await active.disconnect(); res.json({ ok: true, ...active.status() })
})

// Modbus 자동 스캔 — body: { path, bauds?, stationFrom?, stationTo?, testAddr?, parity? }
app.post('/api/plc/scan', async (req, res) => {
  try { res.json({ ok: true, ...(await modbus.scan(req.body || {})) }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// 폴링 대상 등록 (태그 주소 목록)
app.post('/api/plc/poll', (req, res) => {
  active.setPollDevices(req.body?.devices || [])
  res.json({ ok: true, pollDevices: active.pollDevices })
})

// 즉시 읽기
app.post('/api/plc/read', async (req, res) => {
  try { res.json({ ok: true, values: await active.read(req.body?.devices || []) }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

// 쓰기 (스위치/설정값) — body: { device, value, type }
app.post('/api/plc/write', async (req, res) => {
  try { await active.write(req.body.device, req.body.value, req.body.type || 'WORD'); res.json({ ok: true }) }
  catch (e) { res.status(500).json({ ok: false, error: e.message }) }
})

app.listen(PORT, () => {
  console.log(`[NexusHMI] 로컬 서버 실행 → http://localhost:${PORT}`)
  console.log(`[NexusHMI] SQLite 이력 DB → ${DB_PATH}`)
  console.log(`[NexusHMI] Claude API: ${anthropic ? CLAUDE_MODEL + ' (키 설정됨)' : '키 미설정 (ANTHROPIC_API_KEY 필요)'}`)
})
