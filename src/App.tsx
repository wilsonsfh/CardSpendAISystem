import { useState, useEffect, useCallback, useRef } from 'react'
import { queries, cards, KNOWN_CATEGORIES } from './data'
import { recommend } from './recommend'
import type { RecommendationResult, ReasoningMode } from './recommend'
import { getUpdateQueue, clearEventLog } from './engine/eventLogger'
import type { SpendEvent } from './engine/eventLogger'
import { suggestCategory } from './engine/llmSuggester'
import type { LLMSuggestion } from './engine/llmSuggester'
import './index.css'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REASONING_COLORS: Record<ReasoningMode, string> = {
  deterministic: '#059669',
  inferred:      '#D97706',
  missing_data:  '#DC2626',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high:   '#059669',
  medium: '#D97706',
  low:    '#DC2626',
}

const Tag = ({ label, color, bg }: { label: string; color: string; bg: string }) => (
  <span style={{
    fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px',
    borderRadius: '4px', background: bg, color, letterSpacing: '0.02em',
  }}>{label}</span>
)

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', fontSize: '0.82rem' }}>
    <span style={{ color: 'var(--color-text-muted)', minWidth: '110px', flexShrink: 0 }}>{label}</span>
    <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{value}</span>
  </div>
)

// ---------------------------------------------------------------------------
// App — single-page developer tool
// ---------------------------------------------------------------------------

const PRESETS = queries.map(q => ({
  merchant: q.merchant,
  amount:   String(q.amount),
  cards:    q.user_cards,
}))

const ALL_CARD_NAMES  = cards.map(c => c.card_name)
const KNOWN_CATS      = [...KNOWN_CATEGORIES].filter(c => c !== 'general')

