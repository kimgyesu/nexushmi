import { useState, useRef, useEffect } from 'react'
import { Bot, Send, User, Cpu, AlertTriangle, CheckCircle } from 'lucide-react'

const INITIAL_MESSAGES = [
  {
    id: 1,
    role: 'assistant',
    text: '안녕하세요! NexusAI입니다.\n현재 플랜트 A 라인 1 모니터링 중입니다. 태그 조회, 알람 분석, 이상 진단 등을 도와드릴게요.',
    time: new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }),
  },
  {
    id: 2,
    role: 'assistant',
    text: '💡 TAG_CHAMBER_PRESS 값이 정상 범위(0.5~3.0 MPa) 내에서 동작 중입니다.',
    time: new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }),
    type: 'info',
  },
]

const SAMPLE_RESPONSES = [
  '현재 모든 태그가 정상 범위 내에서 동작하고 있습니다. TAG_MOTOR_CURR가 약간 상승 추세를 보이고 있으니 주의하세요.',
  'TAG_CHAMBER_PRESS의 최근 5분 평균: 2.48 MPa. 상한 알람(4.5 MPa)까지 여유가 있습니다.',
  'TAG_VIBRATION이 0.1~0.15mm/s 범위에서 안정적입니다. 베어링 상태 양호.',
  '냉각팬(TAG_FAN_RUN) 운전 상태 확인됨. 챔버 온도 정상 제어 중.',
  'TAG_PUMP_SPEED 기준값(1450 RPM) 대비 현재 ±5% 이내. 정상입니다.',
]

let responseIdx = 0

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* 아바타 */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={isUser
          ? { background: '#1e40af', border: '1px solid #3b82f6' }
          : { background: '#312e81', border: '1px solid #6366f1' }
        }
      >
        {isUser ? <User size={11} className="text-[#93c5fd]" /> : <Bot size={11} className="text-[#a78bfa]" />}
      </div>

      {/* 말풍선 */}
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        <div
          className="px-3 py-2 rounded-lg text-[11px] leading-relaxed whitespace-pre-wrap"
          style={isUser
            ? { background: '#1e3a5f', border: '1px solid #1e40af', color: '#bfdbfe' }
            : msg.type === 'info'
            ? { background: '#1a2744', border: '1px solid #1e3a8a', color: '#94a3b8' }
            : { background: '#1e1b4b', border: '1px solid #312e81', color: '#c4b5fd' }
          }
        >
          {msg.text}
        </div>
        <span className="text-[9px] text-[#4a5568] px-1">{msg.time}</span>
      </div>
    </div>
  )
}

export default function AiAssistant({ tags }) {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping])

  function handleSend() {
    const text = input.trim()
    if (!text) return

    const userMsg = {
      id: Date.now(),
      role: 'user',
      text,
      time: new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsTyping(true)

    // 시뮬레이션 응답 (1~1.8s 딜레이)
    const delay = 800 + Math.random() * 1000
    const timer = setTimeout(() => {
      const aiMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        text: SAMPLE_RESPONSES[responseIdx % SAMPLE_RESPONSES.length],
        time: new Date().toLocaleTimeString('ko', { hour: '2-digit', minute: '2-digit' }),
      }
      responseIdx++
      setMessages(prev => [...prev, aiMsg])
      setIsTyping(false)
    }, delay)

    return () => clearTimeout(timer)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <aside
      className="flex flex-col h-full bg-[#0f1520] border-l border-[#2d3748]"
      style={{ width: 320 }}
    >
      {/* 헤더 */}
      <div className="px-4 py-3 border-b border-[#2d3748] flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#312e81] border border-[#6366f1] flex items-center justify-center">
            <Cpu size={14} className="text-[#a78bfa]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[12px] font-bold text-[#e2e8f0]">NexusAI Assistant</p>
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#1e3a5f] text-[#60a5fa] border border-[#1e40af]">
                LOCAL
              </span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"
                    style={{ boxShadow: '0 0 4px #22c55e' }} />
              <p className="text-[9px] text-[#4a5568]">모델 로컬 실행 · 프라이빗</p>
            </div>
          </div>
        </div>

        {/* 실시간 태그 요약 */}
        <div className="mt-2 grid grid-cols-2 gap-1">
          {tags.slice(0, 4).map(tag => (
            <div key={tag.id}
              className="px-2 py-1 rounded bg-[#1a202c] border border-[#2d3748] flex justify-between items-center">
              <span className="text-[8px] text-[#4a5568] truncate">{tag.id.replace('TAG_', '')}</span>
              <span className="text-[9px] font-mono text-[#00d4ff] ml-1">
                {tag.type === 'BIT'
                  ? (tag.value ? 'ON' : 'OFF')
                  : tag.type === 'FLOAT'
                  ? tag.value.toFixed(1)
                  : tag.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 채팅 영역 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map(msg => (
          <ChatMessage key={msg.id} msg={msg} />
        ))}

        {/* 타이핑 인디케이터 */}
        {isTyping && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#312e81] border border-[#6366f1] flex-shrink-0">
              <Bot size={11} className="text-[#a78bfa]" />
            </div>
            <div className="px-3 py-2 rounded-lg bg-[#1e1b4b] border border-[#312e81]">
              <div className="flex gap-1 items-center h-3">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#a78bfa]"
                    style={{
                      animation: 'bounce 1.2s infinite',
                      animationDelay: `${i * 0.2}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 빠른 명령어 */}
      <div className="px-3 py-2 border-t border-[#1a202c] flex gap-1.5 overflow-x-auto flex-shrink-0">
        {['알람 조회', '태그 상태', '진단 실행'].map(cmd => (
          <button
            key={cmd}
            onClick={() => setInput(cmd)}
            className="px-2 py-1 rounded text-[9px] text-[#718096] border border-[#2d3748] hover:border-[#4a5568] hover:text-[#e2e8f0] transition-all whitespace-nowrap flex-shrink-0"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* 입력창 */}
      <div className="px-3 py-3 border-t border-[#2d3748] flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="태그 조회, 알람 분석, 진단..."
            rows={2}
            className="flex-1 bg-[#1a202c] border border-[#2d3748] rounded-lg px-3 py-2 text-[11px] text-[#e2e8f0] placeholder-[#4a5568] resize-none focus:outline-none focus:border-[#6366f1] transition-colors"
            style={{ minHeight: 52 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
            style={input.trim() && !isTyping
              ? { background: '#4f46e5', border: '1px solid #6366f1', color: '#fff',
                  boxShadow: '0 0 8px #6366f144' }
              : { background: '#1a202c', border: '1px solid #2d3748', color: '#4a5568' }
            }
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[8px] text-[#2d3748] mt-1 text-center">
          Enter로 전송 · Shift+Enter 줄바꿈
        </p>
      </div>
    </aside>
  )
}
