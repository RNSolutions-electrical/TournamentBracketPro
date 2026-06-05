import { useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import {
  shuffle, generateId, nextPow2, buildSingleElim, buildDoubleElim,
  flattenDoubleElim, buildSeededSlots, getDefaultRoundName, COLORS
} from '../lib/game'

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  sectionLabel: { fontFamily:'Cinzel', color:'var(--gold)', fontSize:13, letterSpacing:5, textTransform:'uppercase', marginBottom:4, margin:0 },
  warning: { background:'var(--charcoal-2)', borderRadius:10, padding:14, color:'#f59e0b', marginBottom:16, border:'1px solid #f59e0b44', fontSize:13 },
  segBtn: (active) => ({
    flex:1, padding:'9px 0', borderRadius:8,
    border:`1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--gold)' : 'transparent',
    color: active ? 'var(--charcoal)' : 'var(--cream-dim)',
    fontFamily:'Cinzel', fontWeight:700, fontSize:11, letterSpacing:1, cursor:'pointer', textTransform:'uppercase'
  }),
}

function Section({ title, children }) {
  return (
    <div style={{ background:'var(--charcoal-2)', borderRadius:12, padding:16, marginBottom:14, border:'1px solid var(--border)' }}>
      <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>{title}</p>
      {children}
    </div>
  )
}

// ─── Slot Picker Modal ────────────────────────────────────────────────────────
// Click-to-assign: opens when you click a bracket slot
function SlotPicker({ slotLabel, currentPlayer, players, usedIds, onAssign, onBye, onClear, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.nickname || '').toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:2000,
      display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'var(--charcoal-2)', border:'1px solid var(--border-bright)', borderRadius:14,
        padding:'20px 18px', width:300, maxHeight:'80vh', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:3, textTransform:'uppercase', margin:0 }}>{slotLabel}</p>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--cream-dim)', cursor:'pointer', fontSize:18 }}>×</button>
        </div>
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player…"
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-3)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Oswald' }} />
        <div style={{ overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
          {filtered.map(p => {
            const inUse = usedIds.has(p.id) && p.id !== currentPlayer?.id
            return (
              <button key={p.id} onClick={() => !inUse && onAssign(p)}
                disabled={inUse}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:9,
                  border:`1px solid ${p.id === currentPlayer?.id ? 'var(--gold)' : 'var(--border)'}`,
                  background: p.id === currentPlayer?.id ? '#c8a84b22' : 'var(--charcoal-3)',
                  cursor: inUse ? 'not-allowed' : 'pointer', opacity: inUse ? 0.4 : 1, textAlign:'left' }}>
                <Avatar player={p} size={30} />
                <div>
                  <p style={{ color:'var(--cream)', fontFamily:'Cinzel', fontSize:12, margin:0 }}>{p.name}</p>
                  {p.nickname && <p style={{ color:'var(--gold)', fontSize:10, margin:0, fontStyle:'italic' }}>"{p.nickname}"</p>}
                  {inUse && <p style={{ color:'#f59e0b', fontSize:9, margin:0 }}>already seeded</p>}
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && <p style={{ color:'var(--cream-dim)', fontSize:12, textAlign:'center', padding:'8px 0' }}>No players found</p>}
        </div>
        <div style={{ display:'flex', gap:8, borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <button onClick={onBye}
            style={{ flex:1, padding:'8px 0', borderRadius:8, border:'1px solid #ef444466',
              background:'transparent', color:'#ef4444', fontFamily:'Cinzel', fontSize:10, cursor:'pointer', letterSpacing:2 }}>
            SET BYE
          </button>
          {currentPlayer && (
            <button onClick={onClear}
              style={{ flex:1, padding:'8px 0', borderRadius:8, border:'1px solid var(--border)',
                background:'transparent', color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:10, cursor:'pointer', letterSpacing:2 }}>
              CLEAR
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Bracket Builder ──────────────────────────────────────────────────────────
// slots: array of (player | null = bye), length = nextPow2
// Two views: SEED LIST (numbered list of players) and BRACKET PREVIEW (visual slots)
function BracketBuilder({ players, onGenerate }) {
  const [format, setFormat] = useState('single')
  const [roundNames, setRoundNames] = useState({})
  const [generating, setGenerating] = useState(false)
  const [view, setView] = useState('list')           // 'list' | 'bracket'
  const [pickerSlot, setPickerSlot] = useState(null) // { idx, current }
  const [confirmOverwrite, setConfirmOverwrite] = useState(null)
  const dragItem = useRef(null)
  const dragOver = useRef(null)

  // Core state: ordered slot array, null = bye
  const initialSize = nextPow2(players.length)
  const [slots, setSlots] = useState(() => {
    const arr = [...players]
    while (arr.length < initialSize) arr.push(null)
    return arr
  })

  // Grow/shrink slot array when format changes size needs
  const slotCount = slots.length

  // ── Seed list helpers ──
  // Derive seed order from slots (skip byes for display)
  const seedList = slots.map((p, i) => ({ player: p, slotIdx: i, isBye: p === null }))

  // Randomize remaining unset (null) slots that aren't explicitly set to bye
  // We track which nulls are intentional byes vs just empty
  const [byeSet, setByeSet] = useState(() => new Set())

  const assignSlot = (idx, player, warn = true) => {
    const existing = slots[idx]
    if (existing && existing.id !== player?.id && warn) {
      setConfirmOverwrite({ idx, player, existing })
      return
    }
    setSlots(prev => {
      const next = [...prev]
      // Remove player from any previous slot first
      if (player) {
        const oldIdx = next.findIndex(p => p?.id === player.id)
        if (oldIdx >= 0 && oldIdx !== idx) next[oldIdx] = null
      }
      next[idx] = player || null
      return next
    })
    if (!player) setByeSet(prev => { const n = new Set(prev); n.add(idx); return n })
    else setByeSet(prev => { const n = new Set(prev); n.delete(idx); return n })
  }

  const clearSlot = (idx) => {
    setSlots(prev => { const n = [...prev]; n[idx] = null; return n })
    setByeSet(prev => { const n = new Set(prev); n.delete(idx); return n })
  }

  const setSlotBye = (idx) => {
    setSlots(prev => { const n = [...prev]; n[idx] = null; return n })
    setByeSet(prev => { const n = new Set(prev); n.add(idx); return n })
  }

  const fillRandom = () => {
    const unplaced = players.filter(p => !slots.find(s => s?.id === p.id))
    const emptyIndices = slots.reduce((acc, p, i) => { if (!p && !byeSet.has(i)) acc.push(i); return acc }, [])
    const shuffled = shuffle(unplaced)
    setSlots(prev => {
      const next = [...prev]
      emptyIndices.forEach((idx, i) => { if (shuffled[i]) next[idx] = shuffled[i] })
      return next
    })
  }

  const randomizeAll = () => {
    const shuffled = shuffle([...players])
    const size = nextPow2(shuffled.length)
    const next = [...shuffled]
    while (next.length < size) next.push(null)
    setSlots(next)
    setByeSet(new Set())
  }

  const addByeSlot = () => {
    const newSize = nextPow2(slotCount + 1)
    if (newSize > slotCount) {
      setSlots(prev => { const n = [...prev]; while (n.length < newSize) n.push(null); return n })
      const newIdx = newSize - 1
      setByeSet(prev => { const n = new Set(prev); n.add(newIdx); return n })
    } else {
      // find an empty slot for the bye
      const emptyIdx = slots.findIndex((p, i) => !p && !byeSet.has(i))
      if (emptyIdx >= 0) setSlotBye(emptyIdx)
    }
  }

  // ── Drag and drop ──
  const onDragStart = (e, idx) => {
    dragItem.current = idx
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragEnter = (_, idx) => { dragOver.current = idx }
  const onDrop = (e, toIdx) => {
    e.preventDefault()
    const fromIdx = dragItem.current
    if (fromIdx === null || fromIdx === toIdx) return
    const fromPlayer = slots[fromIdx]
    const toPlayer = slots[toIdx]
    setSlots(prev => {
      const next = [...prev]
      next[fromIdx] = toPlayer
      next[toIdx] = fromPlayer
      return next
    })
    // Swap bye state
    setByeSet(prev => {
      const n = new Set(prev)
      const fromBye = n.has(fromIdx), toBye = n.has(toIdx)
      if (fromBye) n.add(toIdx); else n.delete(toIdx)
      if (toBye) n.add(fromIdx); else n.delete(fromIdx)
      return n
    })
    dragItem.current = null; dragOver.current = null
  }

  const usedIds = new Set(slots.filter(Boolean).map(p => p.id))

  const updateRoundName = (ri, name) => setRoundNames(n => ({ ...n, [ri]: name }))
  const estimatedRounds = Math.log2(slotCount)
  const roundNamesArr = Array.from({ length: Math.ceil(estimatedRounds) }, (_, i) =>
    roundNames[i] || getDefaultRoundName(i, Math.ceil(estimatedRounds)))

  const handleGenerate = async () => {
    if (players.length < 2) return
    setGenerating(true)
    try {
      let structure
      if (format === 'single') {
        const rounds = buildSingleElim(slots)
        // Apply custom names
        Object.entries(roundNames).forEach(([k, v]) => { if (rounds[+k]) rounds[+k].name = v || null })
        structure = { type: 'single', rounds, roundNames }
      } else {
        const de = buildDoubleElim(slots)
        structure = { type: 'double', winners: de.winners, losers: de.losers, grandFinal: de.grandFinal, roundNames }
      }
      await onGenerate(structure)
    } finally { setGenerating(false) }
  }

  const allPlaced = players.every(p => slots.find(s => s?.id === p.id))
  const emptyCount = slots.filter((p, i) => !p && !byeSet.has(i)).length

  return (
    <div style={{ padding:'20px 16px', maxWidth:640, margin:'0 auto' }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={S.sectionLabel}>Build Bracket</h2>
        <p style={{ color:'var(--cream-dim)', fontSize:13, marginTop:4 }}>Season 6 · International Statewide World Championships</p>
      </div>

      {players.length < 2 && <div style={S.warning}>⚠ Register at least 2 competitors first.</div>}

      {/* Format */}
      <Section title="Elimination Format">
        <div style={{ display:'flex', gap:8 }}>
          {[['single','Single Elimination'],['double','Double Elimination']].map(([v, l]) => (
            <button key={v} onClick={() => setFormat(v)} style={S.segBtn(format===v)}>{v==='double'&&'⚔ '}{l}</button>
          ))}
        </div>
        {format === 'double' && <p style={{ color:'var(--cream-dim)', fontSize:12, marginTop:8, fontFamily:'IM Fell English', fontStyle:'italic' }}>Losers bracket + grand final. Must lose twice to be eliminated.</p>}
      </Section>

      {/* View toggle */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <button onClick={() => setView('list')} style={S.segBtn(view==='list')}>📋 Seed List</button>
        <button onClick={() => setView('bracket')} style={S.segBtn(view==='bracket')}>🏆 Bracket Preview</button>
      </div>

      {/* ── SEED LIST VIEW ── */}
      {view === 'list' && (
        <Section title={`Seed Order  (${slotCount} slots · ${byeSet.size} byes · ${emptyCount} empty)`}>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
            <button onClick={randomizeAll}
              style={{ padding:'5px 12px', borderRadius:7, border:'1px solid var(--border-bright)', background:'transparent', color:'var(--cream)', fontFamily:'Cinzel', fontSize:10, cursor:'pointer', letterSpacing:1 }}>
              🔀 Randomize All
            </button>
            <button onClick={fillRandom}
              style={{ padding:'5px 12px', borderRadius:7, border:'1px solid var(--border-bright)', background:'transparent', color:'var(--cream)', fontFamily:'Cinzel', fontSize:10, cursor:'pointer', letterSpacing:1 }}>
              🎲 Fill Empty
            </button>
            <button onClick={addByeSlot}
              style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #ef444466', background:'transparent', color:'#ef4444', fontFamily:'Cinzel', fontSize:10, cursor:'pointer', letterSpacing:1 }}>
              + Bye Slot
            </button>
          </div>
          <p style={{ color:'var(--cream-dim)', fontSize:11, marginBottom:10, fontFamily:'IM Fell English', fontStyle:'italic' }}>
            Drag rows to reorder · Click a slot to assign · Bracket preview updates live
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {seedList.map(({ player, slotIdx, isBye }) => (
              <div key={slotIdx}
                draggable
                onDragStart={e => onDragStart(e, slotIdx)}
                onDragEnter={() => onDragEnter(null, slotIdx)}
                onDragOver={e => e.preventDefault()}
                onDrop={e => onDrop(e, slotIdx)}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                  background: dragOver.current === slotIdx ? '#c8a84b22' : byeSet.has(slotIdx) ? '#7f1d1d22' : 'var(--charcoal-2)',
                  borderRadius:9, border:`1px solid ${byeSet.has(slotIdx) ? '#ef444466' : player ? 'var(--border)' : 'var(--border)'}`,
                  cursor:'grab', transition:'background 0.1s' }}>
                {/* Drag handle */}
                <span style={{ color:'var(--charcoal-4)', fontSize:14, cursor:'grab', userSelect:'none' }}>⠿</span>
                {/* Seed # */}
                <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:11, width:24, textAlign:'center', flexShrink:0 }}>#{slotIdx+1}</span>
                {/* Avatar / bye badge */}
                {byeSet.has(slotIdx)
                  ? <div style={{ width:32, height:32, borderRadius:'50%', background:'#7f1d1d', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><span style={{ color:'#ef4444', fontSize:9, fontFamily:'Cinzel' }}>BYE</span></div>
                  : <Avatar player={player} size={32} />}
                {/* Name */}
                <span style={{ flex:1, color: byeSet.has(slotIdx) ? '#ef4444' : player ? 'var(--cream)' : 'var(--charcoal-4)',
                  fontFamily:'Cinzel', fontSize:12, fontStyle: player ? 'normal' : 'italic' }}>
                  {byeSet.has(slotIdx) ? 'BYE' : player ? player.name : 'Empty — click to assign'}
                </span>
                {/* Assign button */}
                <button onClick={() => setPickerSlot({ idx: slotIdx, current: player })}
                  style={{ padding:'3px 10px', borderRadius:6, border:'1px solid var(--border-bright)',
                    background:'transparent', color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:9,
                    cursor:'pointer', letterSpacing:1, flexShrink:0 }}>
                  {player ? 'SWAP' : byeSet.has(slotIdx) ? 'REASSIGN' : 'ASSIGN'}
                </button>
                {/* Clear / bye toggle */}
                {(player || byeSet.has(slotIdx)) && (
                  <button onClick={() => clearSlot(slotIdx)}
                    style={{ background:'none', border:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:16, padding:'0 2px', flexShrink:0 }}>×</button>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── BRACKET PREVIEW VIEW ── */}
      {view === 'bracket' && (
        <Section title="Bracket Preview — Click Any Slot to Assign">
          <p style={{ color:'var(--cream-dim)', fontSize:11, marginBottom:12, fontFamily:'IM Fell English', fontStyle:'italic' }}>
            Click a player slot in the bracket below to reassign. Drag from seed list to reorder.
          </p>
          <div style={{ overflowX:'auto' }}>
            <BracketPreview slots={slots} byeSet={byeSet} onClickSlot={(slotIdx, current) => setPickerSlot({ idx: slotIdx, current })} roundNames={roundNames} format={format} />
          </div>
        </Section>
      )}

      {/* Unplaced players reminder */}
      {!allPlaced && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:'10px 14px', marginBottom:14,
          border:'1px solid #f59e0b44', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ color:'#f59e0b', fontSize:12 }}>⚠ Unplaced:</span>
          {players.filter(p => !slots.find(s => s?.id === p.id)).map(p => (
            <span key={p.id} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <Avatar player={p} size={20} />
              <span style={{ color:'var(--cream-dim)', fontSize:11 }}>{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Custom Round Names */}
      {format === 'single' && (
        <Section title="Custom Round Names (optional)">
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {roundNamesArr.map((name, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:10, width:60, flexShrink:0 }}>Round {i+1}</span>
                <input value={roundNames[i] || ''} onChange={e => updateRoundName(i, e.target.value)}
                  placeholder={getDefaultRoundName(i, roundNamesArr.length)}
                  style={{ flex:1, padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)',
                    background:'var(--charcoal-3)', color:'var(--cream)', fontSize:12, outline:'none', fontFamily:'Oswald' }} />
              </div>
            ))}
          </div>
        </Section>
      )}

      <button onClick={handleGenerate} disabled={players.length < 2 || generating}
        style={{ width:'100%', padding:'13px 0', borderRadius:10, border:'1px solid var(--gold)',
          background: players.length >= 2 ? 'var(--gold)' : 'transparent',
          color: players.length >= 2 ? 'var(--charcoal)' : 'var(--gold-dark)',
          fontFamily:'Cinzel Decorative', fontWeight:700, fontSize:14, cursor: players.length >= 2 ? 'pointer' : 'not-allowed',
          letterSpacing:1, marginTop:8 }}>
        {generating ? 'Generating…' : '⚔ Lock In Bracket'}
      </button>

      {/* Slot picker modal */}
      {pickerSlot && (
        <SlotPicker
          slotLabel={`Seed #${pickerSlot.idx + 1}`}
          currentPlayer={pickerSlot.current}
          players={players}
          usedIds={usedIds}
          onAssign={p => { assignSlot(pickerSlot.idx, p); setPickerSlot(null) }}
          onBye={() => { setSlotBye(pickerSlot.idx); setPickerSlot(null) }}
          onClear={() => { clearSlot(pickerSlot.idx); setPickerSlot(null) }}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Overwrite warning */}
      {confirmOverwrite && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:3000,
          display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}>
          <div style={{ background:'var(--charcoal-2)', border:'1px solid #f59e0b66', borderRadius:14, padding:'24px 20px', maxWidth:320, textAlign:'center' }}>
            <p style={{ fontFamily:'Cinzel', color:'#f59e0b', fontSize:11, letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>⚠ Slot Occupied</p>
            <p style={{ color:'var(--cream)', fontSize:13, marginBottom:20 }}>
              Seed #{confirmOverwrite.idx + 1} already has <strong>{confirmOverwrite.existing.name}</strong>. Replace with <strong>{confirmOverwrite.player.name}</strong>?
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { assignSlot(confirmOverwrite.idx, confirmOverwrite.player, false); setConfirmOverwrite(null) }}
                style={{ flex:1, padding:'9px 0', borderRadius:8, border:'1px solid var(--gold)', background:'var(--gold)', color:'var(--charcoal)', fontFamily:'Cinzel', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                Replace
              </button>
              <button onClick={() => setConfirmOverwrite(null)}
                style={{ flex:1, padding:'9px 0', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:12, cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Bracket Preview (used in builder before lock) ────────────────────────────
function BracketPreview({ slots, byeSet, onClickSlot, roundNames, format }) {
  // Build a visual-only bracket from slots for the builder preview
  const rounds = buildSingleElim(slots)
  const totalRounds = rounds.length
  if (totalRounds === 0) return <p style={{ color:'var(--cream-dim)', fontSize:12 }}>Need at least 2 players.</p>

  return (
    <div style={{ display:'flex', gap:0, minWidth: totalRounds * 168 }}>
      {rounds.map((round, ri) => {
        const name = roundNames[ri] || getDefaultRoundName(ri, totalRounds)
        return (
          <div key={ri} style={{ flex:1, minWidth:160, display:'flex', flexDirection:'column' }}>
            <div style={{ textAlign:'center', padding:'6px 4px', background:'var(--charcoal-3)',
              borderBottom:'1px solid var(--border)', borderRight:'1px solid var(--border)' }}>
              <span style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:9, letterSpacing:2, textTransform:'uppercase' }}>{name}</span>
            </div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'space-around',
              padding:'8px 5px', borderRight:'1px solid var(--border)' }}>
              {(round.matches ?? []).map((m, mi) => {
                // Find slot indices for p1/p2 in this match
                const p1SlotIdx = m.p1 ? slots.findIndex(s => s?.id === m.p1?.id) : -1
                const p2SlotIdx = m.p2 ? slots.findIndex(s => s?.id === m.p2?.id) : -1
                return (
                  <div key={m.id || mi} style={{ background:'var(--charcoal-2)', borderRadius:9, padding:'7px 9px',
                    border:'1px solid var(--border)', marginBottom:5 }}>
                    {[{ p: m.p1, slotIdx: p1SlotIdx }, { p: m.p2, slotIdx: p2SlotIdx }].map(({ p, slotIdx }, i) => (
                      <div key={i}
                        onClick={() => ri === 0 && slotIdx >= 0 && onClickSlot(slotIdx, p)}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'2px 0',
                          cursor: ri === 0 ? 'pointer' : 'default',
                          borderRadius:5, transition:'background 0.1s' }}
                        onMouseEnter={e => ri === 0 && (e.currentTarget.style.background = '#c8a84b11')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <Avatar player={p} size={20} />
                        <span style={{ flex:1, color: p ? 'var(--cream)' : 'var(--charcoal-4)',
                          fontSize:11, fontFamily:'Oswald', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p ? p.name : (m.isBye ? 'BYE' : 'TBD')}
                        </span>
                        {ri === 0 && !m.isBye && <span style={{ color:'var(--gold-dark)', fontSize:9 }}>✎</span>}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Match Card (live bracket viewer) ────────────────────────────────────────
function MatchCard({ bracketMatch, dbMatch, players, isCommissioner, onClickScore, onAssignSlot }) {
  const getPlayer = id => players.find(p => p.id === id)
  const p1 = bracketMatch?.p1 || (dbMatch?.player1_id ? getPlayer(dbMatch.player1_id) : null)
  const p2 = bracketMatch?.p2 || (dbMatch?.player2_id ? getPlayer(dbMatch.player2_id) : null)
  const s1 = dbMatch?.total_net1 || 0
  const s2 = dbMatch?.total_net2 || 0
  const winnerId = dbMatch?.winner_id
  const isComplete = dbMatch?.status === 'complete'

  if (bracketMatch?.isBye && !p1 && !p2) return (
    <div style={{ background:'var(--charcoal-3)', borderRadius:8, padding:'6px 10px', marginBottom:5,
      opacity:0.3, border:'1px dashed var(--border)', fontSize:11, color:'var(--cream-dim)',
      textAlign:'center', fontFamily:'Cinzel' }}>— BYE —</div>
  )

  return (
    <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:'7px 9px',
      border:`1.5px solid ${isComplete ? 'var(--gold-dark)' : 'var(--border)'}`,
      marginBottom:6, transition:'border-color 0.15s', position:'relative' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = isComplete ? 'var(--gold)' : 'var(--gold-dark)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = isComplete ? 'var(--gold-dark)' : 'var(--border)'}>
      {[{ p: p1, s: s1, win: winnerId && winnerId === p1?.id, field:'player1_id' },
        { p: p2, s: s2, win: winnerId && winnerId === p2?.id, field:'player2_id' }].map(({ p, s, win, field }, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:5, padding:'2px 0' }}>
          {/* Click avatar to open scoreboard */}
          <div onClick={() => dbMatch && onClickScore(dbMatch)} style={{ cursor: dbMatch ? 'pointer' : 'default', flexShrink:0 }}>
            <Avatar player={p} size={20} />
          </div>
          <span onClick={() => dbMatch && onClickScore(dbMatch)}
            style={{ flex:1, color: win ? 'var(--gold)' : p ? 'var(--cream)' : 'var(--charcoal-4)',
              fontSize:11, fontFamily: win ? 'Cinzel' : 'Oswald', fontWeight: win ? 700 : 400,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor: dbMatch ? 'pointer' : 'default' }}>
            {p ? (p.nickname ? `"${p.nickname}"` : p.name) : (bracketMatch?.isBye ? 'BYE' : 'TBD')}
          </span>
          <span onClick={() => dbMatch && onClickScore(dbMatch)}
            style={{ color: win ? 'var(--gold)' : 'var(--cream-dim)', fontWeight: win ? 700 : 400,
              fontSize:12, fontFamily:'Cinzel', flexShrink:0, cursor: dbMatch ? 'pointer' : 'default' }}>{s}</span>
          {/* Commissioner: edit slot assignment */}
          {isCommissioner && !isComplete && dbMatch && (
            <button onClick={e => { e.stopPropagation(); onAssignSlot(dbMatch, field, p) }}
              style={{ background:'none', border:'none', color:'var(--gold-dark)', cursor:'pointer',
                fontSize:10, padding:'0 2px', opacity:0.5, lineHeight:1, flexShrink:0 }}
              title="Reassign player">✎</button>
          )}
        </div>
      ))}
      {isComplete && <div style={{ fontSize:8, color:'var(--gold-dark)', fontFamily:'Cinzel', letterSpacing:2, marginTop:2, textAlign:'right' }}>FINAL</div>}
    </div>
  )
}

// ─── Bracket Viewer (live, post-lock) ────────────────────────────────────────
function BracketViewer({ structure, matches, players, isCommissioner, onReset, setActiveMatch, setTab }) {
  const getPlayer = id => players.find(p => p.id === id)
  const [pickerTarget, setPickerTarget] = useState(null) // { matchId, field, current }
  const [confirmOverwrite, setConfirmOverwrite] = useState(null)

  const openMatch = (dbMatch) => {
    setActiveMatch({ matchId: dbMatch.id })
    setTab('Scoreboard')
  }

  const getDbMatch = (section, sectionIndex, matchIndex) =>
    matches.find(m =>
      m.match_index === matchIndex && (
        (m.bracket_section === section && (m.section_round_index ?? m.round_index) === sectionIndex) ||
        (!m.bracket_section && section === 'winners' && m.round_index === sectionIndex)
      )
    )

  const renameRound = async (section, sectionIndex, name) => {
    const { data } = await supabase.from('tournament').select('bracket').eq('id','season6').single()
    const bracket = data?.bracket
    if (!bracket) return
    const updated = { ...bracket }
    if (section === 'winners') {
      if (updated.rounds) updated.rounds = updated.rounds.map((r,i) => i===sectionIndex ? {...r, name} : r)
      else if (updated.winners) updated.winners = updated.winners.map((r,i) => i===sectionIndex ? {...r, name} : r)
    }
    if (section === 'losers' && updated.losers) updated.losers = updated.losers.map((r,i) => i===sectionIndex ? {...r, name} : r)
    if (section === 'grand_final' && updated.grandFinal) updated.grandFinal = { ...updated.grandFinal, name }
    await supabase.from('tournament').update({ bracket: updated, updated_at: new Date().toISOString() }).eq('id','season6')
  }

  // ── Round / Match management ──────────────────────────────────────────────
  const mutateBracket = async (updater) => {
    const { data } = await supabase.from('tournament').select('bracket').eq('id','season6').single()
    if (!data?.bracket) return
    const updated = updater(JSON.parse(JSON.stringify(data.bracket)))
    await supabase.from('tournament').update({ bracket: updated, updated_at: new Date().toISOString() }).eq('id','season6')
  }

  const addRound = async (section, name = '') => {
    await mutateBracket(b => {
      const newRound = { matches: [{ id: Math.random().toString(36).slice(2,9), p1: null, p2: null, isBye: false, score1: 0, score2: 0, winner: null }], name: name || null, type: section }
      if (section === 'winners') {
        if (b.rounds) b.rounds = [...b.rounds, newRound]
        else if (b.winners) b.winners = [...b.winners, newRound]
      } else if (section === 'losers') {
        b.losers = [...(b.losers ?? []), newRound]
      } else if (section === 'consolation') {
        b.consolation = [...(b.consolation ?? []), newRound]
      }
      return b
    })
    // Insert a DB match row for the new round
    const sectionArr = section === 'winners'
      ? (structure.rounds ?? structure.winners ?? [])
      : section === 'losers' ? (structure.losers ?? [])
      : (structure.consolation ?? [])
    const newRi = sectionArr.length  // index of the new round
    await supabase.from('matches').insert({
      round_index: newRi, match_index: 0,
      bracket_section: section === 'consolation' ? 'consolation' : section,
      section_round_index: newRi,
      player1_id: null, player2_id: null,
      rounds: [], total_net1: 0, total_net2: 0, status: 'pending',
    })
  }

  const addMatch = async (section, sectionIndex) => {
    await mutateBracket(b => {
      const getRounds = () => {
        if (section === 'winners') return b.rounds ?? b.winners ?? []
        if (section === 'losers') return b.losers ?? []
        return b.consolation ?? []
      }
      const setRounds = (arr) => {
        if (section === 'winners') { if (b.rounds) b.rounds = arr; else b.winners = arr }
        else if (section === 'losers') b.losers = arr
        else b.consolation = arr
      }
      const rounds = getRounds()
      const newMatch = { id: Math.random().toString(36).slice(2,9), p1: null, p2: null, isBye: false, score1: 0, score2: 0, winner: null }
      setRounds(rounds.map((r, ri) => ri === sectionIndex ? { ...r, matches: [...(r.matches ?? []), newMatch] } : r))
      return b
    })
    const roundMatches = (section === 'winners'
      ? (structure.rounds ?? structure.winners ?? [])
      : section === 'losers' ? (structure.losers ?? [])
      : (structure.consolation ?? []))[sectionIndex]?.matches ?? []
    await supabase.from('matches').insert({
      round_index: sectionIndex, match_index: roundMatches.length,
      bracket_section: section === 'consolation' ? 'consolation' : section,
      section_round_index: sectionIndex,
      player1_id: null, player2_id: null,
      rounds: [], total_net1: 0, total_net2: 0, status: 'pending',
    })
  }

  const deleteMatch = async (section, sectionIndex, matchIndex) => {
    if (!window.confirm('Remove this match?')) return
    // Remove from bracket JSON
    await mutateBracket(b => {
      const getRounds = () => section === 'winners' ? (b.rounds ?? b.winners ?? []) : section === 'losers' ? (b.losers ?? []) : (b.consolation ?? [])
      const setRounds = (arr) => { if (section === 'winners') { if (b.rounds) b.rounds = arr; else b.winners = arr } else if (section === 'losers') b.losers = arr; else b.consolation = arr }
      setRounds(getRounds().map((r, ri) => ri === sectionIndex ? { ...r, matches: (r.matches ?? []).filter((_, mi) => mi !== matchIndex) } : r))
      return b
    })
    // Find and delete the DB row
    const dbMatch = getDbMatch(section, sectionIndex, matchIndex)
    if (dbMatch) await supabase.from('matches').delete().eq('id', dbMatch.id)
  }

  const deleteRound = async (section, sectionIndex) => {
    if (!window.confirm(`Remove this entire round? All matches in it will be deleted.`)) return
    await mutateBracket(b => {
      const getRounds = () => section === 'winners' ? (b.rounds ?? b.winners ?? []) : section === 'losers' ? (b.losers ?? []) : (b.consolation ?? [])
      const setRounds = (arr) => { if (section === 'winners') { if (b.rounds) b.rounds = arr; else b.winners = arr } else if (section === 'losers') b.losers = arr; else b.consolation = arr }
      setRounds(getRounds().filter((_, ri) => ri !== sectionIndex))
      return b
    })
    // Delete all DB match rows for this round
    const roundMatches = matches.filter(m =>
      (m.bracket_section === section || (!m.bracket_section && section === 'winners')) &&
      (m.section_round_index ?? m.round_index) === sectionIndex
    )
    await Promise.all(roundMatches.map(m => supabase.from('matches').delete().eq('id', m.id)))
  }

  const addConsolationBracket = async () => {
    await mutateBracket(b => {
      b.consolation = [{ matches: [{ id: Math.random().toString(36).slice(2,9), p1: null, p2: null, isBye: false, score1: 0, score2: 0, winner: null }], name: '3rd Place Match', type: 'consolation' }]
      return b
    })
    await supabase.from('matches').insert({
      round_index: 0, match_index: 0,
      bracket_section: 'consolation', section_round_index: 0,
      player1_id: null, player2_id: null,
      rounds: [], total_net1: 0, total_net2: 0, status: 'pending',
    })
  }

  // Assign a player to a live match slot

  // Assign a player to a live match slot
  const assignLiveSlot = async (player) => {
    if (!pickerTarget) return
    const { matchId, field, current } = pickerTarget
    if (current && current.id !== player?.id) {
      setConfirmOverwrite({ matchId, field, player, existing: current })
      setPickerTarget(null)
      return
    }
    await doAssignLiveSlot(matchId, field, player)
    setPickerTarget(null)
  }

  const doAssignLiveSlot = async (matchId, field, player) => {
    await supabase.from('matches').update({
      [field]: player?.id || null,
      updated_at: new Date().toISOString()
    }).eq('id', matchId)

    // Also update the bracket JSON in tournament for consistency
    const { data } = await supabase.from('tournament').select('bracket').eq('id','season6').single()
    if (!data?.bracket) return
    const bracket = data.bracket
    const match = matches.find(m => m.id === matchId)
    if (!match) return
    const section = match.bracket_section || 'winners'
    const sri = match.section_round_index ?? match.round_index ?? 0
    const mi = match.match_index ?? 0
    const playerObj = player || null
    const playerKey = field === 'player1_id' ? 'p1' : 'p2'

    const updateRounds = (rounds) => rounds?.map((r, ri) =>
      ri === sri ? { ...r, matches: (r.matches ?? []).map((m, mmi) =>
        mmi === mi ? { ...m, [playerKey]: playerObj } : m
      )} : r
    )
    const updated = { ...bracket }
    if (section === 'winners') {
      if (updated.rounds) updated.rounds = updateRounds(updated.rounds)
      else if (updated.winners) updated.winners = updateRounds(updated.winners)
    } else if (section === 'losers') {
      updated.losers = updateRounds(updated.losers)
    } else if (section === 'grand_final') {
      updated.grandFinal = { ...updated.grandFinal, matches: (updated.grandFinal?.matches ?? []).map((m, mmi) =>
        mmi === mi ? { ...m, [playerKey]: playerObj } : m
      )}
    }
    await supabase.from('tournament').update({ bracket: updated, updated_at: new Date().toISOString() }).eq('id','season6')
  }

  // Derive current seed list from bracket structure
  const deriveSeedList = () => {
    const isSingle = !structure.type || structure.type === 'single'
    const round0 = isSingle
      ? (structure.rounds?.[0]?.matches ?? [])
      : (structure.winners?.[0]?.matches ?? [])
    const seeds = []
    round0.forEach(m => {
      seeds.push(m.p1 || null)
      seeds.push(m.p2 || null)
    })
    return seeds
  }
  const seedList = deriveSeedList()

  const isSingle = !structure.type || structure.type === 'single'
  const rounds    = isSingle ? (structure.rounds  ?? []) : null
  const winners   = !isSingle ? (structure.winners ?? []) : null
  const losers    = !isSingle ? (structure.losers  ?? []) : null
  const grandFinal = !isSingle
    ? (structure.grandFinal ?? { matches: [], name:'Grand Final', type:'grand_final' })
    : null

  if (isSingle && rounds.length === 0) return (
    <div style={{ padding:40, textAlign:'center' }}>
      <p style={{ color:'var(--cream-dim)', fontFamily:'IM Fell English', fontStyle:'italic', fontSize:14 }}>Bracket is empty. Reset and regenerate.</p>
      {isCommissioner && <button onClick={onReset} style={{ marginTop:16, padding:'8px 20px', borderRadius:8, border:'1px solid var(--red-accent)', background:'none', color:'var(--red-accent)', cursor:'pointer', fontFamily:'Cinzel', fontSize:12 }}>Reset Bracket</button>}
    </div>
  )

  const getChampion = () => {
    const finalMatch = isSingle
      ? getDbMatch('winners', rounds.length - 1, 0)
      : getDbMatch('grand_final', 0, 0)
    return finalMatch?.winner_id ? getPlayer(finalMatch.winner_id) : null
  }
  const champ = getChampion()

  const renderRoundColumn = (round, ri, section) => {
    if (!round) return null
    const safeMatches = round.matches ?? []
    const totalInSection = section === 'winners' ? (rounds || winners || []).length
      : section === 'losers' ? (losers || []).length
      : section === 'consolation' ? (structure.consolation ?? []).length : 1
    const displayName = round.name || (section === 'grand_final' ? 'Grand Final' : section === 'consolation' ? '3rd Place' : getDefaultRoundName(ri, totalInSection, section))
    return (
      <div key={`${section}-${ri}`} style={{ flex:1, minWidth:168, display:'flex', flexDirection:'column' }}>
        <RoundHeader
          name={displayName} section={section} isCommissioner={isCommissioner}
          onRename={name => renameRound(section, ri, name)}
          onDelete={isCommissioner && section !== 'grand_final' ? () => deleteRound(section, ri) : null} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-start', padding:'10px 5px', borderRight:'1px solid var(--border)', gap:4 }}>
          {safeMatches.map((bm, mi) => (
            <div key={bm?.id || mi} style={{ position:'relative' }}>
              <MatchCard
                bracketMatch={bm ?? {}}
                dbMatch={getDbMatch(section, ri, mi)}
                players={players}
                isCommissioner={isCommissioner}
                onClickScore={openMatch}
                onAssignSlot={(dbMatch, field, current) => setPickerTarget({ matchId: dbMatch.id, field, current })} />
              {isCommissioner && (
                <button onClick={() => deleteMatch(section, ri, mi)}
                  title="Remove match"
                  style={{ position:'absolute', top:2, right:2, background:'none', border:'none',
                    color:'var(--red-accent)', cursor:'pointer', fontSize:11, opacity:0.4, lineHeight:1,
                    padding:'1px 3px' }}
                  onMouseEnter={e => e.currentTarget.style.opacity='1'}
                  onMouseLeave={e => e.currentTarget.style.opacity='0.4'}>×</button>
              )}
            </div>
          ))}
          {isCommissioner && (
            <button onClick={() => addMatch(section, ri)}
              style={{ margin:'4px 4px 0', padding:'5px 0', borderRadius:7,
                border:'1px dashed var(--border)', background:'transparent',
                color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:9,
                letterSpacing:2, cursor:'pointer', textTransform:'uppercase' }}>
              + Match
            </button>
          )}
        </div>
      </div>
    )
  }

  // All used player IDs across live matches
  const usedIds = new Set(matches.flatMap(m => [m.player1_id, m.player2_id].filter(Boolean)))

  return (
    <div style={{ padding:'14px 10px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, flexWrap:'wrap', gap:8 }}>
        <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:4, textTransform:'uppercase', margin:0 }}>
          Season 6 · {isSingle ? 'Single' : 'Double'} Elimination
        </p>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {isCommissioner && (
            <>
              <button onClick={() => addRound('winners', '')}
                style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--gold-dark)', background:'transparent', color:'var(--gold-dark)', cursor:'pointer', fontSize:10, fontFamily:'Cinzel', letterSpacing:1 }}>
                + Round
              </button>
              {!structure.consolation && (
                <button onClick={addConsolationBracket}
                  style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #8b5cf6', background:'transparent', color:'#8b5cf6', cursor:'pointer', fontSize:10, fontFamily:'Cinzel', letterSpacing:1 }}>
                  + 3rd Place
                </button>
              )}
              <button onClick={onReset} style={{ padding:'5px 10px', borderRadius:7, border:'1px solid var(--red-accent)', background:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:10, fontFamily:'Cinzel' }}>Reset</button>
            </>
          )}
        </div>
      </div>

      {/* Seed list panel — derived from live bracket */}
      {isCommissioner && (
        <details style={{ marginBottom:12 }}>
          <summary style={{ fontFamily:'Cinzel', color:'var(--gold-dark)', fontSize:10, letterSpacing:3, textTransform:'uppercase', cursor:'pointer', userSelect:'none', padding:'6px 0' }}>
            ▸ Current Seed Order (from bracket)
          </summary>
          <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:'10px 12px', border:'1px solid var(--border)', marginTop:6, display:'flex', flexWrap:'wrap', gap:8 }}>
            {seedList.map((p, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6, background:'var(--charcoal-3)', borderRadius:7, padding:'5px 10px', border:'1px solid var(--border)' }}>
                <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:10 }}>#{i+1}</span>
                <Avatar player={p} size={22} />
                <span style={{ color: p ? 'var(--cream)' : 'var(--charcoal-4)', fontSize:11, fontFamily:'Cinzel' }}>{p ? p.name : 'BYE'}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div style={{ overflowX:'auto', paddingBottom:16 }}>
        {isSingle && (
          <div style={{ display:'flex', gap:0, minWidth: rounds.length * 173 + 140 }}>
            {rounds.map((r, ri) => renderRoundColumn(r, ri, 'winners'))}
            <ChampionColumn champ={champ} />
          </div>
        )}
        {!isSingle && (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            <div style={{ marginBottom:4 }}>
              <div style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:9, letterSpacing:4, textTransform:'uppercase', padding:'6px 8px', background:'var(--charcoal-3)', borderRadius:'8px 8px 0 0', borderBottom:'1px solid var(--border)' }}>Winners Bracket</div>
              <div style={{ display:'flex', gap:0, overflowX:'auto' }}>{winners.map((r, ri) => renderRoundColumn(r, ri, 'winners'))}</div>
            </div>
            <div style={{ marginBottom:4 }}>
              <div style={{ fontFamily:'Cinzel', color:'#ef4444', fontSize:9, letterSpacing:4, textTransform:'uppercase', padding:'6px 8px', background:'var(--charcoal-3)', borderBottom:'1px solid var(--border)' }}>Losers Bracket</div>
              <div style={{ display:'flex', gap:0, overflowX:'auto' }}>{losers.map((r, ri) => renderRoundColumn(r, ri, 'losers'))}</div>
            </div>
            <div>
              <div style={{ display:'flex', gap:0 }}>
                {renderRoundColumn(grandFinal, 0, 'grand_final')}
                <ChampionColumn champ={champ} />
              </div>
            </div>
          </div>
        )}
        {/* Consolation / 3rd place bracket */}
        {structure.consolation && structure.consolation.length > 0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ fontFamily:'Cinzel', color:'#8b5cf6', fontSize:9, letterSpacing:4, textTransform:'uppercase', padding:'6px 8px', background:'var(--charcoal-3)', borderRadius:'8px 8px 0 0', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <span>Consolation Bracket</span>
              {isCommissioner && <button onClick={() => addRound('consolation', '')} style={{ background:'none', border:'none', color:'#8b5cf6', cursor:'pointer', fontSize:10, fontFamily:'Cinzel' }}>+ Round</button>}
            </div>
            <div style={{ display:'flex', gap:0, overflowX:'auto' }}>
              {structure.consolation.map((r, ri) => renderRoundColumn(r, ri, 'consolation'))}
            </div>
          </div>
        )}
      </div>

      {/* Live slot picker */}
      {pickerTarget && (
        <SlotPicker
          slotLabel={`Reassign Slot`}
          currentPlayer={pickerTarget.current}
          players={players}
          usedIds={usedIds}
          onAssign={assignLiveSlot}
          onBye={() => { doAssignLiveSlot(pickerTarget.matchId, pickerTarget.field, null); setPickerTarget(null) }}
          onClear={() => { doAssignLiveSlot(pickerTarget.matchId, pickerTarget.field, null); setPickerTarget(null) }}
          onClose={() => setPickerTarget(null)}
        />
      )}

      {/* Overwrite warning */}
      {confirmOverwrite && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:3000,
          display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(3px)' }}>
          <div style={{ background:'var(--charcoal-2)', border:'1px solid #f59e0b66', borderRadius:14, padding:'24px 20px', maxWidth:320, textAlign:'center' }}>
            <p style={{ fontFamily:'Cinzel', color:'#f59e0b', fontSize:11, letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>⚠ Slot Occupied</p>
            <p style={{ color:'var(--cream)', fontSize:13, marginBottom:20 }}>
              This slot has <strong>{confirmOverwrite.existing?.name}</strong>. Replace with <strong>{confirmOverwrite.player?.name}</strong>?
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { doAssignLiveSlot(confirmOverwrite.matchId, confirmOverwrite.field, confirmOverwrite.player); setConfirmOverwrite(null) }}
                style={{ flex:1, padding:'9px 0', borderRadius:8, border:'1px solid var(--gold)', background:'var(--gold)', color:'var(--charcoal)', fontFamily:'Cinzel', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                Replace
              </button>
              <button onClick={() => setConfirmOverwrite(null)}
                style={{ flex:1, padding:'9px 0', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:12, cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Round Header ─────────────────────────────────────────────────────────────
function RoundHeader({ name, section, isCommissioner, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  const save = () => { onRename(val); setEditing(false) }
  const textColor = section === 'losers' ? '#ef4444' : section === 'consolation' ? '#8b5cf6' : 'var(--gold)'
  const borderColor = section === 'losers' ? '#ef444433' : section === 'grand_final' ? 'var(--gold-dark)' : section === 'consolation' ? '#8b5cf644' : 'var(--border)'
  return (
    <div style={{ padding:'5px 6px', background:'var(--charcoal-2)',
      borderBottom:`1px solid ${borderColor}`, borderRight:'1px solid var(--border)', minHeight:32,
      display:'flex', alignItems:'center', justifyContent:'space-between', gap:4 }}>
      {editing
        ? <input autoFocus value={val} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={e => e.key==='Enter'&&save()}
            style={{ background:'transparent', border:'none', borderBottom:'1px solid var(--gold)', color:textColor,
              fontFamily:'Cinzel', fontSize:9, letterSpacing:2, textAlign:'center', outline:'none', flex:1 }} />
        : <span style={{ fontFamily:'Cinzel', color:textColor, fontSize:9, letterSpacing:2, textTransform:'uppercase', flex:1, textAlign:'center' }}>{name}</span>}
      <div style={{ display:'flex', gap:2, flexShrink:0 }}>
        {isCommissioner && !editing && <button onClick={() => { setVal(name); setEditing(true) }} style={{ background:'none', border:'none', color:'var(--gold-dark)', cursor:'pointer', fontSize:10, padding:'0 2px', lineHeight:1, opacity:0.5 }}>✎</button>}
        {isCommissioner && onDelete && <button onClick={onDelete} style={{ background:'none', border:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:12, padding:'0 2px', lineHeight:1, opacity:0.4 }} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.4'}>🗑</button>}
      </div>
    </div>
  )
}

function ChampionColumn({ champ }) {
  return (
    <div style={{ minWidth:140, display:'flex', flexDirection:'column' }}>
      <div style={{ textAlign:'center', padding:'7px 4px', background:'var(--charcoal-2)', borderBottom:'1px solid var(--border)' }}>
        <p style={{ fontFamily:'Cinzel Decorative', color:'var(--gold)', fontSize:9, letterSpacing:2, margin:0 }}>Champion</p>
      </div>
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', padding:14 }}>
        {champ
          ? <div style={{ textAlign:'center' }}>
              <Avatar player={champ} size={56} ring />
              <p style={{ color:'var(--gold)', fontFamily:'Cinzel', fontWeight:700, fontSize:11, margin:'7px 0 2px' }}>{champ.name}</p>
              <p style={{ color:'var(--gold-dark)', fontSize:9, fontFamily:'IM Fell English', fontStyle:'italic', margin:0 }}>Season 6 Champion</p>
            </div>
          : <p style={{ color:'var(--charcoal-4)', fontSize:11, textAlign:'center', fontFamily:'IM Fell English', fontStyle:'italic' }}>To be decided</p>}
      </div>
    </div>
  )
}

// ─── Main BracketTab ──────────────────────────────────────────────────────────
export function BracketTab({ players, tournament, matches, isCommissioner, setActiveMatch, setTab }) {
  const structure = tournament?.bracket

  const handleGenerate = async (structure) => {
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({ id:'season6', bracket:structure, status:'active', updated_at:new Date().toISOString() })
    const insertMatch = async (round, ri, section) => {
      const promises = (round.matches ?? []).map((m, mi2) => {
        if (m.isBye || (!m.p1 && !m.p2)) return Promise.resolve()
        return supabase.from('matches').insert({
          round_index: ri, match_index: mi2,
          bracket_section: section, section_round_index: ri,
          player1_id: m.p1?.id || null, player2_id: m.p2?.id || null,
          rounds:[], total_net1:0, total_net2:0, status:'pending',
        })
      })
      await Promise.all(promises)
    }
    if (structure.type === 'single') {
      for (let ri = 0; ri < structure.rounds.length; ri++) await insertMatch(structure.rounds[ri], ri, 'winners')
    } else {
      for (let ri = 0; ri < structure.winners.length; ri++) await insertMatch(structure.winners[ri], ri, 'winners')
      for (let ri = 0; ri < structure.losers.length; ri++) await insertMatch(structure.losers[ri], ri, 'losers')
      await insertMatch(structure.grandFinal, 0, 'grand_final')
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Reset entire bracket? This cannot be undone.')) return
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({ id:'season6', bracket:null, status:'setup', updated_at:new Date().toISOString() })
  }

  if (!structure) {
    if (!isCommissioner) return (
      <div style={{ padding:'32px 20px', textAlign:'center' }}>
        <p style={{ color:'var(--cream-dim)', fontFamily:'IM Fell English', fontStyle:'italic', fontSize:15 }}>🔒 Commissioner access required to build the bracket.</p>
      </div>
    )
    return <BracketBuilder players={players} onGenerate={handleGenerate} />
  }

  return <BracketViewer structure={structure} matches={matches} players={players}
    isCommissioner={isCommissioner} onReset={handleReset} setActiveMatch={setActiveMatch} setTab={setTab} />
}