export default function App() {
  const [merchant,   setMerchant]   = useState(PRESETS[0].merchant)
  const [amount,     setAmount]     = useState(PRESETS[0].amount)
  const [userCards,  setUserCards]  = useState<string[]>(PRESETS[0].cards)

  const [result,     setResult]     = useState<RecommendationResult | null>(null)
  const [queue,      setQueue]      = useState<SpendEvent[]>([])
  const [llmResult,  setLlmResult]  = useState<LLMSuggestion | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)

  // Update queue actions
  const [resolvedKeys,    setResolvedKeys]    = useState<Set<string>>(new Set())
  const [stagingFor,      setStagingFor]      = useState<string | null>(null)   // merchant name being staged
  const [stagingCategory, setStagingCategory] = useState('')

  const resolveKey = (e: SpendEvent) => `${e.merchant}||${e.updateType}`

  const markResolved = (e: SpendEvent) =>
    setResolvedKeys(prev => new Set([...prev, resolveKey(e)]))

  // Bottom panels height (legend + update queue combined)
  const [bottomHeight, setBottomHeight] = useState(280)  // Legend 80 + Queue 200
  const [isDraggingBottom, setIsDraggingBottom] = useState(false)
  const [dragStartY, setDragStartY] = useState(0)

  // Legend width dragging (using refs for responsive drag handling)
  const [legendWidth, setLegendWidth] = useState(580)
  const [isDraggingLegendVisual, setIsDraggingLegendVisual] = useState(false)
  const dragLegendRef = useRef({ isDragging: false, startX: 0 })

  const refreshQueue = useCallback(() => setQueue(getUpdateQueue()), [])

  const applyPreset = (p: typeof PRESETS[0]) => {
    setMerchant(p.merchant)
    setAmount(p.amount)
    setUserCards(p.cards)
    setResult(null)
    setLlmResult(null)
  }

  const toggleCard = (name: string) =>
    setUserCards(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name])

  const run = async () => {
    const amt = parseFloat(amount)
    if (!merchant.trim()) {
      setInputError('Please enter a merchant name.')
      return
    }
    if (isNaN(amt) || amt <= 0) {
      setInputError('Amount must be a number greater than 0.')
      return
    }
    setInputError(null)
    setLlmResult(null)

    // Pass 1 — rule-based engine (uses DB category or general fallback)
    const r1 = recommend(merchant, amt, userCards)
    setResult(r1)
    refreshQueue()

    // Pass 2 — LLM categorization only when merchant is unknown
    if (r1.reasoningMode !== 'missing_data') return

    setLlmLoading(true)
    const suggestion = await suggestCategory(merchant, cards, KNOWN_CATS)
    setLlmResult(suggestion)
    setLlmLoading(false)

    // Pass 2 re-run: if LLM returned a valid category, re-recommend using it
    if (suggestion.source === 'llm' && suggestion.category) {
      const r2 = recommend(merchant, amt, userCards, suggestion.category)
      setResult(r2)
      refreshQueue()
    }
  }

  const handleClearQueue = () => { clearEventLog(); refreshQueue() }

  const handleBottomDragDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingBottom(true)
    setDragStartY(e.clientY)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingBottom) return
    const delta = dragStartY - e.clientY  // Reversed: drag up = expand, drag down = collapse
    setBottomHeight(prev => Math.max(10, prev + delta))  // Min 10px (fully collapsed)
    setDragStartY(e.clientY)
  }

  const handleMouseUp = () => {
    setIsDraggingBottom(false)
    dragLegendRef.current.isDragging = false
    setIsDraggingLegendVisual(false)
  }

  const handleLegendDragDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragLegendRef.current = { isDragging: true, startX: e.clientX }
    setIsDraggingLegendVisual(true)
  }

  const handleMouseMoveLegend = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragLegendRef.current.isDragging) return
    const delta = e.clientX - dragLegendRef.current.startX
    setLegendWidth(prev => Math.max(200, prev + delta))
    dragLegendRef.current.startX = e.clientX
  }

  useEffect(() => { refreshQueue() }, [refreshQueue])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      style={{ minHeight: '100vh', background: '#0f1117', color: '#e2e8f0', fontFamily: 'var(--font-sans)', fontSize: '0.85rem' }}
      onMouseMove={(e) => { handleMouseMove(e); handleMouseMoveLegend(e) }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >

      {/* ── Header ── */}
      <div style={{ borderBottom: '1px solid #1e2535', padding: '0.6rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem', color: '#a78bfa', letterSpacing: '0.05em' }}>
          CARDSPENDAI
        </span>
        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', background: '#1e2535', color: '#cbd5e1' }}>
          Card Recommendation Engine
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: '#cbd5e1', fontSize: '0.78rem' }}>Groq</span>
          <span style={{ fontSize: '0.7rem', color: '#4ade80' }}>● proxied via server</span>
        </div>
      </div>

      {/* ── Instructions ── */}
      <div style={{ borderBottom: '1px solid #1e2535', padding: '0.75rem 1.5rem', background: '#111827' }}>
        <div style={{ color: '#cbd5e1', fontSize: '0.8rem', lineHeight: 1.6 }}>
          Enter a merchant you're about to pay, select your cards, and click <strong>CHECK REWARDS</strong>.
          The engine picks the card that earns the most rewards and explains why.
          For unknown merchants, it automatically asks the LLM to identify the category.
        </div>
      </div>

      {/* ── Input error banner ── */}
      {inputError && (
        <div style={{ background: '#450a0a', borderBottom: '1px solid #7f1d1d', padding: '0.5rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: '#fca5a5', fontSize: '0.8rem' }}>⚠ {inputError}</span>
          <button onClick={() => setInputError(null)} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: '0.85rem', padding: '0 4px' }}>✕</button>
        </div>
      )}

      {/* ── Main grid ── */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 0, height: `calc(100vh - 34px - 46px - ${bottomHeight}px - ${inputError ? 34 : 0}px)` }}
      >

        {/* ── LEFT: Query panel ── */}
        <div style={{ borderRight: '1px solid #1e2535', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>

          <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>
            QUICK START
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {PRESETS.map(p => (
              <button key={p.merchant} onClick={() => applyPreset(p)} style={{
                textAlign: 'left', padding: '5px 8px', borderRadius: '4px',
                background: merchant === p.merchant ? '#1e2535' : 'transparent',
                border: '1px solid ' + (merchant === p.merchant ? '#3730a3' : 'transparent'),
                color: merchant === p.merchant ? '#a78bfa' : '#cbd5e1',
                cursor: 'pointer', fontSize: '0.78rem',
              }}>
                {p.merchant} <span style={{ color: '#94a3b8' }}>${p.amount}</span>
              </button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid #1e2535', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>Selected Merchant</div>
            <div>
              <div style={{ color: '#cbd5e1', fontSize: '0.72rem', marginBottom: '2px' }}>Merchant</div>
              <input value={merchant} onChange={e => { setMerchant(e.target.value); setInputError(null) }} style={{
                width: '100%', padding: '5px 8px', borderRadius: '4px',
                background: '#1e2535', border: '1px solid #2d3748',
                color: '#e2e8f0', fontSize: '0.82rem', outline: 'none',
              }} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #1e2535', paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>AMOUNT</div>
            <div>
              <div style={{ color: '#cbd5e1', fontSize: '0.72rem', marginBottom: '2px' }}>Amount (SGD)</div>
              <input value={amount} onChange={e => { setAmount(e.target.value); setInputError(null) }} style={{
                width: '100%', padding: '5px 8px', borderRadius: '4px',
                background: '#1e2535', border: '1px solid #2d3748',
                color: '#e2e8f0', fontSize: '0.82rem', outline: 'none',
              }} />
            </div>
          </div>

            <div style={{ borderTop: '1px solid #1e2535', paddingTop: '0.75rem' }}>
              <div style={{ color: '#cbd5e1', fontSize: '0.72rem', marginBottom: '4px', fontWeight: 700, letterSpacing: '0.08em' }}>COMPARE REWARDS</div>
              <div style={{ color: '#cbd5e1', fontSize: '0.72rem', marginBottom: '4px' }}>Selected cards (empty = all)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {ALL_CARD_NAMES.map(name => (
                  <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.78rem' }}>
                    <input type="checkbox" checked={userCards.includes(name)} onChange={() => toggleCard(name)} style={{ accentColor: '#7c3aed' }} />
                    {name}
                  </label>
                ))}
              </div>
            </div>

          <button onClick={run} style={{
            marginTop: 'auto', padding: '8px', borderRadius: '4px',
            background: '#4f46e5', border: 'none', color: '#fff',
            fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', letterSpacing: '0.03em',
          }}>
            CHECK REWARDS →
          </button>
        </div>

        {/* ── RIGHT: Results panel ── */}
        <div style={{ padding: '1rem', overflowY: 'auto' }}>
          {!result ? (
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <div style={{ color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                👈 Select a preset or enter a merchant
              </div>
              <div style={{ color: '#64748b', fontSize: '0.78rem' }}>
                Unknown merchants are auto-categorized via LLM
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '680px' }}>

              {/* ── Recommendation ── */}
              <div style={{ background: '#1e2535', borderRadius: '6px', padding: '1rem', border: '1px solid #2d3748' }}>
                <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                  RECOMMENDATION
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#e2e8f0' }}>
                    {result.recommendedCard?.card_name ?? 'No card found'}
                  </span>
                  <Tag label={result.reasoningMode.replace('_', ' ')} color="#fff" bg={REASONING_COLORS[result.reasoningMode]} />
                  <Tag label={result.confidenceScore >= 100 ? `${result.confidence} · clear winner (100)` : `${result.confidence} · ${(result.confidenceScore / 10).toFixed(1)}% edge (${result.confidenceScore})`} color="#fff" bg={CONFIDENCE_COLORS[result.confidence]} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <Field label="Reward rate" value={`${result.rewardRate}%`} />
                  <Field label="Est. reward"  value={`$${result.estimatedReward.toFixed(2)} SGD`} />
                  <Field label="Explanation"  value={result.explanation} />
                </div>
              </div>

              {/* ── LLM Categorization (missing_data only) ── */}
              {llmLoading && (
                <div style={{ background: '#0f1f2e', border: '1px solid #1e4068', borderRadius: '6px', padding: '0.75rem' }}>
                  <span style={{ color: '#60a5fa', fontSize: '0.78rem' }}>⏳ Asking LLM to identify merchant category...</span>
                </div>
              )}

              {!llmLoading && llmResult && (
                <div style={{ background: '#0f1f2e', border: '1px solid #1e4068', borderRadius: '6px', padding: '0.75rem' }}>
                  <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    LLM CATEGORY LOOKUP
                    <span style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 400 }}>
                      (Groq · llama-3.1-8b-instant)
                    </span>
                  </div>

                  {llmResult.source === 'llm' && llmResult.category ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Field label="identified as" value={<span style={{ color: '#4ade80', fontWeight: 700 }}>{llmResult.category}</span>} />
                      <Field label="reasoning"     value={llmResult.reasoning} />
                      <div style={{ marginTop: '0.4rem', fontSize: '0.73rem', color: '#94a3b8' }}>
                        ↑ Recommendation above has been updated using this category
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#fca5a5', fontSize: '0.78rem' }}>{llmResult.reasoning}</span>
                  )}
                </div>
              )}

              {/* ── Coverage signal ── */}
              {result.updateNeeded && (
                <div style={{ background: '#2d1e00', border: '1px solid #78350f', borderRadius: '6px', padding: '0.75rem' }}>
                  <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    COVERAGE SIGNAL
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Field label="type"   value={result.updateNeeded.type} />
                    <Field label="reason" value={result.updateNeeded.reason} />
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* ── Drag handle for legend + queue ── */}
      <div
        onMouseDown={handleBottomDragDown}
        style={{
          height: '6px',
          background: isDraggingBottom ? '#60a5fa' : '#3730a3',
          cursor: 'ns-resize',
          borderTop: '1px solid #1e2535',
        }}
        title="Drag up to expand, down to collapse"
      />

      {/* ── Legend (80px) + Resize handle ── */}
      <div style={{ display: 'flex', borderTop: '1px solid #1e2535', height: '80px' }}>
        <div style={{ width: `${legendWidth}px`, background: '#111827', height: '80px', overflow: 'hidden', padding: '0.75rem 1rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <div style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700 }}>REASONING MODES</div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'nowrap', alignItems: 'center', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
            <span><span style={{ color: '#059669', fontWeight: 700 }}>● deterministic</span><span style={{ color: '#94a3b8' }}> — exact</span></span>
            <span><span style={{ color: '#D97706', fontWeight: 700 }}>● inferred</span><span style={{ color: '#94a3b8' }}> — fuzzy</span></span>
            <span><span style={{ color: '#DC2626', fontWeight: 700 }}>● missing_data</span><span style={{ color: '#94a3b8' }}> — unknown</span></span>
          </div>
        </div>
        <div
          onMouseDown={handleLegendDragDown}
          style={{
            width: '6px',
            background: isDraggingLegendVisual ? '#60a5fa' : '#3730a3',
            cursor: 'ew-resize',
            borderRight: '1px solid #1e2535',
          }}
          title="Drag to resize legend"
        />
        <div style={{ flex: 1, background: '#111827', height: '80px', borderRight: '1px solid #1e2535' }} />
      </div>

      {/* ── Bottom: Update Queue ── */}
      <div style={{ borderTop: '1px solid #1e2535', height: `${bottomHeight - 80 - 6}px`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #1e2535', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ color: '#cbd5e1', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em' }}>UPDATE QUEUE</span>
          <span style={{ color: '#64748b', fontSize: '0.72rem' }}>merchants needing DB attention</span>
          {queue.length > 0 && (() => {
            const uniqueCount = new Set(queue.map(e => `${e.merchant}||${e.updateType}`)).size
            return (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '4px', background: '#7f1d1d', color: '#fca5a5' }}>
                {uniqueCount} unique
              </span>
            )
          })()}
          {queue.length > 0 && (
            <button onClick={handleClearQueue} style={{
              marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px',
              background: 'transparent', border: '1px solid #2d3748', color: '#cbd5e1', cursor: 'pointer',
            }}>
              Clear
            </button>
          )}
        </div>

        {queue.length === 0 ? (
          <div style={{ padding: '1rem' }}>
            <div style={{ color: '#cbd5e1', fontSize: '0.78rem', marginBottom: '0.25rem' }}>No issues detected.</div>
            <div style={{ color: '#64748b', fontSize: '0.75rem' }}>Run a query with an unknown merchant (e.g. "Don Don Donki") to populate this list.</div>
          </div>
        ) : (() => {
          const deduped = Object.values(
            queue.reduce<Record<string, SpendEvent & { count: number }>>((acc, e) => {
              const key = `${e.merchant}||${e.updateType}`
              if (acc[key]) { acc[key] = { ...e, count: acc[key].count + 1 } }
              else          { acc[key] = { ...e, count: 1 } }
              return acc
            }, {})
          ).filter(e => !resolvedKeys.has(resolveKey(e)))

          const btnStyle = (color: string, bg: string): React.CSSProperties => ({
            fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px',
            border: `1px solid ${color}`, color, background: bg, cursor: 'pointer', whiteSpace: 'nowrap',
          })

          return (
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e2535' }}>
                    {['#', 'Merchant', 'Type', 'Card', 'Confidence', 'Reason', 'Action'].map(h => (
                      <th key={h} style={{ padding: '4px 12px', textAlign: 'left', color: '#cbd5e1', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deduped.map((e, i) => (
                    <tr key={`${e.merchant}-${e.updateType}`} style={{ borderBottom: '1px solid #1a2030', background: i % 2 === 0 ? 'transparent' : '#111827' }}>
                      <td style={{ padding: '4px 12px' }}>
                        {e.count > 1
                          ? <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: '#1e3a5f', color: '#93c5fd' }}>{e.count}×</span>
                          : <span style={{ color: '#475569', fontSize: '0.72rem' }}>1×</span>}
                      </td>
                      <td style={{ padding: '4px 12px', color: '#e2e8f0', fontWeight: 500 }}>{e.merchant}</td>
                      <td style={{ padding: '4px 12px' }}>
                        <Tag label={e.updateType.replace(/_/g, ' ')} color="#fbbf24" bg="#451a03" />
                      </td>
                      <td style={{ padding: '4px 12px', color: '#cbd5e1' }}>{e.recommendedCard ?? '—'}</td>
                      <td style={{ padding: '4px 12px' }}>
                        <Tag label={e.confidence} color="#fff" bg={CONFIDENCE_COLORS[e.confidence]} />
                      </td>
                      <td style={{ padding: '4px 12px', color: '#cbd5e1', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.updateReason}
                      </td>
                      <td style={{ padding: '4px 12px', whiteSpace: 'nowrap' }}>
                        {e.updateType === 'merchant_missing' && (
                          stagingFor === e.merchant
                            ? <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <select
                                  value={stagingCategory}
                                  onChange={ev => setStagingCategory(ev.target.value)}
                                  style={{ fontSize: '0.7rem', padding: '2px 4px', borderRadius: '4px', background: '#1e2535', border: '1px solid #3730a3', color: '#e2e8f0' }}
                                >
                                  <option value="">pick category</option>
                                  {KNOWN_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button
                                  onClick={() => { if (stagingCategory) { markResolved(e); setStagingFor(null); setStagingCategory('') } }}
                                  style={btnStyle('#4ade80', '#052e16')}
                                  disabled={!stagingCategory}
                                >Confirm</button>
                                <button onClick={() => { setStagingFor(null); setStagingCategory('') }} style={btnStyle('#94a3b8', 'transparent')}>✕</button>
                              </span>
                            : <button onClick={() => setStagingFor(e.merchant)} style={btnStyle('#a78bfa', '#1e1b4b')}>Stage for DB</button>
                        )}
                        {e.updateType === 'merchant_ambiguous' && (
                          <span style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => markResolved(e)} style={btnStyle('#4ade80', '#052e16')} title={`Accept "${e.merchant}" as alias for ${e.matchedMerchant ?? 'matched merchant'}`}>✓ Accept alias</button>
                            <button onClick={() => markResolved(e)} style={btnStyle('#f87171', '#450a0a')}>✗ Reject</button>
                          </span>
                        )}
                        {e.updateType === 'card_ambiguous' && (
                          <button onClick={() => markResolved(e)} style={btnStyle('#94a3b8', '#1e2535')}>Acknowledge</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}
      </div>

    </div>
  )
}
