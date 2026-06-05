import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { generateId, shuffle, getDefaultRoundName, COLORS } from '../lib/game'

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  label: { fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase' },
  segBtn: (active) => ({
    flex:1, padding:'8px 0', borderRadius:8,
    border:`1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--gold)' : 'transparent',
    color: active ? 'var(--charcoal)' : 'var(--cream-dim)',
    fontFamily:'Cinzel', fontWeight:700, fontSize:10, letterSpacing:1, cursor:'pointer', textTransform:'uppercase'
  }),
  ghostBtn: (color='var(--gold-dark)') => ({
    padding:'5px 10px', borderRadius:7,
    border:`1px dashed ${color}`, background:'transparent',
    color, fontFamily:'Cinzel', fontSize:9, letterSpacing:2, cursor:'pointer', textTransform:'uppercase'
  }),
  iconBtn: (color='var(--red-accent)') => ({
    background:'none', border:'none', color, cursor:'pointer',
    fontSize:13, padding:'0 3px', lineHeight:1, opacity:0.45,
    transition:'opacity 0.15s'
  }),
}

// ─── Player Picker Modal ──────────────────────────────────────────────────────
function PlayerPicker({ label, current, players, usedIds, onAssign, onClear, onBye, onClose }) {
  const [q, setQ] = useState('')
  const list = players.filter(p =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.nickname||'').toLowerCase().includes(q.toLowerCase())
  )
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:3000,
      display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'var(--charcoal-2)', border:'1px solid var(--border-bright)', borderRadius:14,
        padding:'20px 18px', width:310, maxHeight:'82vh', display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <p style={{ ...S.label, margin:0 }}>{label}</p>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--cream-dim)', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
        </div>
        <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search…"
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-3)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Oswald' }} />
        <div style={{ overflowY:'auto', display:'flex', flexDirection:'column', gap:5, flex:1 }}>
          {list.map(p => {
            const busy = usedIds.has(p.id) && p.id !== current?.id
            return (
              <button key={p.id} onClick={() => !busy && onAssign(p)} disabled={busy}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:9, textAlign:'left',
                  border:`1px solid ${p.id===current?.id ? 'var(--gold)' : 'var(--border)'}`,
                  background: p.id===current?.id ? '#c8a84b18' : 'var(--charcoal-3)',
                  cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.35 : 1 }}>
                <Avatar player={p} size={28} />
                <div style={{ flex:1 }}>
                  <p style={{ color:'var(--cream)', fontFamily:'Cinzel', fontSize:12, margin:0 }}>{p.name}</p>
                  {p.nickname && <p style={{ color:'var(--gold)', fontSize:10, margin:0, fontStyle:'italic' }}>"{p.nickname}"</p>}
                  {busy && <p style={{ color:'#f59e0b', fontSize:9, margin:0 }}>already in bracket</p>}
                </div>
              </button>
            )
          })}
          {list.length === 0 && <p style={{ color:'var(--cream-dim)', fontSize:12, textAlign:'center', padding:8 }}>No players found</p>}
        </div>
        <div style={{ display:'flex', gap:8, borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <button onClick={onBye} style={{ flex:1, padding:'7px 0', borderRadius:7, border:'1px solid #ef444466', background:'transparent', color:'#ef4444', fontFamily:'Cinzel', fontSize:9, cursor:'pointer', letterSpacing:2 }}>BYE</button>
          {current && <button onClick={onClear} style={{ flex:1, padding:'7px 0', borderRadius:7, border:'1px solid var(--border)', background:'transparent', color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:9, cursor:'pointer', letterSpacing:2 }}>CLEAR</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Freeform Bracket Builder ─────────────────────────────────────────────────
// No algorithms. Commissioner builds from scratch: add sections, add rounds, add matches, assign players.
function FreeformBuilder({ players, onGenerate }) {
  // A "section" is a named group of rounds: e.g. "Pre-Round", "Main Bracket", "Consolation"
  // Structure: { sections: [ { id, name, type, rounds: [ { id, name, matches: [ { id, p1, p2, isBye } ] } ] } ] }
  const [sections, setSections] = useState([
    { id: generateId(), name: 'Main Bracket', type: 'winners', rounds: [
      { id: generateId(), name: '', matches: [
        { id: generateId(), p1: null, p2: null, isBye: false },
        { id: generateId(), p1: null, p2: null, isBye: false },
      ]}
    ]}
  ])
  const [picker, setPicker] = useState(null) // { secId, rndId, matchId, slot, current }
  const [generating, setGenerating] = useState(false)
  const dragRef = useRef(null)

  // ── Section helpers ──
  const addSection = (type='winners') => {
    const names = { winners:'Main Bracket', losers:'Losers Bracket', consolation:'Consolation', pre:'Pre-Round', grand_final:'Grand Final' }
    setSections(s => [...s, {
      id: generateId(), name: names[type] || 'New Section', type,
      rounds: [{ id: generateId(), name: '', matches: [{ id: generateId(), p1: null, p2: null, isBye: false }] }]
    }])
  }
  const removeSection = (secId) => setSections(s => s.filter(x => x.id !== secId))
  const updateSection = (secId, patch) => setSections(s => s.map(x => x.id===secId ? {...x,...patch} : x))

  // ── Round helpers ──
  const addRound = (secId) => setSections(s => s.map(x => x.id===secId
    ? {...x, rounds:[...x.rounds, { id:generateId(), name:'', matches:[{ id:generateId(), p1:null, p2:null, isBye:false }] }]}
    : x))
  const removeRound = (secId, rndId) => setSections(s => s.map(x => x.id===secId
    ? {...x, rounds:x.rounds.filter(r => r.id!==rndId)}
    : x))
  const updateRound = (secId, rndId, patch) => setSections(s => s.map(x => x.id===secId
    ? {...x, rounds:x.rounds.map(r => r.id===rndId ? {...r,...patch} : r)}
    : x))

  // ── Match helpers ──
  const addMatch = (secId, rndId) => setSections(s => s.map(x => x.id===secId
    ? {...x, rounds:x.rounds.map(r => r.id===rndId
        ? {...r, matches:[...r.matches, { id:generateId(), p1:null, p2:null, isBye:false }]}
        : r)}
    : x))
  const removeMatch = (secId, rndId, matchId) => setSections(s => s.map(x => x.id===secId
    ? {...x, rounds:x.rounds.map(r => r.id===rndId
        ? {...r, matches:r.matches.filter(m => m.id!==matchId)}
        : r)}
    : x))
  const updateMatch = (secId, rndId, matchId, patch) => setSections(s => s.map(x => x.id===secId
    ? {...x, rounds:x.rounds.map(r => r.id===rndId
        ? {...r, matches:r.matches.map(m => m.id===matchId ? {...m,...patch} : m)}
        : r)}
    : x))

  // ── Player assignment ──
  const allUsed = new Set(sections.flatMap(sec => sec.rounds.flatMap(r => r.matches.flatMap(m => [m.p1?.id, m.p2?.id].filter(Boolean)))))

  const openPicker = (secId, rndId, matchId, slot, current) => setPicker({ secId, rndId, matchId, slot, current })

  const assignPlayer = (p) => {
    const { secId, rndId, matchId, slot } = picker
    // If player is already somewhere, clear them first
    setSections(s => s.map(sec => ({...sec, rounds:sec.rounds.map(r => ({...r,
      matches:r.matches.map(m => {
        let updated = {...m}
        if (m.p1?.id === p.id) updated.p1 = null
        if (m.p2?.id === p.id) updated.p2 = null
        if (sec.id===secId && r.id===rndId && m.id===matchId) updated[slot] = p
        return updated
      })
    }))})))
    setPicker(null)
  }

  const clearSlot = () => {
    const { secId, rndId, matchId, slot } = picker
    updateMatch(secId, rndId, matchId, { [picker.slot]: null })
    setPicker(null)
  }

  const setByeSlot = () => {
    const { secId, rndId, matchId } = picker
    updateMatch(secId, rndId, matchId, { isBye: true, p1: null, p2: null })
    setPicker(null)
  }

  // ── Quick fill helpers ──
  const fillRoundRandom = (secId, rndId) => {
    const sec = sections.find(x=>x.id===secId)
    const rnd = sec?.rounds.find(r=>r.id===rndId)
    if (!rnd) return
    const emptySlots = [] // { matchId, slot }
    rnd.matches.forEach(m => {
      if (!m.p1) emptySlots.push({ matchId:m.id, slot:'p1' })
      if (!m.p2) emptySlots.push({ matchId:m.id, slot:'p2' })
    })
    const used = new Set(sections.flatMap(sec2=>sec2.rounds.flatMap(r2=>r2.matches.flatMap(m=>[m.p1?.id,m.p2?.id].filter(Boolean)))))
    const available = shuffle(players.filter(p => !used.has(p.id)))
    setSections(s => s.map(x => x.id!==secId ? x : {...x, rounds:x.rounds.map(r => r.id!==rndId ? r : {
      ...r, matches:r.matches.map(m => {
        let mm = {...m}
        if (!mm.p1 && available.length) mm.p1 = available.shift()
        if (!mm.p2 && available.length) mm.p2 = available.shift()
        return mm
      })
    })}))
  }

  // ── Drag to reorder matches within a round ──
  const onDragStart = (e, secId, rndId, idx) => { dragRef.current = { secId, rndId, idx } }
  const onDrop = (e, secId, rndId, toIdx) => {
    e.preventDefault()
    const from = dragRef.current
    if (!from || from.secId!==secId || from.rndId!==rndId || from.idx===toIdx) return
    setSections(s => s.map(x => x.id!==secId ? x : {...x, rounds:x.rounds.map(r => {
      if (r.id!==rndId) return r
      const ms = [...r.matches]
      const [moved] = ms.splice(from.idx, 1)
      ms.splice(toIdx, 0, moved)
      return {...r, matches:ms}
    })}))
    dragRef.current = null
  }

  // ── Move section up/down ──
  const moveSection = (idx, dir) => setSections(s => {
    const arr = [...s]
    const to = idx + dir
    if (to < 0 || to >= arr.length) return arr;
    [arr[idx], arr[to]] = [arr[to], arr[idx]]
    return arr
  })

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      // Convert freeform sections → bracket structure
      // We store it as a "freeform" type so the viewer knows to render all sections freely
      const structure = {
        type: 'freeform',
        sections: sections.map((sec, si) => ({
          ...sec,
          rounds: sec.rounds.map((r, ri) => ({
            ...r,
            matches: r.matches.map(m => ({ ...m, score1:0, score2:0, winner:null }))
          }))
        }))
      }
      await onGenerate(structure)
    } finally { setGenerating(false) }
  }

  const sectionColors = { winners:'var(--gold)', losers:'#ef4444', consolation:'#8b5cf6', pre:'#10b981', grand_final:'var(--gold)' }
  const totalMatches = sections.reduce((a,s)=>a+s.rounds.reduce((b,r)=>b+r.matches.length,0),0)
  const assignedPlayers = new Set(sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[m.p1?.id,m.p2?.id].filter(Boolean)))))
  const unassigned = players.filter(p=>!assignedPlayers.has(p.id))

  return (
    <div style={{ padding:'16px', maxWidth:700, margin:'0 auto' }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ ...S.label, fontSize:13, letterSpacing:5, display:'block', marginBottom:4 }}>Build Bracket</h2>
        <p style={{ color:'var(--cream-dim)', fontSize:12 }}>Season 6 · Full Commissioner Control</p>
      </div>

      {players.length < 2 && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:12, color:'#f59e0b', marginBottom:14, border:'1px solid #f59e0b44', fontSize:12 }}>
          ⚠ Add at least 2 players first.
        </div>
      )}

      {/* Unassigned players reminder */}
      {unassigned.length > 0 && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:'9px 14px', marginBottom:14,
          border:'1px solid #f59e0b33', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ color:'#f59e0b', fontSize:11, fontFamily:'Cinzel', letterSpacing:1 }}>NOT YET PLACED:</span>
          {unassigned.map(p => (
            <span key={p.id} style={{ display:'flex', alignItems:'center', gap:4, background:'var(--charcoal-3)', borderRadius:6, padding:'3px 8px' }}>
              <Avatar player={p} size={18} />
              <span style={{ color:'var(--cream-dim)', fontSize:11 }}>{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Sections */}
      {sections.map((sec, si) => {
        const col = sectionColors[sec.type] || 'var(--gold)'
        return (
          <div key={sec.id} style={{ background:'var(--charcoal-2)', borderRadius:14, border:`1px solid ${col}33`, marginBottom:14, overflow:'hidden' }}>
            {/* Section header */}
            <div style={{ background:'var(--charcoal-3)', padding:'10px 14px', display:'flex', alignItems:'center', gap:8, borderBottom:`1px solid ${col}33` }}>
              <div style={{ width:3, height:20, borderRadius:2, background:col, flexShrink:0 }} />
              <input value={sec.name} onChange={e=>updateSection(sec.id,{name:e.target.value})}
                style={{ flex:1, background:'transparent', border:'none', color:col, fontFamily:'Cinzel',
                  fontWeight:700, fontSize:12, letterSpacing:2, outline:'none', textTransform:'uppercase' }} />
              {/* Section type */}
              <select value={sec.type} onChange={e=>updateSection(sec.id,{type:e.target.value})}
                style={{ background:'var(--charcoal-2)', border:'1px solid var(--border)', color:'var(--cream-dim)',
                  fontFamily:'Cinzel', fontSize:9, borderRadius:6, padding:'3px 6px', cursor:'pointer', outline:'none' }}>
                <option value="pre">Pre-Round</option>
                <option value="winners">Winners</option>
                <option value="losers">Losers</option>
                <option value="consolation">Consolation</option>
                <option value="grand_final">Grand Final</option>
              </select>
              {/* Move up/down */}
              <button onClick={()=>moveSection(si,-1)} disabled={si===0} style={{ background:'none', border:'none', color:'var(--cream-dim)', cursor:'pointer', fontSize:13, opacity: si===0 ? 0.2 : 0.6, padding:'0 2px' }}>↑</button>
              <button onClick={()=>moveSection(si,1)} disabled={si===sections.length-1} style={{ background:'none', border:'none', color:'var(--cream-dim)', cursor:'pointer', fontSize:13, opacity: si===sections.length-1 ? 0.2 : 0.6, padding:'0 2px' }}>↓</button>
              <button onClick={()=>removeSection(sec.id)} style={{ background:'none', border:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:16, opacity:0.5, padding:'0 4px' }}
                onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.5'}>×</button>
            </div>

            {/* Rounds */}
            <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:10 }}>
              {sec.rounds.map((rnd, ri) => (
                <div key={rnd.id} style={{ background:'var(--charcoal-3)', borderRadius:10, overflow:'hidden', border:'1px solid var(--border)' }}>
                  {/* Round header */}
                  <div style={{ padding:'7px 12px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid var(--border)', background:'var(--charcoal-2)' }}>
                    <input value={rnd.name}
                      onChange={e=>updateRound(sec.id,rnd.id,{name:e.target.value})}
                      placeholder={`Round ${ri+1}`}
                      style={{ flex:1, background:'transparent', border:'none', color:'var(--cream-dim)',
                        fontFamily:'Cinzel', fontSize:9, letterSpacing:2, outline:'none', textTransform:'uppercase' }} />
                    <button onClick={()=>fillRoundRandom(sec.id,rnd.id)} style={S.ghostBtn('#10b981')}>🎲 Fill</button>
                    <button onClick={()=>addMatch(sec.id,rnd.id)} style={S.ghostBtn()}>+ Match</button>
                    <button onClick={()=>removeRound(sec.id,rnd.id)} style={S.iconBtn()} title="Remove round"
                      onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.45'}>🗑</button>
                  </div>

                  {/* Matches */}
                  <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
                    {rnd.matches.map((m, mi) => (
                      <div key={m.id} draggable
                        onDragStart={e=>onDragStart(e,sec.id,rnd.id,mi)}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={e=>onDrop(e,sec.id,rnd.id,mi)}
                        style={{ display:'flex', alignItems:'center', gap:6, background:'var(--charcoal-2)',
                          borderRadius:8, padding:'7px 10px', border:'1px solid var(--border)', cursor:'grab' }}>
                        <span style={{ color:'var(--charcoal-4)', fontSize:12, userSelect:'none' }}>⠿</span>
                        <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:9, width:18, flexShrink:0 }}>{mi+1}</span>

                        {m.isBye ? (
                          <div style={{ flex:1, display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ color:'#ef4444', fontFamily:'Cinzel', fontSize:11, letterSpacing:1 }}>BYE MATCH</span>
                            <button onClick={()=>updateMatch(sec.id,rnd.id,m.id,{isBye:false})}
                              style={{ ...S.ghostBtn('#ef4444'), padding:'2px 8px', fontSize:8 }}>Clear</button>
                          </div>
                        ) : (
                          <>
                            {/* P1 slot */}
                            <PlayerSlot player={m.p1} label="P1" onOpen={()=>openPicker(sec.id,rnd.id,m.id,'p1',m.p1)} />
                            <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:10, flexShrink:0 }}>vs</span>
                            {/* P2 slot */}
                            <PlayerSlot player={m.p2} label="P2" onOpen={()=>openPicker(sec.id,rnd.id,m.id,'p2',m.p2)} />
                          </>
                        )}

                        <button onClick={()=>removeMatch(sec.id,rnd.id,m.id)}
                          style={S.iconBtn()} title="Remove match"
                          onMouseEnter={e=>e.currentTarget.style.opacity='1'}
                          onMouseLeave={e=>e.currentTarget.style.opacity='0.45'}>×</button>
                      </div>
                    ))}

                    {rnd.matches.length === 0 && (
                      <p style={{ color:'var(--charcoal-4)', fontSize:11, textAlign:'center', padding:'4px 0', fontFamily:'IM Fell English', fontStyle:'italic' }}>
                        No matches — click + Match above
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Add round */}
              <button onClick={()=>addRound(sec.id)} style={{ ...S.ghostBtn(col), width:'100%', padding:'7px 0', textAlign:'center' }}>
                + Add Round to {sec.name || 'Section'}
              </button>
            </div>
          </div>
        )
      })}

      {/* Add section buttons */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        {[['pre','+ Pre-Round','#10b981'],['winners','+ Winners','var(--gold)'],['losers','+ Losers','#ef4444'],['consolation','+ Consolation','#8b5cf6'],['grand_final','+ Grand Final','#c8a84b']].map(([type,label,col])=>(
          <button key={type} onClick={()=>addSection(type)}
            style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${col}66`,
              background:'transparent', color:col, fontFamily:'Cinzel', fontSize:9,
              letterSpacing:1, cursor:'pointer', textTransform:'uppercase' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Lock in */}
      <button onClick={handleGenerate} disabled={generating || totalMatches===0}
        style={{ width:'100%', padding:'13px 0', borderRadius:10, border:'1px solid var(--gold)',
          background: totalMatches>0 ? 'var(--gold)' : 'transparent',
          color: totalMatches>0 ? 'var(--charcoal)' : 'var(--gold-dark)',
          fontFamily:'Cinzel Decorative', fontWeight:700, fontSize:14,
          cursor: totalMatches>0 ? 'pointer' : 'not-allowed', letterSpacing:1 }}>
        {generating ? 'Locking In…' : `⚔ Lock In Bracket  (${totalMatches} matches)`}
      </button>

      {/* Picker modal */}
      {picker && (
        <PlayerPicker label="Assign Player" current={picker.current} players={players} usedIds={allUsed}
          onAssign={assignPlayer}
          onClear={clearSlot}
          onBye={setByeSlot}
          onClose={()=>setPicker(null)} />
      )}
    </div>
  )
}

