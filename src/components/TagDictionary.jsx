import { Database, TrendingUp, TrendingDown, Minus, Settings2 } from 'lucide-react'
import { formatTagValue } from '../data/tags'

const TYPE_COLORS = { BIT: '#a78bfa', WORD: '#f59e0b', FLOAT: '#00d4ff' }

function StatusBadge({ value, type }) {
  if (type !== 'BIT') return null
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold"
      style={value === 1
        ? { background: '#14532d', color: '#22c55e', border: '1px solid #166534' }
        : { background: '#450a0a', color: '#ef4444', border: '1px solid #7f1d1d' }
      }
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: value === 1 ? '#22c55e' : '#ef4444',
                 boxShadow: `0 0 4px ${value === 1 ? '#22c55e' : '#ef4444'}` }}
      />
      {value === 1 ? 'ON' : 'OFF'}
    </span>
  )
}

function TrendIcon({ tagId, prevTags, currentTags }) {
  const cur  = currentTags.find(t => t.id === tagId)?.value
  const prev = prevTags?.find(t => t.id === tagId)?.value
  if (cur == null || prev == null || cur === prev) return <Minus size={10} className="text-[#4a5568]" />
  return cur > prev
    ? <TrendingUp  size={10} className="text-[#22c55e]" />
    : <TrendingDown size={10} className="text-[#ef4444]" />
}

export default function TagDictionary({ tags, updatedIds, onOpenRegistry }) {
  return (
    <div className="flex flex-col h-full border-t border-[#2d3748]">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#171e2b] border-b border-[#2d3748] flex-shrink-0">
        <Database size={12} className="text-[#a78bfa]" />
        <span className="text-[10px] font-bold text-[#a78bfa] tracking-widest uppercase">Tag Dictionary</span>
        <span className="ml-auto text-[9px] text-[#4a5568]">{tags.length} tags · 2.5s scan</span>
        {onOpenRegistry && (
          <button onClick={onOpenRegistry} title="태그 등록/편집"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] text-[#a78bfa] hover:bg-[#2d3748] transition-colors border border-[#2d3748]">
            <Settings2 size={10} /> 등록
          </button>
        )}
      </div>

      {/* 테이블 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-[#1a202c] sticky top-0 z-10">
              {['TAG ID', 'DEVICE', 'TYPE', 'DESC', 'VALUE', 'UNIT', '상태'].map(h => (
                <th key={h}
                  className="px-3 py-1.5 text-left text-[9px] font-bold text-[#4a5568] tracking-widest uppercase whitespace-nowrap"
                  style={{ borderBottom: '1px solid #2d3748' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tags.map((tag, i) => {
              const isUpdated = updatedIds.has(tag.id)
              const typeColor = TYPE_COLORS[tag.type] ?? '#94a3b8'
              return (
                <tr
                  key={tag.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('application/x-hmi-tag', tag.id)
                    e.dataTransfer.effectAllowed = 'link'
                  }}
                  className={`border-b border-[#1e2736] hover:bg-[#1e2736] transition-colors cursor-grab active:cursor-grabbing ${isUpdated ? 'value-updated' : ''}`}
                  style={{ background: i % 2 === 0 ? 'transparent' : '#161d2a' }}
                >
                  <td className="px-3 py-1.5 font-mono font-semibold text-[#4a9eff] whitespace-nowrap">
                    {tag.id}
                  </td>
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    {tag.device
                      ? <span className="text-[#94a3b8] font-mono text-[10px]">{tag.device}</span>
                      : <span className="text-[#4a5568]">—</span>}
                    {tag.utility && <span className="text-[8px] text-[#4a5568] ml-1">/{tag.utility}</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                      style={{ background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}44` }}
                    >
                      {tag.type}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[#94a3b8] whitespace-nowrap">{tag.desc}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className="font-mono font-bold"
                      style={{ color: isUpdated ? '#ffffff' : '#e2e8f0',
                               textShadow: isUpdated ? '0 0 8px #00d4ff' : 'none' }}
                    >
                      {tag.type === 'BIT' ? tag.value : formatTagValue(tag)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-[#4a5568] font-mono">{tag.unit || '—'}</td>
                  <td className="px-3 py-1.5">
                    {tag.type === 'BIT'
                      ? <StatusBadge value={tag.value} type={tag.type} />
                      : <div className="flex items-center gap-1 text-[#718096]">
                          <div
                            className="h-1 rounded-full bg-[#2d3748]"
                            style={{ width: 48 }}
                          >
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.round(((tag.value - tag.min) / (tag.max - tag.min)) * 100)}%`,
                                background: (() => {
                                  const p = (tag.value - tag.min) / (tag.max - tag.min)
                                  return p > 0.8 ? '#ef4444' : p > 0.6 ? '#f59e0b' : '#22c55e'
                                })(),
                              }}
                            />
                          </div>
                        </div>
                    }
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
