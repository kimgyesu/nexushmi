// 자연어 질의 → 차트 스펙(태그/기간/집계) 해석
const CHART_RE = /그래프|차트|추세|트렌드|graph|chart|trend|plot/i

// 태그 매칭에서 제외할 흔한 단어
const STOP = new Set([
  '그래프', '그래프로', '차트', '추세', '트렌드', '보여줘', '보여', '줘', '및', '의', '를', '을',
  '은', '는', '이', '가', '과', '와', '에', '평균', '최대', '최소', '값', '데이터', '데이타',
  '최근', '지난', '오늘', 'graph', 'chart', 'trend', 'plot', 'show', 'the', 'for', 'of', 'avg',
])

export function isChartQuery(text) {
  return CHART_RE.test(text)
}

const EXPORT_RE = /엑셀|csv|excel|내보내|다운로드|download|파일로|저장해/i
export function isExportQuery(text) {
  return EXPORT_RE.test(text)
}

const REPORT_RE = /보고서|리포트|report|운전일지|일지|일보/i
export function isReportQuery(text) {
  return REPORT_RE.test(text)
}

const LOG_RE = /로그|이벤트|기록(을|를|\s)?(검색|조회|찾|보여)|알람.*(조회|검색|찾|있었|이력|내역|기록)|이력.*(조회|검색)|무슨\s*일|언제.*(켜|껐|꺼|끄|on|off|작동|운전|정지|바뀌|눌)|몇\s*시.*(켜|껐|꺼|on|off|작동|운전|정지)|(켜졌|껐|꺼졌|눌).*(언제|몇\s*시|시간|기록)/i
export function isLogQuery(text) {
  return LOG_RE.test(text)
}

function keywords(text) {
  return text.toLowerCase()
    .split(/[\s,./()[\]]+/)
    .map(s => s.trim())
    .filter(s => s && !STOP.has(s))
}

// 기간(ms) 해석. 기본 30분.
export function parseWindowMs(text) {
  const m = text.match(/(\d+)\s*(분|시간|일|min|mins|minute|minutes|hour|hours|day|days)/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (/분|min/i.test(m[2])) return n * 60 * 1000
    if (/시간|hour/i.test(m[2])) return n * 60 * 60 * 1000
    if (/일|day/i.test(m[2])) return n * 24 * 60 * 60 * 1000
  }
  return 30 * 60 * 1000
}

// text + 현재 태그목록 → { tagIds, picked, agg, windowMs }
export function resolveChartQuery(text, tags) {
  const ks = keywords(text)
  const scored = tags.map(t => {
    const hay = `${t.id} ${t.desc} ${t.device} ${t.utility} ${t.unit}`.toLowerCase()
    let score = 0
    for (const k of ks) if (hay.includes(k)) score++
    return { t, score }
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)

  const picked = scored.slice(0, 4).map(x => x.t)
  const agg = /최대|max/i.test(text) ? 'max' : /최소|min/i.test(text) ? 'min' : 'avg'
  const windowMs = parseWindowMs(text)
  return { tagIds: picked.map(t => t.id), picked, agg, windowMs }
}