// ─── Player Slot button ───────────────────────────────────────────────────────
function PlayerSlot({ player, label, onOpen }) {
  return (
    <button onClick={onOpen}
      style={{ flex:1, display:'flex', alignItems:'center', gap:7, padding:'4px 8px', borderRadius:7,
        border:`1px solid ${player ? 'var(--border)' : 'var(--border)'}`,
        background: player ? 'var(--charcoal-3)' : '#ffffff08',
        cursor:'pointer', minWidth:0, textAlign:'left' }}>
      <Avatar player={player} size={22} />
      <span style={{ color: player ? 'var(--cream)' : 'var(--charcoal-4)', fontSize:11,
        fontFamily: player ? 'Cinzel' : 'Oswald', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
        {player ? player.name : `Tap to assign ${label}`}
      </span>
      <span style={{ color:'var(--gold-dark)', fontSize:9, flexShrink:0 }}>✎</span>
    </button>
  )
}

// ─── Live Bracket Viewer ──────────────────────────────────────────────────────
function BracketViewer({ structure, matches, players, isCommissioner, onReset, setActiveMatch, setTab }) {
  const [pickerTarget, setPickerTarget] = useState(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(null)

  const getPlayer = id => players.find(p => p.id === id)

  // Works for both freeform and legacy single/double
  const isFreeform = structure.type === 'freeform'
  const isSingle = !structure.type || structure.type === 'single'
  const rounds    = isSingle ? (structure.rounds ?? []) : null
  const winners   = !isSingle && !isFreeform ? (structure.winners ?? []) : null
  const losers    = !isSingle && !isFreeform ? (structure.losers  ?? []) : null
  const grandFinalRound = !isSingle && !isFreeform
    ? (structure.grandFinal ?? { matches:[], name:'Grand Final', type:'grand_final' }) : null

  // Freeform sections
  const sections = isFreeform ? (structure.sections ?? []) : null

  const openMatch = dbMatch => { setActiveMatch({ matchId: dbMatch.id }); setTab('Scoreboard') }

  const getDbMatch = (section, sectionId, roundId, matchIndex) => {
    if (isFreeform) {
      // freeform: match by bracket_section (sectionId) + section_round_index (encoded) + match_index
      return matches.find(m =>
        m.bracket_section === sectionId &&
        m.match_index === matchIndex &&
        m.freeform_round_id === roundId
      ) || matches.find(m =>
        m.bracket_section === sectionId &&
        m.match_index === matchIndex
      )
    }
    return matches.find(m =>
      m.match_index === matchIndex && (
        (m.bracket_section === section && (m.section_round_index ?? m.round_index) === (typeof sectionId === 'number' ? sectionId : 0)) ||
        (!m.bracket_section && section === 'winners' && m.round_index === sectionId)
      )
    )
  }

  // ── Live mutations ──
  const mutateBracket = async (updater) => {
    const { data } = await supabase.from('tournament').select('bracket').eq('id','season6').single()
    if (!data?.bracket) return
    const updated = updater(JSON.parse(JSON.stringify(data.bracket)))
    await supabase.from('tournament').update({ bracket: updated, updated_at: new Date().toISOString() }).eq('id','season6')
  }

  const renameRound = async (path, name) => {
    await mutateBracket(b => {
      if (isFreeform) {
        const { secIdx, rndIdx } = path
        if (b.sections?.[secIdx]?.rounds?.[rndIdx]) b.sections[secIdx].rounds[rndIdx].name = name
      } else {
        const { section, sri } = path
        const arr = section==='winners' ? (b.rounds ?? b.winners) : section==='losers' ? b.losers : null
        if (arr?.[sri]) arr[sri].name = name
        else if (section==='grand_final' && b.grandFinal) b.grandFinal.name = name
      }
      return b
    })
  }

  const renameSection = async (secIdx, name) => {
    await mutateBracket(b => { if (b.sections?.[secIdx]) b.sections[secIdx].name = name; return b })
  }

  const addLiveRound = async (secIdx) => {
    const newId = generateId()
    await mutateBracket(b => {
      if (!b.sections?.[secIdx]) return b
      b.sections[secIdx].rounds.push({ id: newId, name:'', matches:[{ id: generateId(), p1:null, p2:null, isBye:false }] })
      return b
    })
    const sec = structure.sections?.[secIdx]
    if (!sec) return
    const rndIdx = sec.rounds.length
    await supabase.from('matches').insert({
      round_index: rndIdx, match_index: 0,
      bracket_section: sec.id, section_round_index: rndIdx,
      freeform_round_id: newId,
      player1_id: null, player2_id: null,
      rounds:[], total_net1:0, total_net2:0, status:'pending'
    })
  }

  const addLiveMatch = async (secIdx, rndIdx) => {
    const sec = structure.sections?.[secIdx]
    const rnd = sec?.rounds?.[rndIdx]
    if (!rnd) return
    const mi = rnd.matches.length
    const newMatchId = generateId()
    await mutateBracket(b => {
      if (!b.sections?.[secIdx]?.rounds?.[rndIdx]) return b
      b.sections[secIdx].rounds[rndIdx].matches.push({ id:newMatchId, p1:null, p2:null, isBye:false })
      return b
    })
    await supabase.from('matches').insert({
      round_index: rndIdx, match_index: mi,
      bracket_section: sec.id, section_round_index: rndIdx,
      freeform_round_id: rnd.id,
      player1_id: null, player2_id: null,
      rounds:[], total_net1:0, total_net2:0, status:'pending'
    })
  }

  const deleteLiveMatch = async (secIdx, rndIdx, mi) => {
    if (!window.confirm('Remove this match?')) return
    const sec = structure.sections?.[secIdx]
    const rnd = sec?.rounds?.[rndIdx]
    const bm = rnd?.matches?.[mi]
    if (!bm) return
    await mutateBracket(b => {
      if (b.sections?.[secIdx]?.rounds?.[rndIdx])
        b.sections[secIdx].rounds[rndIdx].matches = b.sections[secIdx].rounds[rndIdx].matches.filter((_,i)=>i!==mi)
      return b
    })
    const dbm = getDbMatch(sec.id, sec.id, rnd.id, mi)
    if (dbm) await supabase.from('matches').delete().eq('id', dbm.id)
  }

  const deleteLiveRound = async (secIdx, rndIdx) => {
    if (!window.confirm('Remove this round and all its matches?')) return
    const sec = structure.sections?.[secIdx]
    const rnd = sec?.rounds?.[rndIdx]
    if (!rnd) return
    await mutateBracket(b => {
      if (b.sections?.[secIdx])
        b.sections[secIdx].rounds = b.sections[secIdx].rounds.filter((_,i)=>i!==rndIdx)
      return b
    })
    const toDelete = matches.filter(m => m.bracket_section===sec.id && m.freeform_round_id===rnd.id)
    await Promise.all(toDelete.map(m=>supabase.from('matches').delete().eq('id',m.id)))
  }

  const doAssignLiveSlot = async (matchId, field, player) => {
    await supabase.from('matches').update({ [field]: player?.id||null, updated_at: new Date().toISOString() }).eq('id', matchId)
    // Update bracket JSON
    await mutateBracket(b => {
      const pKey = field==='player1_id'?'p1':'p2'
      if (b.sections) {
        b.sections = b.sections.map(sec=>({...sec, rounds:sec.rounds.map(r=>({...r,
          matches:r.matches.map(m=>{
            const dbm = matches.find(x=>x.id===matchId)
            if (!dbm) return m
            const idx = r.matches.findIndex(x=>x.id===dbm.freeform_match_id||true)
            return m // bracket JSON p1/p2 are display only in freeform; DB is truth
          })
        }))}))
      }
      return b
    })
    setPickerTarget(null)
  }

  const assignLiveSlot = async (player) => {
    const { matchId, field, current } = pickerTarget
    if (current && current.id !== player?.id) {
      setConfirmOverwrite({ matchId, field, player, existing: current })
      setPickerTarget(null)
      return
    }
    await doAssignLiveSlot(matchId, field, player)
  }

  // Derive champion from last match of last section
  const getChampion = () => {
    if (isFreeform && sections?.length) {
      const lastSec = sections[sections.length-1]
      const lastRnd = lastSec?.rounds?.[lastSec.rounds.length-1]
      const lastMatch = lastRnd?.matches?.[0]
      if (!lastMatch) return null
      const dbm = getDbMatch(lastSec.id, lastSec.id, lastRnd.id, 0)
      return dbm?.winner_id ? getPlayer(dbm.winner_id) : null
    }
    if (isSingle) {
      const dbm = getDbMatch('winners', rounds.length-1, null, 0)
      return dbm?.winner_id ? getPlayer(dbm.winner_id) : null
    }
    const dbm = getDbMatch('grand_final', 0, null, 0)
    return dbm?.winner_id ? getPlayer(dbm.winner_id) : null
  }
  const champ = getChampion()

  const sectionColors = { winners:'var(--gold)', losers:'#ef4444', consolation:'#8b5cf6', pre:'#10b981', grand_final:'var(--gold)' }

  const usedIds = new Set(matches.flatMap(m=>[m.player1_id,m.player2_id].filter(Boolean)))

  // ── Render a single match card ──
  const renderMatchCard = (bm, dbm, secId, secIdx, rndIdx, mi) => {
    if (!bm) return null
    const p1 = dbm?.player1_id ? getPlayer(dbm.player1_id) : (bm.p1||null)
    const p2 = dbm?.player2_id ? getPlayer(dbm.player2_id) : (bm.p2||null)
    const s1 = dbm?.total_net1||0, s2 = dbm?.total_net2||0
    const wId = dbm?.winner_id
    const complete = dbm?.status==='complete'

    if (bm.isBye && !p1 && !p2) return (
      <div key={bm.id||mi} style={{ background:'var(--charcoal-3)', borderRadius:7, padding:'5px 9px',
        opacity:0.3, border:'1px dashed var(--border)', fontSize:10, color:'var(--cream-dim)',
        textAlign:'center', fontFamily:'Cinzel', marginBottom:4 }}>— BYE —</div>
    )

    return (
      <div key={bm.id||mi} style={{ position:'relative', marginBottom:5 }}>
        <div onClick={()=>dbm && openMatch(dbm)}
          style={{ background:'var(--charcoal-2)', borderRadius:9, padding:'7px 9px',
            border:`1.5px solid ${complete?'var(--gold-dark)':'var(--border)'}`,
            cursor: dbm ? 'pointer' : 'default', transition:'border-color 0.12s' }}
          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
          onMouseLeave={e=>e.currentTarget.style.borderColor=complete?'var(--gold-dark)':'var(--border)'}>
          {[{p:p1,s:s1,win:wId&&wId===p1?.id,field:'player1_id'},{p:p2,s:s2,win:wId&&wId===p2?.id,field:'player2_id'}].map(({p,s,win,field},i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:5, padding:'2px 0' }}>
              <div onClick={e=>{e.stopPropagation();dbm&&isCommissioner&&!complete&&setPickerTarget({matchId:dbm.id,field,current:p})}} style={{flexShrink:0}}>
                <Avatar player={p} size={20} />
              </div>
              <span style={{ flex:1, color:win?'var(--gold)':p?'var(--cream)':'var(--charcoal-4)',
                fontSize:11, fontFamily:win?'Cinzel':'Oswald', fontWeight:win?700:400,
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {p?(p.nickname?`"${p.nickname}"`:p.name):'TBD'}
              </span>
              <span style={{ color:win?'var(--gold)':'var(--cream-dim)', fontWeight:win?700:400, fontSize:12, fontFamily:'Cinzel', flexShrink:0 }}>{s}</span>
              {isCommissioner&&!complete&&dbm&&(
                <button onClick={e=>{e.stopPropagation();setPickerTarget({matchId:dbm.id,field,current:p})}}
                  style={{...S.iconBtn('var(--gold-dark)'),opacity:0.4,fontSize:9}}
                  onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.4'}>✎</button>
              )}
            </div>
          ))}
          {complete&&<div style={{fontSize:8,color:'var(--gold-dark)',fontFamily:'Cinzel',letterSpacing:2,marginTop:2,textAlign:'right'}}>FINAL</div>}
        </div>
        {isCommissioner&&isFreeform&&(
          <button onClick={()=>deleteLiveMatch(secIdx,rndIdx,mi)}
            style={{...S.iconBtn(),position:'absolute',top:1,right:1,fontSize:10}}
            onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.45'}>×</button>
        )}
      </div>
    )
  }

  // ── Render one round column ──
  const renderRoundCol = (rnd, ri, section, secIdx, secId) => {
    if (!rnd) return null
    const safeMatches = rnd.matches ?? []
    const totalInSec = isFreeform
      ? (structure.sections?.[secIdx]?.rounds?.length||1)
      : section==='losers' ? (losers?.length||1) : (rounds||winners||[]).length
    const displayName = rnd.name || (section==='grand_final'?'Grand Final': isFreeform ? `Round ${ri+1}` : getDefaultRoundName(ri,totalInSec,section))

    return (
      <div key={rnd.id||`${section}-${ri}`} style={{ flex:1, minWidth:165, display:'flex', flexDirection:'column' }}>
        {/* Round header */}
        <RoundHeaderLive name={displayName} section={section}
          isCommissioner={isCommissioner}
          onRename={name=>renameRound(isFreeform?{secIdx,rndIdx:ri}:{section,sri:ri},name)}
          onDelete={isCommissioner&&isFreeform ? ()=>deleteLiveRound(secIdx,ri) : null} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', padding:'8px 5px', borderRight:'1px solid var(--border)' }}>
          {safeMatches.map((bm,mi)=>{
            const dbm = isFreeform
              ? matches.find(m=>m.bracket_section===secId && m.freeform_round_id===rnd.id && m.match_index===mi)
                || matches.find(m=>m.bracket_section===secId && m.section_round_index===ri && m.match_index===mi)
              : getDbMatch(section, ri, null, mi)
            return renderMatchCard(bm,dbm,secId,secIdx,ri,mi)
          })}
          {isCommissioner&&isFreeform&&(
            <button onClick={()=>addLiveMatch(secIdx,ri)} style={{...S.ghostBtn(),padding:'4px 0',textAlign:'center',marginTop:2}}>+ Match</button>
          )}
        </div>
      </div>
    )
  }

  if (isSingle && rounds.length===0) return (
    <div style={{padding:40,textAlign:'center'}}>
      <p style={{color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic',fontSize:14}}>Bracket is empty. Reset and regenerate.</p>
      {isCommissioner&&<button onClick={onReset} style={{marginTop:16,padding:'8px 20px',borderRadius:8,border:'1px solid var(--red-accent)',background:'none',color:'var(--red-accent)',cursor:'pointer',fontFamily:'Cinzel',fontSize:12}}>Reset Bracket</button>}
    </div>
  )

  return (
    <div style={{padding:'12px 10px'}}>
      {/* Header bar */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <p style={{...S.label,letterSpacing:4,margin:0}}>Season 6 · {isFreeform?'Custom Bracket':isSingle?'Single Elim':'Double Elim'}</p>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {isCommissioner&&isFreeform&&(
            <>
              {[['pre','Pre-Round','#10b981'],['winners','Round','var(--gold)'],['consolation','Consolation','#8b5cf6'],['grand_final','Grand Final','var(--gold)']].map(([type,label,col])=>(
                <button key={type} onClick={()=>{
                  const newId=generateId()
                  const newRndId=generateId()
                  supabase.from('tournament').select('bracket').eq('id','season6').single().then(({data})=>{
                    if(!data?.bracket)return
                    const b=JSON.parse(JSON.stringify(data.bracket))
                    const names={pre:'Pre-Round',winners:'Main Bracket',consolation:'Consolation',grand_final:'Grand Final'}
                    b.sections.push({id:newId,name:names[type]||label,type,rounds:[{id:newRndId,name:'',matches:[{id:generateId(),p1:null,p2:null,isBye:false}]}]})
                    supabase.from('tournament').update({bracket:b,updated_at:new Date().toISOString()}).eq('id','season6')
                    supabase.from('matches').insert({round_index:0,match_index:0,bracket_section:newId,section_round_index:0,freeform_round_id:newRndId,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'})
                  })
                }}
                  style={{padding:'4px 10px',borderRadius:7,border:`1px solid ${col}55`,background:'transparent',color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase'}}>
                  + {label}
                </button>
              ))}
            </>
          )}
          {isCommissioner&&<button onClick={onReset} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--red-accent)',background:'none',color:'var(--red-accent)',cursor:'pointer',fontSize:10,fontFamily:'Cinzel'}}>Reset</button>}
        </div>
      </div>

      <div style={{overflowX:'auto',paddingBottom:16}}>
        {/* ── Freeform ── */}
        {isFreeform&&sections&&(
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {sections.map((sec,si)=>{
              const col=sectionColors[sec.type]||'var(--gold)'
              return (
                <div key={sec.id}>
                  {/* Section label */}
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',background:'var(--charcoal-3)',borderRadius:'8px 8px 0 0',borderBottom:`2px solid ${col}44`}}>
                    <div style={{width:3,height:14,borderRadius:2,background:col,flexShrink:0}}/>
                    <span style={{fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:3,textTransform:'uppercase',flex:1}}>{sec.name||`Section ${si+1}`}</span>
                    {isCommissioner&&(
                      <button onClick={()=>addLiveRound(si)} style={{...S.ghostBtn(col),padding:'2px 8px',fontSize:8}}>+ Round</button>
                    )}
                  </div>
                  <div style={{display:'flex',gap:0,minWidth:sec.rounds.length*170,overflowX:'auto'}}>
                    {sec.rounds.map((rnd,ri)=>renderRoundCol(rnd,ri,sec.type,si,sec.id))}
                  </div>
                </div>
              )
            })}
            {/* Champion */}
            {champ&&(
              <div style={{textAlign:'center',padding:'16px 0'}}>
                <p style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:10,letterSpacing:4,textTransform:'uppercase',marginBottom:12}}>🏆 Champion</p>
                <Avatar player={champ} size={64} ring/>
                <p style={{color:'var(--gold)',fontFamily:'Cinzel',fontWeight:700,fontSize:13,marginTop:8}}>{champ.name}</p>
                <p style={{color:'var(--gold-dark)',fontSize:10,fontFamily:'IM Fell English',fontStyle:'italic'}}>Season 6 Champion</p>
              </div>
            )}
          </div>
        )}

        {/* ── Single elim (legacy) ── */}
        {isSingle&&(
          <div style={{display:'flex',gap:0,minWidth:rounds.length*173+140}}>
            {rounds.map((r,ri)=>renderRoundCol(r,ri,'winners',-1,'winners'))}
            <LegacyChampionCol champ={champ}/>
          </div>
        )}

        {/* ── Double elim (legacy) ── */}
        {!isSingle&&!isFreeform&&(
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            <div style={{marginBottom:4}}>
              <div style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:9,letterSpacing:4,textTransform:'uppercase',padding:'6px 8px',background:'var(--charcoal-3)',borderRadius:'8px 8px 0 0',borderBottom:'1px solid var(--border)'}}>Winners Bracket</div>
              <div style={{display:'flex',gap:0,overflowX:'auto'}}>{winners.map((r,ri)=>renderRoundCol(r,ri,'winners',-1,'winners'))}</div>
            </div>
            <div style={{marginBottom:4}}>
              <div style={{fontFamily:'Cinzel',color:'#ef4444',fontSize:9,letterSpacing:4,textTransform:'uppercase',padding:'6px 8px',background:'var(--charcoal-3)',borderBottom:'1px solid var(--border)'}}>Losers Bracket</div>
              <div style={{display:'flex',gap:0,overflowX:'auto'}}>{losers.map((r,ri)=>renderRoundCol(r,ri,'losers',-1,'losers'))}</div>
            </div>
            <div style={{display:'flex',gap:0}}>
              {renderRoundCol(grandFinalRound,0,'grand_final',-1,'grand_final')}
              <LegacyChampionCol champ={champ}/>
            </div>
          </div>
        )}
      </div>

      {/* Live pickers */}
      {pickerTarget&&(
        <PlayerPicker label="Reassign Player" current={pickerTarget.current} players={players} usedIds={usedIds}
          onAssign={assignLiveSlot}
          onBye={()=>{doAssignLiveSlot(pickerTarget.matchId,pickerTarget.field,null);setPickerTarget(null)}}
          onClear={()=>{doAssignLiveSlot(pickerTarget.matchId,pickerTarget.field,null);setPickerTarget(null)}}
          onClose={()=>setPickerTarget(null)}/>
      )}
      {confirmOverwrite&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(3px)'}}>
          <div style={{background:'var(--charcoal-2)',border:'1px solid #f59e0b66',borderRadius:14,padding:'24px 20px',maxWidth:320,textAlign:'center'}}>
            <p style={{fontFamily:'Cinzel',color:'#f59e0b',fontSize:11,letterSpacing:3,textTransform:'uppercase',marginBottom:12}}>⚠ Slot Occupied</p>
            <p style={{color:'var(--cream)',fontSize:13,marginBottom:20}}>Replace <strong>{confirmOverwrite.existing?.name}</strong> with <strong>{confirmOverwrite.player?.name}</strong>?</p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{doAssignLiveSlot(confirmOverwrite.matchId,confirmOverwrite.field,confirmOverwrite.player);setConfirmOverwrite(null)}} style={{flex:1,padding:'9px 0',borderRadius:8,border:'1px solid var(--gold)',background:'var(--gold)',color:'var(--charcoal)',fontFamily:'Cinzel',fontWeight:700,fontSize:12,cursor:'pointer'}}>Replace</button>
              <button onClick={()=>setConfirmOverwrite(null)} style={{flex:1,padding:'9px 0',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:12,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Round header (live bracket) ──────────────────────────────────────────────
function RoundHeaderLive({ name, section, isCommissioner, onRename, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)
  const save = () => { onRename(val); setEditing(false) }
  const col = section==='losers'?'#ef4444':section==='consolation'?'#8b5cf6':section==='pre'?'#10b981':'var(--gold)'
  return (
    <div style={{padding:'6px 8px',background:'var(--charcoal-2)',borderBottom:`1px solid ${col}33`,borderRight:'1px solid var(--border)',minHeight:30,display:'flex',alignItems:'center',gap:4}}>
      {editing
        ? <input autoFocus value={val} onChange={e=>setVal(e.target.value)} onBlur={save} onKeyDown={e=>e.key==='Enter'&&save()}
            style={{flex:1,background:'transparent',border:'none',borderBottom:'1px solid var(--gold)',color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:2,outline:'none'}}/>
        : <span style={{flex:1,fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:2,textTransform:'uppercase'}}>{name}</span>
      }
      {isCommissioner&&!editing&&<button onClick={()=>{setVal(name);setEditing(true)}} style={{...S.iconBtn('var(--gold-dark)'),fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.45'}>✎</button>}
      {isCommissioner&&onDelete&&<button onClick={onDelete} style={{...S.iconBtn(),fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='0.45'}>🗑</button>}
    </div>
  )
}

function LegacyChampionCol({ champ }) {
  return (
    <div style={{minWidth:140,display:'flex',flexDirection:'column'}}>
      <div style={{textAlign:'center',padding:'7px 4px',background:'var(--charcoal-2)',borderBottom:'1px solid var(--border)'}}>
        <p style={{fontFamily:'Cinzel Decorative',color:'var(--gold)',fontSize:9,letterSpacing:2,margin:0}}>Champion</p>
      </div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',padding:14}}>
        {champ
          ? <div style={{textAlign:'center'}}><Avatar player={champ} size={56} ring/><p style={{color:'var(--gold)',fontFamily:'Cinzel',fontWeight:700,fontSize:11,margin:'7px 0 2px'}}>{champ.name}</p><p style={{color:'var(--gold-dark)',fontSize:9,fontFamily:'IM Fell English',fontStyle:'italic',margin:0}}>Season 6 Champion</p></div>
          : <p style={{color:'var(--charcoal-4)',fontSize:11,textAlign:'center',fontFamily:'IM Fell English',fontStyle:'italic'}}>To be decided</p>}
      </div>
    </div>
  )
}

// ─── Main BracketTab export ───────────────────────────────────────────────────
export function BracketTab({ players, tournament, matches, isCommissioner, setActiveMatch, setTab }) {
  const structure = tournament?.bracket

  const handleGenerate = async (structure) => {
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({ id:'season6', bracket:structure, status:'active', updated_at:new Date().toISOString() })

    if (structure.type === 'freeform') {
      for (const sec of structure.sections) {
        for (let ri=0; ri<sec.rounds.length; ri++) {
          const rnd = sec.rounds[ri]
          for (let mi=0; mi<rnd.matches.length; mi++) {
            const m = rnd.matches[mi]
            if (m.isBye) continue
            await supabase.from('matches').insert({
              round_index: ri, match_index: mi,
              bracket_section: sec.id,
              section_round_index: ri,
              freeform_round_id: rnd.id,
              player1_id: m.p1?.id||null, player2_id: m.p2?.id||null,
              rounds:[], total_net1:0, total_net2:0, status:'pending'
            })
          }
        }
      }
    } else {
      // Legacy single/double
      const insertRound = async (round, ri, section) => {
        await Promise.all((round.matches??[]).map((m,mi) => {
          if (m.isBye||(!m.p1&&!m.p2)) return Promise.resolve()
          return supabase.from('matches').insert({ round_index:ri, match_index:mi, bracket_section:section, section_round_index:ri, player1_id:m.p1?.id||null, player2_id:m.p2?.id||null, rounds:[], total_net1:0, total_net2:0, status:'pending' })
        }))
      }
      if (structure.type==='single') {
        for (let ri=0; ri<structure.rounds.length; ri++) await insertRound(structure.rounds[ri],ri,'winners')
      } else {
        for (let ri=0; ri<structure.winners.length; ri++) await insertRound(structure.winners[ri],ri,'winners')
        for (let ri=0; ri<structure.losers.length; ri++) await insertRound(structure.losers[ri],ri,'losers')
        await insertRound(structure.grandFinal,0,'grand_final')
      }
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Reset entire bracket? This cannot be undone.')) return
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({ id:'season6', bracket:null, status:'setup', updated_at:new Date().toISOString() })
  }

  if (!structure) {
    if (!isCommissioner) return (
      <div style={{padding:'32px 20px',textAlign:'center'}}>
        <p style={{color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic',fontSize:15}}>🔒 Commissioner access required to build the bracket.</p>
      </div>
    )
    return <FreeformBuilder players={players} onGenerate={handleGenerate} />
  }

  return <BracketViewer structure={structure} matches={matches} players={players}
    isCommissioner={isCommissioner} onReset={handleReset} setActiveMatch={setActiveMatch} setTab={setTab} />
}
