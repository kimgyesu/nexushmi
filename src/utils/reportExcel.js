// 범용 보고서(report) → 서식 있는 엑셀(.xlsx) — 요약/급변원인/데이터/장비이력 (PPT 수준)
// report = { title, subtitle, series:[{name,unit,data,decimals,fmt,spikes,role}], env, events, usage, aiText }
import XLSX from 'xlsx-js-style'
import { fmtHM } from './analysisReport'
import { classifyTags, findSetpointFor } from '../data/tagRoles'

const num = v => (v == null || Number.isNaN(Number(v)) ? '' : Math.round(Number(v) * 10) / 10)
const stamp = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}` }

const C = {
  brand: '0F5132', brand2: '15803D', head2: '334155', section: '0F766E', zebra: 'F1F5F9',
  kpiBg: 'F8FAFC', line: 'CBD5E1', ink: '1F2937', sub: '64748B', white: 'FFFFFF', mint: 'D1FAE5',
  up: 'B91C1C', down: '1D4ED8', onBg: 'DCFCE7', onTx: '166534', offBg: 'F1F5F9', offTx: '94A3B8',
}
const FN = '맑은 고딕'
const font = (o = {}) => ({ name: FN, sz: 10, color: { rgb: C.ink }, ...o })
const fill = rgb => ({ patternType: 'solid', fgColor: { rgb } })
const thin = c => ({ style: 'thin', color: { rgb: c } })
const boxb = c => ({ top: thin(c), bottom: thin(c), left: thin(c), right: thin(c) })
const mid = { vertical: 'center' }
const S = {
  title: { font: font({ sz: 16, bold: true, color: { rgb: C.white } }), fill: fill(C.brand), alignment: { horizontal: 'left', ...mid } },
  sub: { font: font({ sz: 10, bold: true, color: { rgb: C.mint } }), fill: fill(C.brand2), alignment: { horizontal: 'left', ...mid } },
  meta: { font: font({ sz: 9, color: { rgb: C.sub } }), alignment: { horizontal: 'left', ...mid } },
  section: { font: font({ sz: 11, bold: true, color: { rgb: C.white } }), fill: fill(C.section), alignment: { horizontal: 'left', ...mid } },
  th: { font: font({ sz: 10, bold: true, color: { rgb: C.white } }), fill: fill(C.head2), alignment: { horizontal: 'center', wrapText: true, ...mid }, border: boxb(C.head2) },
  td: { font: font(), alignment: { horizontal: 'left', ...mid }, border: boxb(C.line) },
  tdC: { font: font(), alignment: { horizontal: 'center', ...mid }, border: boxb(C.line) },
  kLabel: { font: font({ bold: true }), fill: fill(C.kpiBg), alignment: { horizontal: 'left', ...mid }, border: boxb(C.line) },
  kVal: { font: font({ sz: 13, bold: true, color: { rgb: C.brand2 } }), alignment: { horizontal: 'right', ...mid }, border: boxb(C.line), numFmt: '#,##0.0' },
  ai: { font: font({ sz: 10, color: { rgb: C.ink } }), alignment: { horizontal: 'left', vertical: 'top', wrapText: true }, border: boxb(C.line), fill: fill('FCFEFC') },
}
const nStyle = (fmt, extra = {}) => ({ font: font(), alignment: { horizontal: 'right', ...mid }, border: boxb(C.line), numFmt: fmt, ...extra })

const A = (r, c) => XLSX.utils.encode_cell({ r, c })
const put = (ws, r, c, v, s) => { const a = A(r, c); ws[a] = { t: typeof v === 'number' ? 'n' : 's', v: v ?? '' }; if (s) ws[a].s = s; return a }
const styleRow = (ws, r, c0, c1, s) => { for (let c = c0; c <= c1; c++) { const a = A(r, c); if (!ws[a]) ws[a] = { t: 's', v: '' }; ws[a].s = s } }
const merge = (ws, r0, c0, r1, c1) => { (ws['!merges'] = ws['!merges'] || []).push({ s: { r: r0, c: c0 }, e: { r: r1, c: c1 } }) }
const zebra = (s, i) => (i % 2 ? { ...s, fill: fill(C.zebra) } : s)
function banner(ws, cols, title, sub, meta) {
  styleRow(ws, 0, 0, cols - 1, S.title); put(ws, 0, 0, title, S.title); merge(ws, 0, 0, 0, cols - 1)
  styleRow(ws, 1, 0, cols - 1, S.sub); put(ws, 1, 0, sub, S.sub); merge(ws, 1, 0, 1, cols - 1)
  styleRow(ws, 2, 0, cols - 1, S.meta); put(ws, 2, 0, meta, S.meta); merge(ws, 2, 0, 2, cols - 1)
  ws['!rows'] = ws['!rows'] || []; ws['!rows'][0] = { hpt: 28 }; ws['!rows'][1] = { hpt: 18 }; ws['!rows'][2] = { hpt: 16 }
  return 4
}
const sectionBar = (ws, r, cols, text) => { styleRow(ws, r, 0, cols - 1, S.section); put(ws, r, 0, `　${text}`, S.section); merge(ws, r, 0, r, cols - 1); ws['!rows'][r] = { hpt: 20 } }
const add = (wb, name, ws) => XLSX.utils.book_append_sheet(wb, ws, name)

export function exportReportToExcel(report, filename = '분석보고서.xlsx') {
  const cols = [...(report.series || []), ...(report.env || [])] // 데이터 컬럼(pv+power+env)
  const base = cols.reduce((a, b) => (b.data?.length > (a?.data?.length || 0) ? b : a), null) || { data: [] }
  const events = report.events || []
  const usage = report.usage
  const allSpikes = (report.series || []).flatMap(s => (s.spikes || []).map(sp => ({ ...sp, name: s.name, unit: s.unit })))
  const wb = XLSX.utils.book_new()
  const created = stamp(Date.now())

  /* 1) 요약 */
  {
    const ws = {}; const COLS = 4
    let r = banner(ws, COLS, `${report.title || '분석 보고서'}`, report.subtitle || 'NexusHMI 운전 분석 리포트', `생성 시각 : ${created}    ·    ${base.data.length} 행`)
    if (usage) {
      sectionBar(ws, r++, COLS, '에너지 · 사용량 요약')
      const th = ['항목', '값', '단위', '비고']; th.forEach((t, c) => put(ws, r, c, t, S.th)); ws['!rows'][r] = { hpt: 18 }; r++
      const kpi = [
        ['주간 평균', num(usage.dayAvg), usage.unit, '06:00 ~ 18:00'],
        ['야간 평균', num(usage.nightAvg), usage.unit, '18:00 ~ 06:00'],
        ['최대', num(usage.peak?.v), usage.unit, usage.peak ? fmtHM(usage.peak.t) : ''],
        ['추정 사용량', num(usage.kwh), 'kWh', '평균 × 24h'],
      ]
      for (const [k, v, u, note] of kpi) { put(ws, r, 0, k, S.kLabel); put(ws, r, 1, v, S.kVal); put(ws, r, 2, u, S.tdC); put(ws, r, 3, note, S.td); ws['!rows'][r] = { hpt: 19 }; r++ }
      r++
    }
    if (report.aiText) {
      sectionBar(ws, r++, COLS, 'AI 코멘트')
      styleRow(ws, r, 0, COLS - 1, S.ai); put(ws, r, 0, String(report.aiText), S.ai); merge(ws, r, 0, r + 5, COLS - 1); ws['!rows'][r] = { hpt: 96 }; r += 6
    }
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 20 }]
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 2, c: COLS - 1 } })
    add(wb, '요약', ws)
  }

  /* 2) 급변원인 */
  {
    const ws = {}; const COLS = 7
    let r = banner(ws, COLS, '급변 구간 · 원인 추적', '변화량이 큰 구간과 근접 장비 이벤트 매칭', `생성 시각 : ${created}`)
    const th = ['구간 시작', '구간 끝', '변수', '시작값', '종료값', '변화량', '추정 원인']
    th.forEach((t, c) => put(ws, r, c, t, S.th)); ws['!rows'][r] = { hpt: 18 }; r++
    const sorted = allSpikes.sort((a, b) => a.t0 - b.t0)
    if (!sorted.length) { put(ws, r, 0, '급변 구간 없음', S.td); for (let c = 1; c < COLS; c++) put(ws, r, c, '', S.td); r++ }
    else sorted.forEach((s, i) => {
      const dz = { ...zebra(nStyle('+#,##0.0;-#,##0.0'), i), font: font({ bold: true, color: { rgb: Number(s.d) >= 0 ? C.up : C.down } }) }
      put(ws, r, 0, s.hm0, zebra(S.tdC, i)); put(ws, r, 1, s.hm1, zebra(S.tdC, i)); put(ws, r, 2, s.name || '', zebra(S.tdC, i))
      put(ws, r, 3, num(s.from), zebra(nStyle('#,##0.0'), i)); put(ws, r, 4, num(s.to), zebra(nStyle('#,##0.0'), i))
      put(ws, r, 5, num(s.d), dz); put(ws, r, 6, s.cause || '', zebra(S.td, i)); ws['!rows'][r] = { hpt: 17 }; r++
    })
    ws['!cols'] = [{ wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 34 }]
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 6), c: COLS - 1 } })
    add(wb, '급변원인', ws)
  }

  /* 3) 데이터 (동적 컬럼) */
  {
    const ws = {}; const COLS = cols.length + 1
    let r = banner(ws, COLS, '데이터', cols.map(s => `${s.name}(${s.unit})`).join(' · '), `생성 시각 : ${created}    ·    ${base.data.length} 행`)
    put(ws, r, 0, '시각', S.th); cols.forEach((s, c) => put(ws, r, c + 1, `${s.name}(${s.unit})`, S.th)); ws['!rows'][r] = { hpt: 18 }
    ws['!freeze'] = { xSplit: 0, ySplit: r + 1, topLeftCell: A(r + 1, 0), activePane: 'bottomLeft', state: 'frozen' }
    r++
    for (let i = 0; i < base.data.length; i++) {
      put(ws, r, 0, stamp(base.data[i].t), zebra(S.tdC, i))
      cols.forEach((s, c) => put(ws, r, c + 1, num(s.data[i]?.v), zebra(nStyle(s.fmt || '0.0'), i)))
      r++
    }
    ws['!cols'] = [{ wch: 18 }, ...cols.map(() => ({ wch: 12 }))]
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: COLS - 1 } })
    add(wb, '데이터', ws)
  }

  /* 4) 장비 가동 이력 */
  {
    const ws = {}; const COLS = 3
    let r = banner(ws, COLS, '장비 가동 이력', '설비 ON/OFF 이벤트', `생성 시각 : ${created}    ·    ${events.length} 건`)
    const th = ['시각', '장비', '동작']; th.forEach((t, c) => put(ws, r, c, t, S.th)); ws['!rows'][r] = { hpt: 18 }; r++
    if (!events.length) { put(ws, r, 0, '가동 이력 없음', S.td); put(ws, r, 1, '', S.td); put(ws, r, 2, '', S.td); r++ }
    else events.forEach((e, i) => {
      const on = !!e.on
      const badge = { font: font({ bold: true, color: { rgb: on ? C.onTx : C.offTx } }), fill: fill(on ? C.onBg : C.offBg), alignment: { horizontal: 'center', ...mid }, border: boxb(C.line) }
      put(ws, r, 0, stamp(e.ts), zebra(S.tdC, i)); put(ws, r, 1, e.name, zebra(S.td, i)); put(ws, r, 2, on ? 'ON' : 'OFF', badge); ws['!rows'][r] = { hpt: 17 }; r++
    })
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 9 }]
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(r, 6), c: COLS - 1 } })
    add(wb, '장비이력', ws)
  }

  XLSX.writeFile(wb, filename)
}

/* ══════════ 현재 상태 스냅샷 → 엑셀 (프롬프트 + "엑셀로 보내줘") ══════════ */
const level = t => {
  const v = Number(t.value), min = t.min ?? 0, max = t.max ?? 100
  if (max <= min) return { txt: '정상', rgb: C.onTx, bg: C.onBg }
  const r = (v - min) / (max - min)
  if (r >= 0.95) return { txt: '경보', rgb: 'B91C1C', bg: 'FEE2E2' }
  if (r >= 0.85) return { txt: '주의', rgb: 'B45309', bg: 'FEF3C7' }
  if (r <= 0.03) return { txt: '하한', rgb: 'B45309', bg: 'FEF3C7' }
  return { txt: '정상', rgb: C.onTx, bg: C.onBg }
}
const fmtOf = t => ((Number(t?.decimals) || 0) > 0 ? '0.' + '0'.repeat(Number(t.decimals)) : '0')

export function exportStateToExcel(tags, { title = '현재 운전 상태', aiText = '', request = '', filename } = {}) {
  const { pv, setpoint, equipment, power, env } = classifyTags(tags)
  const wb = XLSX.utils.book_new()
  const created = stamp(Date.now())
  const ws = {}; const COLS = 6
  let r = banner(ws, COLS, title, request ? `요청 : ${request}` : '현재 운전 상태 스냅샷', `생성 시각 : ${created}    ·    ${tags.length} 태그`)
  const thRow = labels => { labels.forEach((t, c) => put(ws, r, c, t, S.th)); for (let c = labels.length; c < COLS; c++) put(ws, r, c, '', S.th); ws['!rows'][r] = { hpt: 18 }; r++ }
  const blanks = (from, i) => { for (let c = from; c < COLS; c++) put(ws, r, c, '', zebra(S.td, i)) }

  if (pv.length) {
    sectionBar(ws, r++, COLS, '공정 변수 (측정값)')
    thRow(['태그', '설명', '현재값', '단위', '설정값', '수준'])
    pv.forEach((t, i) => {
      const lv = level(t), sp = findSetpointFor(t, setpoint)
      put(ws, r, 0, t.id, zebra(S.tdC, i)); put(ws, r, 1, t.desc || '', zebra(S.td, i))
      put(ws, r, 2, Number(t.value), zebra(nStyle(fmtOf(t)), i)); put(ws, r, 3, t.unit || '', zebra(S.tdC, i))
      put(ws, r, 4, sp ? Number(sp.value) : '', zebra(nStyle(fmtOf(sp || t)), i))
      put(ws, r, 5, lv.txt, { ...zebra(S.tdC, i), font: font({ bold: true, color: { rgb: lv.rgb } }), fill: fill(lv.bg) })
      ws['!rows'][r] = { hpt: 17 }; r++
    })
    r++
  }
  if (equipment.length) {
    sectionBar(ws, r++, COLS, '설비 상태 (ON/OFF)')
    thRow(['태그', '설명', '상태'])
    equipment.forEach((t, i) => {
      const on = !!Number(t.value)
      put(ws, r, 0, t.id, zebra(S.tdC, i)); put(ws, r, 1, t.desc || '', zebra(S.td, i))
      put(ws, r, 2, on ? 'ON' : 'OFF', { font: font({ bold: true, color: { rgb: on ? C.onTx : C.offTx } }), fill: fill(on ? C.onBg : C.offBg), alignment: { horizontal: 'center', ...mid }, border: boxb(C.line) })
      blanks(3, i); ws['!rows'][r] = { hpt: 17 }; r++
    })
    r++
  }
  if (setpoint.length) {
    sectionBar(ws, r++, COLS, '설정값 (SV)')
    thRow(['태그', '설명', '설정값', '단위'])
    setpoint.forEach((t, i) => { put(ws, r, 0, t.id, zebra(S.tdC, i)); put(ws, r, 1, t.desc || '', zebra(S.td, i)); put(ws, r, 2, Number(t.value), zebra(nStyle(fmtOf(t)), i)); put(ws, r, 3, t.unit || '', zebra(S.tdC, i)); blanks(4, i); ws['!rows'][r] = { hpt: 17 }; r++ })
    r++
  }
  const pe = [...power, ...env]
  if (pe.length) {
    sectionBar(ws, r++, COLS, '전력 · 외란')
    thRow(['태그', '설명', '현재값', '단위'])
    pe.forEach((t, i) => { put(ws, r, 0, t.id, zebra(S.tdC, i)); put(ws, r, 1, t.desc || '', zebra(S.td, i)); put(ws, r, 2, Number(t.value), zebra(nStyle(fmtOf(t)), i)); put(ws, r, 3, t.unit || '', zebra(S.tdC, i)); blanks(4, i); ws['!rows'][r] = { hpt: 17 }; r++ })
    r++
  }
  ws['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }]
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r + 2, c: COLS - 1 } })
  add(wb, '현재상태', ws)

  if (aiText) {
    const w2 = {}; const r2 = banner(w2, 3, 'AI 상태 요약', request ? `요청 : ${request}` : '', `생성 시각 : ${created}`)
    styleRow(w2, r2, 0, 2, S.ai); put(w2, r2, 0, String(aiText), S.ai); merge(w2, r2, 0, r2 + 16, 2); w2['!rows'][r2] = { hpt: 240 }
    w2['!cols'] = [{ wch: 46 }, { wch: 20 }, { wch: 20 }]
    w2['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r2 + 17, c: 2 } })
    add(wb, 'AI요약', w2)
  }
  XLSX.writeFile(wb, filename || `현재상태_${new Date().toISOString().slice(0, 10)}.xlsx`)
}
