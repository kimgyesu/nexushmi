// 안전한 수식 평가기 — eval 없이 파서로 계산. 태그(변수) + 함수 + 조건 지원.
//   지원: + - * / % ^, 괄호, 비교(< > <= >= == !=), 논리(&& || !), 삼항(a ? b : c),
//         함수(abs sqrt round floor ceil min max pow log log10 exp sin cos tan sign),
//         상수(PI E), 변수(태그 ID)
//   용도: 계산 태그(파생값)의 실시간 계산 + 편집 시 미리보기.

const FUNCS = {
  abs: Math.abs, sqrt: Math.sqrt, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, pow: Math.pow, log: Math.log, log10: Math.log10, exp: Math.exp,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sign: Math.sign, trunc: Math.trunc,
}
const CONSTS = { PI: Math.PI, E: Math.E, TRUE: 1, FALSE: 0 }

// 토크나이저 (sticky 정규식으로 순차 매칭)
function tokenize(s) {
  const toks = []
  const re = /\s*(<=|>=|==|!=|&&|\|\||[0-9]*\.?[0-9]+|[A-Za-z_가-힣][A-Za-z0-9_가-힣]*|[-+*/%^(),?:<>!])/y
  let pos = 0
  while (pos < s.length) {
    re.lastIndex = pos
    const m = re.exec(s)
    if (!m) {
      if (s.slice(pos).trim() === '') break
      throw new Error(`문법 오류: '${s.slice(pos).trim()}'`)
    }
    toks.push(m[1])
    pos = re.lastIndex
  }
  return toks
}

// 수식 계산 — vars: { 태그ID: 숫자값 }
export function evalFormula(expr, vars = {}) {
  const toks = tokenize(String(expr || ''))
  if (!toks.length) throw new Error('빈 수식')
  let pos = 0
  const peek = () => toks[pos]
  const next = () => toks[pos++]
  const num = v => (typeof v === 'boolean' ? (v ? 1 : 0) : Number(v))
  const resolve = name => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return num(vars[name]) || 0
    const up = name.toUpperCase()
    if (up in CONSTS) return CONSTS[up]
    throw new Error(`알 수 없는 태그/상수: ${name}`)
  }

  const parseExpr = () => parseTernary()
  function parseTernary() {
    const c = parseOr()
    if (peek() === '?') { next(); const a = parseExpr(); if (next() !== ':') throw new Error("삼항에 ':' 필요"); const b = parseExpr(); return c ? a : b }
    return c
  }
  function parseOr() { let l = parseAnd(); while (peek() === '||') { next(); const r = parseAnd(); l = (l || r) ? 1 : 0 } return l }
  function parseAnd() { let l = parseCmp(); while (peek() === '&&') { next(); const r = parseCmp(); l = (l && r) ? 1 : 0 } return l }
  function parseCmp() {
    let l = parseAdd()
    while (['<', '>', '<=', '>=', '==', '!='].includes(peek())) {
      const op = next(), r = parseAdd()
      l = op === '<' ? (l < r ? 1 : 0) : op === '>' ? (l > r ? 1 : 0) : op === '<=' ? (l <= r ? 1 : 0)
        : op === '>=' ? (l >= r ? 1 : 0) : op === '==' ? (l === r ? 1 : 0) : (l !== r ? 1 : 0)
    }
    return l
  }
  function parseAdd() { let l = parseMul(); while (peek() === '+' || peek() === '-') { const op = next(), r = parseMul(); l = op === '+' ? l + r : l - r } return l }
  function parseMul() { let l = parseUnary(); while (peek() === '*' || peek() === '/' || peek() === '%') { const op = next(), r = parseUnary(); l = op === '*' ? l * r : op === '/' ? (r === 0 ? 0 : l / r) : (r === 0 ? 0 : l % r) } return l }
  function parseUnary() {
    if (peek() === '-') { next(); return -parseUnary() }
    if (peek() === '+') { next(); return parseUnary() }
    if (peek() === '!') { next(); return parseUnary() ? 0 : 1 }
    return parsePow()
  }
  function parsePow() { const b = parsePrimary(); if (peek() === '^') { next(); return Math.pow(b, parseUnary()) } return b }
  function parsePrimary() {
    const t = peek()
    if (t === undefined) throw new Error('수식이 완결되지 않음')
    if (t === '(') { next(); const e = parseExpr(); if (next() !== ')') throw new Error("')' 필요"); return e }
    if (/^[0-9.]/.test(t)) { next(); return parseFloat(t) }
    if (/^[A-Za-z_가-힣]/.test(t)) {
      next()
      if (peek() === '(') {   // 함수 호출
        next()
        const args = []
        if (peek() !== ')') { args.push(parseExpr()); while (peek() === ',') { next(); args.push(parseExpr()) } }
        if (next() !== ')') throw new Error("함수에 ')' 필요")
        const fn = FUNCS[t.toLowerCase()]
        if (!fn) throw new Error(`알 수 없는 함수: ${t}`)
        return fn(...args)
      }
      return resolve(t)
    }
    throw new Error(`예상치 못한 토큰: '${t}'`)
  }

  const result = parseExpr()
  if (pos < toks.length) throw new Error(`불필요한 토큰: ${toks.slice(pos).join(' ')}`)
  if (!Number.isFinite(result)) throw new Error('결과가 숫자가 아님')
  return result
}

// 안전 래퍼 — 에러 시 null + 메시지
export function tryFormula(expr, vars) {
  try { return { value: evalFormula(expr, vars), error: null } }
  catch (e) { return { value: null, error: e.message } }
}

// 수식이 참조하는 변수(태그ID) 목록 추출 — 의존성/검증용
export function formulaVars(expr) {
  let toks
  try { toks = tokenize(String(expr || '')) } catch { return [] }
  const names = new Set()
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]
    if (/^[A-Za-z_가-힣]/.test(t) && toks[i + 1] !== '(' && !(t.toUpperCase() in CONSTS)) names.add(t)
  }
  return [...names]
}
