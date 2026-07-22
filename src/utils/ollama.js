// 로컬 Ollama 연동 (실행창 Gemma AI)
// 기본 엔드포인트: http://localhost:11434
export const OLLAMA_BASE =
  (typeof localStorage !== 'undefined' && localStorage.getItem('nexushmi.ollama.base')) ||
  'http://localhost:11434'

// 설치된 모델 목록 조회 (GET /api/tags)
export async function listOllamaModels() {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`)
  if (!res.ok) throw new Error(`Ollama ${res.status}`)
  const data = await res.json()
  return (data.models || []).map(m => m.name)
}

// 스트리밍 채팅 (POST /api/chat, stream=true → NDJSON)
// onDelta(텍스트조각) 콜백으로 토큰을 흘려보냄. 최종 전체 텍스트를 반환.
export async function chatOllamaStream({ model, messages, signal, onDelta }) {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`Ollama ${res.status} ${res.statusText}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        const obj = JSON.parse(line)
        if (obj.error) throw new Error(obj.error)
        const delta = obj.message?.content ?? ''
        if (delta) {
          full += delta
          onDelta?.(delta)
        }
      } catch (e) {
        // JSON 파싱 실패한 라인은 무시 (단, error 필드면 위에서 throw됨)
        if (e instanceof Error && e.message && !e.message.startsWith('Unexpected')) throw e
      }
    }
  }
  return full
}
