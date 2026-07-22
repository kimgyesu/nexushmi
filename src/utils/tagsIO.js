// 엑셀(xlsx/csv) ↔ 태그 목록 변환 (SheetJS)
import * as XLSX from 'xlsx'
import { TAG_COLUMNS, makeTag } from '../data/tags'

const normalize = s => String(s ?? '').trim().toLowerCase().replace(/[\s_\-./]/g, '')

function columnKeyForHeader(header) {
  const n = normalize(header)
  for (const col of TAG_COLUMNS) {
    if (normalize(col.header) === n) return col.key
    if (col.aliases.some(a => normalize(a) === n)) return col.key
  }
  if (n === '그룹' || n === 'group') return 'utility'
  if (n === '입력모드' || n === 'inputmode' || n === '입력') return 'inputMode'
  return null
}

// ArrayBuffer(엑셀/CSV) → 태그 배열
export function parseTagsFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })

  const seen = new Map()
  for (const row of rows) {
    const mapped = {}
    for (const [header, val] of Object.entries(row)) {
      const key = columnKeyForHeader(header)
      if (key) mapped[key] = val
    }
    if (!String(mapped.id ?? '').trim() && !String(mapped.desc ?? '').trim()) continue
    const tag = makeTag(mapped)
    seen.set(tag.id, tag)
  }
  return Array.from(seen.values())
}

// UI와 동일한 컬럼 순서: 그룹,태그ID,설명,디바이스,주소,타입,단위,최소,최대,...
const COL_DEFS = [
  { key: 'utility',   header: '그룹',     width: 14 },
  { key: 'id',        header: '태그ID',   width: 24 },
  { key: 'desc',      header: '설명',     width: 22 },
  { key: 'device',    header: '디바이스', width: 14 },
  { key: 'address',   header: '주소',     width: 12 },
  { key: 'type',      header: '타입',     width: 10 },
  { key: 'unit',      header: '단위',     width: 10 },
  { key: 'min',       header: '최소',     width: 10 },
  { key: 'max',       header: '최대',     width: 10 },
  { key: 'value',     header: '초기값',   width: 12 },
]

const S_HEADER = {
  font:      { bold: true, color: { rgb: 'FFFFFF' } },
  fill:      { fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: {
    top:    { style: 'thin', color: { rgb: '3B82F6' } },
    bottom: { style: 'thin', color: { rgb: '3B82F6' } },
    left:   { style: 'thin', color: { rgb: '3B82F6' } },
    right:  { style: 'thin', color: { rgb: '3B82F6' } },
  },
}
const S_EVEN = {
  fill:      { fgColor: { rgb: 'EEF4FF' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: {
    top:    { style: 'thin', color: { rgb: 'C8D8F0' } },
    bottom: { style: 'thin', color: { rgb: 'C8D8F0' } },
    left:   { style: 'thin', color: { rgb: 'C8D8F0' } },
    right:  { style: 'thin', color: { rgb: 'C8D8F0' } },
  },
}
const S_ODD = {
  fill:      { fgColor: { rgb: 'FFFFFF' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: {
    top:    { style: 'thin', color: { rgb: 'C8D8F0' } },
    bottom: { style: 'thin', color: { rgb: 'C8D8F0' } },
    left:   { style: 'thin', color: { rgb: 'C8D8F0' } },
    right:  { style: 'thin', color: { rgb: 'C8D8F0' } },
  },
}

function setCell(ws, r, c, value, style) {
  const addr = XLSX.utils.encode_cell({ r, c })
  const isNum = typeof value === 'number'
  ws[addr] = { v: value, t: isNum ? 'n' : 's', s: style }
}

function buildFlatSheet(tags) {
  const ws = {}
  const colCount = COL_DEFS.length

  // 헤더 행
  COL_DEFS.forEach((col, c) => setCell(ws, 0, c, col.header, S_HEADER))

  // 데이터 행
  tags.forEach((tag, idx) => {
    const r = idx + 1
    const style = idx % 2 === 0 ? S_EVEN : S_ODD
    COL_DEFS.forEach((col, c) => {
      setCell(ws, r, c, tag[col.key] ?? '', style)
    })
  })

  const lastRow = tags.length
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: colCount - 1 } })
  ws['!cols'] = COL_DEFS.map(c => ({ wch: c.width }))

  // 자동 필터 (헤더 행에 필터 드롭다운)
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }) }

  return ws
}

function sortByGroup(tags) {
  return [...tags].sort((a, b) => {
    const ga = String(a.utility || '전역').toLowerCase()
    const gb = String(b.utility || '전역').toLowerCase()
    if (ga !== gb) return ga < gb ? -1 : 1
    return String(a.id).localeCompare(String(b.id))
  })
}

// 태그 배열 → 엑셀 파일 다운로드
export function exportTagsToExcel(tags, filename = 'tags.xlsx') {
  const source = tags.length
    ? sortByGroup(tags)
    : [makeTag({ id: 'TAG_EXAMPLE', desc: '예시 태그', device: 'PLC_01', utility: '설비A', address: 'D100', type: 'FLOAT', unit: 'A', min: 0, max: 100, value: 0 })]

  const ws = buildFlatSheet(source)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tags')
  XLSX.writeFile(wb, filename)
}

// 빈 템플릿(예시) 다운로드
export function exportTemplate(filename = 'tag_template.xlsx') {
  const samples = sortByGroup([
    makeTag({ id: 'TAG_FAN_RUN',    desc: '냉각팬 운전',       device: 'PLC_01',      utility: '냉각설비', address: 'M0.0',  type: 'BIT',   unit: '',    min: 0,  max: 1,    decimals: 0, digits: 0, value: 0,    inputMode: 'none' }),
    makeTag({ id: 'TAG_PUMP_SPEED', desc: '펌프 속도',         device: 'PLC_01',      utility: '냉각설비', address: 'D100',  type: 'WORD',  unit: 'RPM', min: 0,  max: 3600, decimals: 0, digits: 5, value: 1450, inputMode: 'numeric' }),
    makeTag({ id: 'TAG_PRESS_WORD', desc: '압력(소수점2자리)', device: 'PLC_01',      utility: '챔버',     address: 'D102',  type: 'WORD',  unit: 'kPa', min: 0,  max: 5000, decimals: 2, digits: 6, value: 245,  inputMode: 'numeric' }),
    makeTag({ id: 'TAG_TEMP_SV',    desc: '온도 설정값',       device: 'PLC_02',      utility: '챔버',     address: 'D202',  type: 'FLOAT', unit: '°C',  min: 20, max: 200,  decimals: 1, digits: 0, value: 80.0, inputMode: 'numeric' }),
    makeTag({ id: 'TAG_MOTOR_CURR', desc: '주모터 전류',       device: 'PLC_02',      utility: '주모터',   address: 'D200',  type: 'FLOAT', unit: 'A',   min: 0,  max: 30,   decimals: 2, digits: 0, value: 12.8, inputMode: 'none' }),
    makeTag({ id: 'TAG_VIRT_TEMP',  desc: '가상 온도 시뮬',    device: '__virtual__', utility: '가상',     address: '',      type: 'FLOAT', unit: '°C',  min: 0,  max: 150,  decimals: 1, digits: 0, value: 25.0, inputMode: 'none' }),
  ])

  const ws = buildFlatSheet(samples)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tags')
  XLSX.writeFile(wb, filename)
}



