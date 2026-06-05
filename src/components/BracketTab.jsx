import { useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { generateId, shuffle, getDefaultRoundName, COLORS } from '../lib/game'

// ─── Shared styles ────────────────────────────────────────────────────────────
const S = {
  label:   { fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase' },
  segBtn:  (a) => ({ flex:1, padding:'8px 0', borderRadius:8, border:`1px solid ${a?'var(--gold)':'var(--border)'}`, background:a?'var(--gold)':'transparent', color:a?'var(--charcoal)':'var(--cream-dim)', fontFamily:'Cinzel', fontWeight:700, fontSize:10, letterSpacing:1, cursor:'pointer', textTransform:'uppercase' }),
  ghost:   (c='var(--gold-dark)') => ({ padding:'5px 10px', borderRadius:7, border:`1px dashed ${c}`, background:'transparent', color:c, fontFamily:'Cinzel', fontSize:9, letterSpacing:2, cursor:'pointer', textTransform:'uppercase' }),
  icon:    (c='var(--red-accent)') => ({ background:'none', border:'none', color:c, cursor:'pointer', fontSize:13, padding:'0 3px', lineHeight:1, opacity:.45, transition:'opacity .15s' }),
}

// ─── Slot value helpers ───────────────────────────────────────────────────────
// A slot can be:
//   null                                          → empty
//   { type:'player', player:{id,name,...} }       → fixed player
//   { type:'winner_of', matchId, matchLabel }     → feeds from winner of another match
//   { type:'bye' }                                → explicit bye

const makePlayerSlot  = (player) => player ? { type:'player', player } : null
const makeWinnerSlot  = (matchId, matchLabel) => ({ type:'winner_of', matchId, matchLabel })
const makeByeSlot     = () => ({ type:'bye' })

function slotPlayer(slot) { return slot?.type==='player' ? slot.player : null }
function slotIsWinner(slot) { return slot?.type==='winner_of' }
function slotIsBye(slot) { return slot?.type==='bye' }
function slotIsEmpty(slot) { return !slot }

// Resolve a slot to a display label
function slotLabel(slot, resolvedPlayer) {
  if (!slot) return null
  if (slot.type==='player') return slot.player?.name || '?'
  if (slot.type==='winner_of') return resolvedPlayer ? resolvedPlayer.name : `W: ${slot.matchLabel||'?'}`
  if (slot.type==='bye') return 'BYE'
  return null
}

// ─── Collect all matches across sections (for "winner of" picker) ─────────────
function collectAllMatches(sections) {
  const out = []
  sections.forEach(sec => {
    sec.rounds.forEach((rnd, ri) => {
      rnd.matches.forEach((m, mi) => {
        const p1 = slotPlayer(m.p1)?.name || (slotIsWinner(m.p1) ? `W:${m.p1.matchLabel}` : '?')
        const p2 = slotPlayer(m.p2)?.name || (slotIsWinner(m.p2) ? `W:${m.p2.matchLabel}` : '?')
        out.push({
          id: m.id,
          label: `${sec.name} · ${rnd.name||`R${ri+1}`} · Match ${mi+1}  (${p1} vs ${p2})`,
          secName: sec.name,
          rndName: rnd.name || `Round ${ri+1}`,
          matchNum: mi+1,
          p1Label: p1, p2Label: p2,
        })
      })
    })
  })
  return out
}

// ─── Slot Picker Modal ────────────────────────────────────────────────────────
// Two tabs: PLAYER and WINNER OF
function SlotPicker({ label, currentSlot, players, usedPlayerIds, allMatches, currentMatchId, onAssignPlayer, onAssignWinnerOf, onClear, onBye, onClose }) {
  const [tab, setTab]   = useState(currentSlot?.type==='winner_of' ? 'winner' : 'player')
  const [q, setQ]       = useState('')

  const filteredPlayers = players.filter(p =>
    !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.nickname||'').toLowerCase().includes(q.toLowerCase())
  )
  // Exclude the current match itself from winner_of options
  const filteredMatches = allMatches.filter(m => !q || m.label.toLowerCase().includes(q.toLowerCase()))

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.82)', zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'var(--charcoal-2)', border:'1px solid var(--border-bright)', borderRadius:14, padding:'18px 16px', width:320, maxHeight:'84vh', display:'flex', flexDirection:'column', gap:10 }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <p style={{ ...S.label, margin:0, fontSize:11 }}>{label}</p>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--cream-dim)', cursor:'pointer', fontSize:20, lineHeight:1 }}>×</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>{setTab('player');setQ('')}} style={S.segBtn(tab==='player')}>👤 Player</button>
          <button onClick={()=>{setTab('winner');setQ('')}} style={S.segBtn(tab==='winner')}>🔗 Winner Of…</button>
        </div>
        {tab==='winner' && (
          <p style={{color:'#10b981',fontSize:10,fontFamily:'Cinzel',letterSpacing:1,margin:0}}>
            Select a match — this slot fills with whoever wins it
          </p>
        )}

        <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
          placeholder={tab==='player' ? 'Search player…' : `Search ${allMatches.length} available match${allMatches.length!==1?'es':''}…`}
          style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border-bright)', background:'var(--charcoal-3)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Oswald' }} />

        <div style={{ overflowY:'auto', display:'flex', flexDirection:'column', gap:5, flex:1 }}>
          {tab==='player' && filteredPlayers.map(p => {
            const busy = usedPlayerIds.has(p.id) && slotPlayer(currentSlot)?.id !== p.id
            return (
              <button key={p.id} onClick={()=>!busy&&onAssignPlayer(p)} disabled={busy}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:9, textAlign:'left',
                  border:`1px solid ${slotPlayer(currentSlot)?.id===p.id?'var(--gold)':'var(--border)'}`,
                  background: slotPlayer(currentSlot)?.id===p.id?'#c8a84b18':'var(--charcoal-3)',
                  cursor:busy?'not-allowed':'pointer', opacity:busy?.35:1 }}>
                <Avatar player={p} size={28}/>
                <div style={{flex:1}}>
                  <p style={{color:'var(--cream)',fontFamily:'Cinzel',fontSize:12,margin:0}}>{p.name}</p>
                  {p.nickname&&<p style={{color:'var(--gold)',fontSize:10,margin:0,fontStyle:'italic'}}>"{p.nickname}"</p>}
                  {busy&&<p style={{color:'#f59e0b',fontSize:9,margin:0}}>already placed</p>}
                </div>
              </button>
            )
          })}

          {tab==='winner' && filteredMatches.map(m => {
            const active = currentSlot?.type==='winner_of' && currentSlot.matchId===m.id
            return (
              <button key={m.id} onClick={()=>onAssignWinnerOf(m.id, `${m.secName} M${m.matchNum}`)}
                style={{ display:'flex', flexDirection:'column', padding:'9px 12px', borderRadius:9, textAlign:'left',
                  border:`1px solid ${active?'var(--gold)':'var(--border)'}`,
                  background:active?'#c8a84b18':'var(--charcoal-3)', cursor:'pointer' }}>
                <span style={{color:'var(--gold)',fontFamily:'Cinzel',fontSize:10,letterSpacing:1}}>
                  {m.secName} — {m.rndName} — Match {m.matchNum}
                </span>
                <span style={{color:'var(--cream-dim)',fontSize:11,marginTop:2}}>
                  {m.p1Label} <span style={{color:'var(--gold-dark)'}}>vs</span> {m.p2Label}
                </span>
                {active&&<span style={{color:'var(--gold)',fontSize:9,marginTop:3}}>✓ currently linked</span>}
              </button>
            )
          })}

          {tab==='winner' && filteredMatches.length===0 && (
            <div style={{padding:'12px 8px',textAlign:'center'}}>
              <p style={{color:'var(--cream-dim)',fontSize:13,fontFamily:'IM Fell English',fontStyle:'italic',marginBottom:8}}>
                {allMatches.length===0 ? 'No other matches exist yet.' : 'No matches match your search.'}
              </p>
              {allMatches.length===0 && (
                <p style={{color:'var(--charcoal-4)',fontSize:11}}>
                  Build your other matches first (e.g. Pre-Round), then come back and link this slot to the winner.
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{ display:'flex', gap:8, borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <button onClick={onBye} style={{flex:1,padding:'7px 0',borderRadius:7,border:'1px solid #ef444466',background:'transparent',color:'#ef4444',fontFamily:'Cinzel',fontSize:9,cursor:'pointer',letterSpacing:2}}>BYE</button>
          {currentSlot && <button onClick={onClear} style={{flex:1,padding:'7px 0',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,cursor:'pointer',letterSpacing:2}}>CLEAR</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Freeform Builder ─────────────────────────────────────────────────────────
function FreeformBuilder({ players, onGenerate }) {
  const [sections, setSections] = useState([
    { id:generateId(), name:'Pre-Round', type:'pre', rounds:[
      { id:generateId(), name:'', matches:[
        { id:generateId(), p1:null, p2:null },
        { id:generateId(), p1:null, p2:null },
      ]}
    ]},
    { id:generateId(), name:'Main Bracket', type:'winners', rounds:[
      { id:generateId(), name:'Round 1', matches:[
        { id:generateId(), p1:null, p2:null },
        { id:generateId(), p1:null, p2:null },
        { id:generateId(), p1:null, p2:null },
        { id:generateId(), p1:null, p2:null },
      ]}
    ]}
  ])
  const [picker, setPicker] = useState(null) // { secId,rndId,matchId,slot,currentSlot }
  const [generating, setGenerating] = useState(false)
  const dragRef = useRef(null)

  // All matches flat list (for winner_of picker)
  const allMatches = useMemo(() => collectAllMatches(sections), [sections])

  // Section CRUD
  const addSection = (type) => {
    const names={winners:'Main Bracket',losers:'Losers Bracket',consolation:'Consolation',pre:'Pre-Round',grand_final:'Grand Final'}
    setSections(s=>[...s,{id:generateId(),name:names[type]||'New Section',type,rounds:[{id:generateId(),name:'',matches:[{id:generateId(),p1:null,p2:null}]}]}])
  }
  const removeSection   = (sid) => setSections(s=>s.filter(x=>x.id!==sid))
  const updateSection   = (sid,patch) => setSections(s=>s.map(x=>x.id===sid?{...x,...patch}:x))
  const moveSection     = (i,d) => setSections(s=>{ const a=[...s],t=i+d; if(t<0||t>=a.length)return a; [a[i],a[t]]=[a[t],a[i]]; return a })

  // Round CRUD
  const addRound    = (sid) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:[...x.rounds,{id:generateId(),name:'',matches:[{id:generateId(),p1:null,p2:null}]}]}))
  const removeRound = (sid,rid) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.filter(r=>r.id!==rid)}))
  const updateRound = (sid,rid,patch) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,...patch})}))

  // Match CRUD
  const addMatch    = (sid,rid) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:[...r.matches,{id:generateId(),p1:null,p2:null}]})}))
  const removeMatch = (sid,rid,mid) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.filter(m=>m.id!==mid)})}))
  const updateMatch = (sid,rid,mid,patch) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.map(m=>m.id!==mid?m:{...m,...patch})})}))

  // Slot assignment
  const allUsedPlayerIds = useMemo(()=>new Set(
    sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[slotPlayer(m.p1)?.id,slotPlayer(m.p2)?.id].filter(Boolean))))
  ),[sections])

  const openPicker = (sid,rid,mid,slot,currentSlot) => setPicker({sid,rid,mid,slot,currentSlot})

  const assignPlayer = (p) => {
    const {sid,rid,mid,slot} = picker
    // Remove player from any other slot first
    setSections(s=>s.map(sec=>({...sec,rounds:sec.rounds.map(r=>({...r,matches:r.matches.map(m=>{
      const updated={...m}
      if(slotPlayer(m.p1)?.id===p.id) updated.p1=null
      if(slotPlayer(m.p2)?.id===p.id) updated.p2=null
      if(sec.id===sid&&r.id===rid&&m.id===mid) updated[slot]=makePlayerSlot(p)
      return updated
    })}))})))
    setPicker(null)
  }

  const assignWinnerOf = (matchId, matchLabel) => {
    const {sid,rid,mid,slot} = picker
    updateMatch(sid,rid,mid,{[slot]:makeWinnerSlot(matchId,matchLabel)})
    setPicker(null)
  }

  const clearSlot = () => {
    updateMatch(picker.sid,picker.rid,picker.mid,{[picker.slot]:null})
    setPicker(null)
  }

  const setByeSlot = () => {
    updateMatch(picker.sid,picker.rid,picker.mid,{[picker.slot]:makeByeSlot()})
    setPicker(null)
  }

  // Fill empty player slots randomly
  const fillRoundRandom = (sid,rid) => {
    const used = new Set(sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[slotPlayer(m.p1)?.id,slotPlayer(m.p2)?.id].filter(Boolean)))))
    const avail = shuffle(players.filter(p=>!used.has(p.id)))
    setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.map(m=>{
      const mm={...m}
      if(!mm.p1&&avail.length) mm.p1=makePlayerSlot(avail.shift())
      if(!mm.p2&&avail.length) mm.p2=makePlayerSlot(avail.shift())
      return mm
    })})}))
  }

  // Drag to reorder matches
  const onDragStart = (e,sid,rid,idx) => { dragRef.current={sid,rid,idx}; e.dataTransfer.effectAllowed='move' }
  const onDrop = (e,sid,rid,toIdx) => {
    e.preventDefault()
    const {sid:fsid,rid:frid,idx:fi} = dragRef.current||{}
    if(!fsid||fsid!==sid||frid!==rid||fi===toIdx) return
    setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>{
      if(r.id!==rid) return r
      const ms=[...r.matches]; const [mv]=ms.splice(fi,1); ms.splice(toIdx,0,mv); return {...r,matches:ms}
    })}))
    dragRef.current=null
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await onGenerate({ type:'freeform', sections: sections.map(sec=>({...sec, rounds:sec.rounds.map(r=>({...r, matches:r.matches.map(m=>({...m,score1:0,score2:0,winner:null}))})) })) })
    } finally { setGenerating(false) }
  }

  const sCol = {winners:'var(--gold)',losers:'#ef4444',consolation:'#8b5cf6',pre:'#10b981',grand_final:'var(--gold-light)'}
  const totalMatches = sections.reduce((a,s)=>a+s.rounds.reduce((b,r)=>b+r.matches.length,0),0)
  const placedIds = new Set(sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[slotPlayer(m.p1)?.id,slotPlayer(m.p2)?.id].filter(Boolean)))))
  const unassigned = players.filter(p=>!placedIds.has(p.id))

  return (
    <div style={{padding:'16px',maxWidth:700,margin:'0 auto'}}>
      <div style={{marginBottom:18}}>
        <h2 style={{...S.label,fontSize:13,letterSpacing:5,display:'block',marginBottom:4}}>Build Bracket</h2>
        <p style={{color:'var(--cream-dim)',fontSize:12}}>Season 6 · Freeform — Full Commissioner Control</p>
      </div>

      {players.length<2&&<div style={{background:'var(--charcoal-2)',borderRadius:10,padding:12,color:'#f59e0b',marginBottom:14,border:'1px solid #f59e0b44',fontSize:12}}>⚠ Add at least 2 players first.</div>}

      {/* Unplaced banner */}
      {unassigned.length>0&&(
        <div style={{background:'var(--charcoal-2)',borderRadius:10,padding:'8px 14px',marginBottom:14,border:'1px solid #f59e0b33',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{color:'#f59e0b',fontSize:10,fontFamily:'Cinzel',letterSpacing:1,flexShrink:0}}>UNPLACED:</span>
          {unassigned.map(p=>(
            <span key={p.id} style={{display:'flex',alignItems:'center',gap:4,background:'var(--charcoal-3)',borderRadius:6,padding:'3px 8px'}}>
              <Avatar player={p} size={18}/><span style={{color:'var(--cream-dim)',fontSize:11}}>{p.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Sections */}
      {sections.map((sec,si)=>{
        const col=sCol[sec.type]||'var(--gold)'
        return (
          <div key={sec.id} style={{background:'var(--charcoal-2)',borderRadius:14,border:`1px solid ${col}33`,marginBottom:14,overflow:'hidden'}}>
            {/* Section header */}
            <div style={{background:'var(--charcoal-3)',padding:'9px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${col}44`}}>
              <div style={{width:3,height:18,borderRadius:2,background:col,flexShrink:0}}/>
              <input value={sec.name} onChange={e=>updateSection(sec.id,{name:e.target.value})}
                style={{flex:1,background:'transparent',border:'none',color:col,fontFamily:'Cinzel',fontWeight:700,fontSize:12,letterSpacing:2,outline:'none',textTransform:'uppercase'}}/>
              <select value={sec.type} onChange={e=>updateSection(sec.id,{type:e.target.value})}
                style={{background:'var(--charcoal-2)',border:'1px solid var(--border)',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,borderRadius:6,padding:'3px 6px',cursor:'pointer',outline:'none'}}>
                <option value="pre">Pre-Round</option>
                <option value="winners">Winners</option>
                <option value="losers">Losers</option>
                <option value="consolation">Consolation</option>
                <option value="grand_final">Grand Final</option>
              </select>
              <button onClick={()=>moveSection(si,-1)} disabled={si===0} style={{background:'none',border:'none',color:'var(--cream-dim)',cursor:'pointer',fontSize:13,opacity:si===0?.2:.6,padding:'0 2px'}}>↑</button>
              <button onClick={()=>moveSection(si,1)} disabled={si===sections.length-1} style={{background:'none',border:'none',color:'var(--cream-dim)',cursor:'pointer',fontSize:13,opacity:si===sections.length-1?.2:.6,padding:'0 2px'}}>↓</button>
              <button onClick={()=>removeSection(sec.id)} style={{background:'none',border:'none',color:'var(--red-accent)',cursor:'pointer',fontSize:16,opacity:.5,padding:'0 4px'}}
                onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.5'}>×</button>
            </div>

            {/* Rounds */}
            <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:10}}>
              {sec.rounds.map((rnd,ri)=>(
                <div key={rnd.id} style={{background:'var(--charcoal-3)',borderRadius:10,overflow:'hidden',border:'1px solid var(--border)'}}>
                  {/* Round header */}
                  <div style={{padding:'7px 12px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid var(--border)',background:'var(--charcoal-2)'}}>
                    <input value={rnd.name} onChange={e=>updateRound(sec.id,rnd.id,{name:e.target.value})} placeholder={`Round ${ri+1}`}
                      style={{flex:1,background:'transparent',border:'none',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,letterSpacing:2,outline:'none',textTransform:'uppercase'}}/>
                    <button onClick={()=>fillRoundRandom(sec.id,rnd.id)} style={S.ghost('#10b981')}>🎲 Fill</button>
                    <button onClick={()=>addMatch(sec.id,rnd.id)} style={S.ghost()}>+ Match</button>
                    <button onClick={()=>removeRound(sec.id,rnd.id)} style={S.icon()}
                      onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>🗑</button>
                  </div>

                  {/* Matches */}
                  <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:6}}>
                    {rnd.matches.map((m,mi)=>(
                      <div key={m.id} draggable
                        onDragStart={e=>onDragStart(e,sec.id,rnd.id,mi)}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={e=>onDrop(e,sec.id,rnd.id,mi)}
                        style={{display:'flex',alignItems:'center',gap:6,background:'var(--charcoal-2)',borderRadius:8,padding:'7px 10px',border:'1px solid var(--border)',cursor:'grab'}}>
                        <span style={{color:'var(--charcoal-4)',fontSize:12,userSelect:'none'}}>⠿</span>
                        <span style={{color:'var(--gold-dark)',fontFamily:'Cinzel',fontSize:9,width:18,flexShrink:0}}>{mi+1}</span>
                        {/* P1 */}
                        <BuilderSlotBtn slot={m.p1} label="P1" onOpen={()=>openPicker(sec.id,rnd.id,m.id,'p1',m.p1)} />
                        <span style={{color:'var(--gold-dark)',fontFamily:'Cinzel',fontSize:9,flexShrink:0}}>vs</span>
                        {/* P2 */}
                        <BuilderSlotBtn slot={m.p2} label="P2" onOpen={()=>openPicker(sec.id,rnd.id,m.id,'p2',m.p2)} />
                        <button onClick={()=>removeMatch(sec.id,rnd.id,m.id)} style={S.icon()}
                          onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>×</button>
                      </div>
                    ))}
                    {rnd.matches.length===0&&<p style={{color:'var(--charcoal-4)',fontSize:11,textAlign:'center',padding:'4px 0',fontFamily:'IM Fell English',fontStyle:'italic'}}>No matches — click + Match</p>}
                  </div>
                </div>
              ))}
              <button onClick={()=>addRound(sec.id)} style={{...S.ghost(col),width:'100%',padding:'7px 0',textAlign:'center'}}>
                + Add Round to {sec.name||'Section'}
              </button>
            </div>
          </div>
        )
      })}

      {/* Add section */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>
        {[['pre','+ Pre-Round','#10b981'],['winners','+ Winners','var(--gold)'],['losers','+ Losers','#ef4444'],['consolation','+ Consolation','#8b5cf6'],['grand_final','+ Grand Final','var(--gold-light)']].map(([type,lbl,col])=>(
          <button key={type} onClick={()=>addSection(type)}
            style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${col}66`,background:'transparent',color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase'}}>{lbl}</button>
        ))}
      </div>

      <button onClick={handleGenerate} disabled={generating||totalMatches===0}
        style={{width:'100%',padding:'13px 0',borderRadius:10,border:'1px solid var(--gold)',background:totalMatches>0?'var(--gold)':'transparent',color:totalMatches>0?'var(--charcoal)':'var(--gold-dark)',fontFamily:'Cinzel Decorative',fontWeight:700,fontSize:14,cursor:totalMatches>0?'pointer':'not-allowed',letterSpacing:1}}>
        {generating?'Locking In…':`⚔ Lock In Bracket  (${totalMatches} matches)`}
      </button>

      {picker&&(
        <SlotPicker
          label={`Slot ${picker.slot.toUpperCase()}`}
          currentSlot={picker.currentSlot}
          players={players}
          usedPlayerIds={allUsedPlayerIds}
          allMatches={allMatches.filter(m=>m.id!==picker.mid)}
          currentMatchId={picker.mid}
          onAssignPlayer={assignPlayer}
          onAssignWinnerOf={assignWinnerOf}
          onClear={clearSlot}
          onBye={setByeSlot}
          onClose={()=>setPicker(null)}
        />
      )}
    </div>
  )
}

// ─── Builder slot button ──────────────────────────────────────────────────────
function BuilderSlotBtn({ slot, label, onOpen }) {
  const isEmpty   = slotIsEmpty(slot)
  const isBye     = slotIsBye(slot)
  const isWinner  = slotIsWinner(slot)
  const player    = slotPlayer(slot)

  let display, borderCol, bgCol, textCol
  if (isBye)    { display='BYE'; borderCol='#ef444466'; bgCol='#7f1d1d22'; textCol='#ef4444' }
  else if (isWinner) { display=`W: ${slot.matchLabel||'?'}`; borderCol='#10b98166'; bgCol='#10b98111'; textCol='#10b981' }
  else if (player) { display=player.name; borderCol='var(--border)'; bgCol='var(--charcoal-3)'; textCol='var(--cream)' }
  else { display=`Assign ${label}`; borderCol='var(--border)'; bgCol='#ffffff05'; textCol='var(--charcoal-4)' }

  return (
    <button onClick={onOpen}
      style={{flex:1,display:'flex',alignItems:'center',gap:6,padding:'5px 8px',borderRadius:7,border:`1px solid ${borderCol}`,background:bgCol,cursor:'pointer',minWidth:0,textAlign:'left'}}>
      {player&&<Avatar player={player} size={20}/>}
      {isWinner&&<span style={{fontSize:14,flexShrink:0}}>🔗</span>}
      {isBye&&<span style={{fontSize:12,flexShrink:0}}>✗</span>}
      <span style={{color:textCol,fontSize:10,fontFamily:player||isWinner?'Cinzel':'Oswald',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{display}</span>
      <span style={{color:'var(--gold-dark)',fontSize:9,flexShrink:0}}>✎</span>
    </button>
  )
}

// ─── Live Bracket Viewer ──────────────────────────────────────────────────────
function BracketViewer({ structure, matches, players, isCommissioner, onReset, setActiveMatch, setTab }) {
  const [pickerTarget, setPT] = useState(null)
  const [confirmOW, setConfirmOW] = useState(null)

  const getPlayer = id => players.find(p=>p.id===id)
  const isFreeform = structure.type==='freeform'
  const isSingle   = !structure.type||structure.type==='single'
  const rounds     = isSingle?(structure.rounds??[]):null
  const winners    = !isSingle&&!isFreeform?(structure.winners??[]):null
  const losers     = !isSingle&&!isFreeform?(structure.losers??[]):null
  const gfRound    = !isSingle&&!isFreeform?(structure.grandFinal??{matches:[],name:'Grand Final',type:'grand_final'}):null
  const sections   = isFreeform?(structure.sections??[]):null

  const openMatch = dbm => { setActiveMatch({matchId:dbm.id}); setTab('Scoreboard') }

  // Find DB match row for a given section+round+matchIndex
  const getDbm = (secId, rndId, mi) =>
    matches.find(m =>
      m.bracket_section===secId &&
      m.match_index===mi &&
      (m.freeform_round_id===rndId || m.section_round_index===(isFreeform ? (structure.sections?.find(s=>s.id===secId)?.rounds?.findIndex(r=>r.id===rndId)??0) : 0))
    ) || matches.find(m=>m.bracket_section===secId&&m.match_index===mi)

  // Resolve winner_of chain → actual live player from DB
  const resolveSlot = (slot, dbPlayerId) => {
    if (dbPlayerId) return getPlayer(dbPlayerId)
    if (slot?.type==='player') return slot.player
    if (slot?.type==='winner_of') {
      // find the match and its winner
      const srcMatch = isFreeform
        ? matches.find(m => {
            const bm = sections?.flatMap(s=>s.rounds.flatMap(r=>r.matches)).find(x=>x.id===slot.matchId)
            return bm && m.freeform_round_id && m.match_index===sections?.flatMap(s=>s.rounds.flatMap(r=>r.matches)).indexOf(bm)
          })
        : matches.find(m => {
            // for legacy, try bracket_section lookup
            return false
          })
      if (srcMatch?.winner_id) return getPlayer(srcMatch.winner_id)
      return null // TBD until the feeder match finishes
    }
    return null
  }

  // ── Live mutations ──
  const mutateBracket = async (updater) => {
    const {data} = await supabase.from('tournament').select('bracket').eq('id','season6').single()
    if (!data?.bracket) return
    await supabase.from('tournament').update({bracket:updater(JSON.parse(JSON.stringify(data.bracket))),updated_at:new Date().toISOString()}).eq('id','season6')
  }

  const renameRound = async (secIdx,rndIdx,name) => {
    await mutateBracket(b=>{ if(b.sections?.[secIdx]?.rounds?.[rndIdx]) b.sections[secIdx].rounds[rndIdx].name=name; return b })
  }
  const addLiveRound = async (secIdx) => {
    const newRid=generateId()
    await mutateBracket(b=>{ if(b.sections?.[secIdx]) b.sections[secIdx].rounds.push({id:newRid,name:'',matches:[{id:generateId(),p1:null,p2:null}]}); return b })
    const sec=structure.sections?.[secIdx]; if(!sec) return
    await supabase.from('matches').insert({round_index:sec.rounds.length,match_index:0,bracket_section:sec.id,section_round_index:sec.rounds.length,freeform_round_id:newRid,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'})
  }
  const addLiveMatch = async (secIdx,rndIdx) => {
    const sec=structure.sections?.[secIdx]; const rnd=sec?.rounds?.[rndIdx]; if(!rnd) return
    const mi=rnd.matches.length; const newMid=generateId()
    await mutateBracket(b=>{ if(b.sections?.[secIdx]?.rounds?.[rndIdx]) b.sections[secIdx].rounds[rndIdx].matches.push({id:newMid,p1:null,p2:null}); return b })
    await supabase.from('matches').insert({round_index:rndIdx,match_index:mi,bracket_section:sec.id,section_round_index:rndIdx,freeform_round_id:rnd.id,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'})
  }
  const deleteLiveMatch = async (secIdx,rndIdx,mi) => {
    if(!window.confirm('Remove this match?')) return
    const sec=structure.sections?.[secIdx]; const rnd=sec?.rounds?.[rndIdx]; if(!rnd) return
    await mutateBracket(b=>{ if(b.sections?.[secIdx]?.rounds?.[rndIdx]) b.sections[secIdx].rounds[rndIdx].matches=b.sections[secIdx].rounds[rndIdx].matches.filter((_,i)=>i!==mi); return b })
    const dbm=getDbm(sec.id,rnd.id,mi); if(dbm) await supabase.from('matches').delete().eq('id',dbm.id)
  }
  const deleteLiveRound = async (secIdx,rndIdx) => {
    if(!window.confirm('Remove round and all its matches?')) return
    const sec=structure.sections?.[secIdx]; const rnd=sec?.rounds?.[rndIdx]; if(!rnd) return
    await mutateBracket(b=>{ if(b.sections?.[secIdx]) b.sections[secIdx].rounds=b.sections[secIdx].rounds.filter((_,i)=>i!==rndIdx); return b })
    const rows=matches.filter(m=>m.bracket_section===sec.id&&m.freeform_round_id===rnd.id)
    await Promise.all(rows.map(m=>supabase.from('matches').delete().eq('id',m.id)))
  }
  const doAssignSlot = async (matchId,field,playerId) => {
    await supabase.from('matches').update({[field]:playerId||null,updated_at:new Date().toISOString()}).eq('id',matchId)
    setPT(null)
  }

  // Resolve winner_of link → live DB winner
  const resolveLiveSlot = (slot, dbId) => {
    if (dbId) return getPlayer(dbId)
    if (!slot) return null
    if (slot.type==='player') return slot.player
    if (slot.type==='winner_of') {
      // walk sections to find the source match, then look up its DB row's winner
      for (const sec of (sections||[])) {
        for (let ri=0; ri<sec.rounds.length; ri++) {
          const rnd=sec.rounds[ri]
          for (let mi=0; mi<rnd.matches.length; mi++) {
            if (rnd.matches[mi].id===slot.matchId) {
              const srcDbm=getDbm(sec.id,rnd.id,mi)
              return srcDbm?.winner_id ? getPlayer(srcDbm.winner_id) : null
            }
          }
        }
      }
      return null
    }
    return null
  }

  const usedIds = new Set(matches.flatMap(m=>[m.player1_id,m.player2_id].filter(Boolean)))

  // ── Champion ──
  const getChampion = () => {
    if(isFreeform&&sections?.length){
      const last=sections[sections.length-1]; const lr=last?.rounds?.[last.rounds.length-1]; if(!lr) return null
      const dbm=getDbm(last.id,lr.id,0); return dbm?.winner_id?getPlayer(dbm.winner_id):null
    }
    if(isSingle){ const dbm=matches.find(m=>(m.bracket_section==='winners'||!m.bracket_section)&&m.round_index===rounds.length-1&&m.match_index===0); return dbm?.winner_id?getPlayer(dbm.winner_id):null }
    const dbm=matches.find(m=>m.bracket_section==='grand_final'&&m.match_index===0); return dbm?.winner_id?getPlayer(dbm.winner_id):null
  }
  const champ=getChampion()

  const sCol={winners:'var(--gold)',losers:'#ef4444',consolation:'#8b5cf6',pre:'#10b981',grand_final:'var(--gold-light)'}

  // ── Match card ──
  const MatchCard = ({bm,dbm,secId,secIdx,rndIdx,mi}) => {
    if(!bm) return null
    const p1Resolved = resolveLiveSlot(bm.p1, dbm?.player1_id)
    const p2Resolved = resolveLiveSlot(bm.p2, dbm?.player2_id)
    const s1=dbm?.total_net1||0; const s2=dbm?.total_net2||0
    const wId=dbm?.winner_id; const done=dbm?.status==='complete'
    const isBye=(bm.p1?.type==='bye'&&bm.p2?.type==='bye')||slotIsBye(bm.p1)||slotIsBye(bm.p2)

    if(slotIsBye(bm.p1)&&slotIsBye(bm.p2)) return <div style={{background:'var(--charcoal-3)',borderRadius:7,padding:'5px 9px',opacity:.3,border:'1px dashed var(--border)',fontSize:10,color:'var(--cream-dim)',textAlign:'center',fontFamily:'Cinzel',marginBottom:4}}>— BYE —</div>

    return (
      <div style={{position:'relative',marginBottom:5}}>
        <div onClick={()=>dbm&&openMatch(dbm)}
          style={{background:'var(--charcoal-2)',borderRadius:9,padding:'7px 9px',border:`1.5px solid ${done?'var(--gold-dark)':'var(--border)'}`,cursor:dbm?'pointer':'default',transition:'border-color .12s'}}
          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
          onMouseLeave={e=>e.currentTarget.style.borderColor=done?'var(--gold-dark)':'var(--border)'}>
          {[{slot:bm.p1,resolved:p1Resolved,s:s1,win:wId&&wId===p1Resolved?.id,field:'player1_id'},
            {slot:bm.p2,resolved:p2Resolved,s:s2,win:wId&&wId===p2Resolved?.id,field:'player2_id'}].map(({slot,resolved,s,win,field},i)=>{
            const isLinked=slotIsWinner(slot)
            const isByeSlot=slotIsBye(slot)
            return (
              <div key={i} style={{display:'flex',alignItems:'center',gap:5,padding:'2px 0'}}>
                <div onClick={e=>{e.stopPropagation();dbm&&isCommissioner&&!done&&setPT({matchId:dbm.id,field,current:resolved})}} style={{flexShrink:0}}>
                  <Avatar player={resolved} size={20}/>
                </div>
                <span style={{flex:1,color:win?'var(--gold)':resolved?'var(--cream)':isLinked?'#10b981':'var(--charcoal-4)',fontSize:11,fontFamily:win||isLinked?'Cinzel':'Oswald',fontWeight:win?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {isByeSlot?'BYE':resolved?(resolved.nickname?`"${resolved.nickname}"`:resolved.name):isLinked?`🔗 W: ${slot.matchLabel||'?'}`:'TBD'}
                </span>
                <span style={{color:win?'var(--gold)':'var(--cream-dim)',fontWeight:win?700:400,fontSize:12,fontFamily:'Cinzel',flexShrink:0}}>{s}</span>
                {isCommissioner&&!done&&dbm&&(
                  <button onClick={e=>{e.stopPropagation();setPT({matchId:dbm.id,field,current:resolved})}}
                    style={{...S.icon('var(--gold-dark)'),opacity:.4,fontSize:9}}
                    onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.4'}>✎</button>
                )}
              </div>
            )
          })}
          {done&&<div style={{fontSize:8,color:'var(--gold-dark)',fontFamily:'Cinzel',letterSpacing:2,marginTop:2,textAlign:'right'}}>FINAL</div>}
        </div>
        {isCommissioner&&isFreeform&&(
          <button onClick={()=>deleteLiveMatch(secIdx,rndIdx,mi)}
            style={{...S.icon(),position:'absolute',top:1,right:1,fontSize:10}}
            onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>×</button>
        )}
      </div>
    )
  }

  // ── Round column ──
  const RoundCol = ({rnd,ri,sec,si}) => {
    if(!rnd) return null
    const col=sCol[sec.type]||'var(--gold)'
    const name=rnd.name||(sec.type==='grand_final'?'Grand Final':`Round ${ri+1}`)
    return (
      <div style={{flex:1,minWidth:170,display:'flex',flexDirection:'column'}}>
        <RoundHeaderLive name={name} col={col} isCommissioner={isCommissioner}
          onRename={n=>renameRound(si,ri,n)}
          onDelete={isCommissioner?()=>deleteLiveRound(si,ri):null}/>
        <div style={{flex:1,display:'flex',flexDirection:'column',padding:'8px 5px',borderRight:'1px solid var(--border)',gap:0}}>
          {(rnd.matches??[]).map((bm,mi)=>{
            const dbm=getDbm(sec.id,rnd.id,mi)
            return <MatchCard key={bm?.id||mi} bm={bm??{}} dbm={dbm} secId={sec.id} secIdx={si} rndIdx={ri} mi={mi}/>
          })}
          {isCommissioner&&<button onClick={()=>addLiveMatch(si,ri)} style={{...S.ghost(col),padding:'4px 0',textAlign:'center',marginTop:2,fontSize:8}}>+ Match</button>}
        </div>
      </div>
    )
  }

  if(isSingle&&rounds.length===0) return (
    <div style={{padding:40,textAlign:'center'}}>
      <p style={{color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic',fontSize:14}}>Bracket is empty. Reset and regenerate.</p>
      {isCommissioner&&<button onClick={onReset} style={{marginTop:16,padding:'8px 20px',borderRadius:8,border:'1px solid var(--red-accent)',background:'none',color:'var(--red-accent)',cursor:'pointer',fontFamily:'Cinzel',fontSize:12}}>Reset Bracket</button>}
    </div>
  )

  return (
    <div style={{padding:'12px 10px'}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <p style={{...S.label,letterSpacing:4,margin:0}}>Season 6 · {isFreeform?'Custom':isSingle?'Single Elim':'Double Elim'}</p>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {isCommissioner&&isFreeform&&[['pre','Pre','#10b981'],['winners','Round','var(--gold)'],['consolation','Consol.','#8b5cf6'],['grand_final','G.Final','var(--gold-light)']].map(([type,lbl,col])=>(
            <button key={type} onClick={async()=>{
              const newSecId=generateId(),newRid=generateId()
              const names={pre:'Pre-Round',winners:'New Round',consolation:'Consolation',grand_final:'Grand Final'}
              await mutateBracket(b=>{ b.sections.push({id:newSecId,name:names[type],type,rounds:[{id:newRid,name:'',matches:[{id:generateId(),p1:null,p2:null}]}]}); return b })
              await supabase.from('matches').insert({round_index:0,match_index:0,bracket_section:newSecId,section_round_index:0,freeform_round_id:newRid,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'})
            }} style={{padding:'4px 9px',borderRadius:7,border:`1px solid ${col}55`,background:'transparent',color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase'}}>+ {lbl}</button>
          ))}
          {isCommissioner&&<button onClick={onReset} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--red-accent)',background:'none',color:'var(--red-accent)',cursor:'pointer',fontSize:10,fontFamily:'Cinzel'}}>Reset</button>}
        </div>
      </div>

      <div style={{overflowX:'auto',paddingBottom:16}}>
        {/* ── Freeform ── */}
        {isFreeform&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {sections.map((sec,si)=>{
              const col=sCol[sec.type]||'var(--gold)'
              return (
                <div key={sec.id}>
                  <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',background:'var(--charcoal-3)',borderRadius:'8px 8px 0 0',borderBottom:`2px solid ${col}44`}}>
                    <div style={{width:3,height:14,borderRadius:2,background:col,flexShrink:0}}/>
                    <span style={{fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:3,textTransform:'uppercase',flex:1}}>{sec.name||`Section ${si+1}`}</span>
                    {isCommissioner&&<button onClick={()=>addLiveRound(si)} style={{...S.ghost(col),padding:'2px 8px',fontSize:8}}>+ Round</button>}
                  </div>
                  <div style={{display:'flex',gap:0,overflowX:'auto',minWidth:sec.rounds.length*174}}>
                    {sec.rounds.map((rnd,ri)=><RoundCol key={rnd.id||ri} rnd={rnd} ri={ri} sec={sec} si={si}/>)}
                  </div>
                </div>
              )
            })}
            {champ&&<div style={{textAlign:'center',padding:'14px 0'}}><p style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:10,letterSpacing:4,textTransform:'uppercase',marginBottom:10}}>🏆 Champion</p><Avatar player={champ} size={60} ring/><p style={{color:'var(--gold)',fontFamily:'Cinzel',fontWeight:700,fontSize:12,marginTop:7}}>{champ.name}</p></div>}
          </div>
        )}
        {/* ── Single elim (legacy) ── */}
        {isSingle&&<div style={{display:'flex',gap:0,minWidth:rounds.length*173+140}}>{rounds.map((r,ri)=>{const fakeS={id:'winners',name:'',type:'winners'};<RoundCol key={ri} rnd={r} ri={ri} sec={fakeS} si={-1}/>})}<LegacyChamp champ={champ}/></div>}
        {/* ── Double elim (legacy) ── */}
        {!isSingle&&!isFreeform&&(
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            <div style={{marginBottom:4}}><div style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:9,letterSpacing:4,textTransform:'uppercase',padding:'6px 8px',background:'var(--charcoal-3)',borderRadius:'8px 8px 0 0',borderBottom:'1px solid var(--border)'}}>Winners Bracket</div><div style={{display:'flex',gap:0,overflowX:'auto'}}>{winners.map((r,ri)=>{const fS={id:'winners',name:'',type:'winners'};return <RoundCol key={ri} rnd={r} ri={ri} sec={fS} si={-1}/>})}</div></div>
            <div style={{marginBottom:4}}><div style={{fontFamily:'Cinzel',color:'#ef4444',fontSize:9,letterSpacing:4,textTransform:'uppercase',padding:'6px 8px',background:'var(--charcoal-3)',borderBottom:'1px solid var(--border)'}}>Losers Bracket</div><div style={{display:'flex',gap:0,overflowX:'auto'}}>{losers.map((r,ri)=>{const fS={id:'losers',name:'',type:'losers'};return <RoundCol key={ri} rnd={r} ri={ri} sec={fS} si={-1}/>})}</div></div>
            <div style={{display:'flex',gap:0}}>{(()=>{const fS={id:'grand_final',name:'',type:'grand_final'};return <RoundCol rnd={gfRound} ri={0} sec={fS} si={-1}/>})()}<LegacyChamp champ={champ}/></div>
          </div>
        )}
      </div>

      {/* Live player picker */}
      {pickerTarget&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.8)',zIndex:3000,display:'flex',alignItems:'center',justifyContent:'center',backdropFilter:'blur(3px)'}}
          onClick={e=>e.target===e.currentTarget&&setPT(null)}>
          <div style={{background:'var(--charcoal-2)',border:'1px solid var(--border-bright)',borderRadius:14,padding:'18px 16px',width:300,maxHeight:'80vh',display:'flex',flexDirection:'column',gap:10}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <p style={{...S.label,margin:0}}>Reassign Player</p>
              <button onClick={()=>setPT(null)} style={{background:'none',border:'none',color:'var(--cream-dim)',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
            </div>
            <div style={{overflowY:'auto',display:'flex',flexDirection:'column',gap:5}}>
              {players.map(p=>{
                const busy=usedIds.has(p.id)&&p.id!==pickerTarget.current?.id
                return (
                  <button key={p.id} onClick={()=>{if(busy){setConfirmOW({matchId:pickerTarget.matchId,field:pickerTarget.field,player:p,existing:pickerTarget.current});setPT(null)}else doAssignSlot(pickerTarget.matchId,pickerTarget.field,p.id)}}
                    style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderRadius:9,textAlign:'left',border:`1px solid ${p.id===pickerTarget.current?.id?'var(--gold)':'var(--border)'}`,background:p.id===pickerTarget.current?.id?'#c8a84b18':'var(--charcoal-3)',cursor:'pointer',opacity:busy?.7:1}}>
                    <Avatar player={p} size={28}/>
                    <div><p style={{color:'var(--cream)',fontFamily:'Cinzel',fontSize:12,margin:0}}>{p.name}</p>{busy&&<p style={{color:'#f59e0b',fontSize:9,margin:0}}>⚠ already in bracket</p>}</div>
                  </button>
                )
              })}
            </div>
            <button onClick={()=>doAssignSlot(pickerTarget.matchId,pickerTarget.field,null)} style={{padding:'7px 0',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,cursor:'pointer',letterSpacing:2}}>CLEAR SLOT</button>
          </div>
        </div>
      )}
      {confirmOW&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',zIndex:4000,display:'flex',alignItems:'center',justifyContent:'center'}}>
          <div style={{background:'var(--charcoal-2)',border:'1px solid #f59e0b66',borderRadius:14,padding:'24px 20px',maxWidth:300,textAlign:'center'}}>
            <p style={{fontFamily:'Cinzel',color:'#f59e0b',fontSize:11,letterSpacing:3,textTransform:'uppercase',marginBottom:10}}>⚠ Player Busy</p>
            <p style={{color:'var(--cream)',fontSize:13,marginBottom:18}}><strong>{confirmOW.player?.name}</strong> is already in the bracket. Replace <strong>{confirmOW.existing?.name}</strong>?</p>
            <div style={{display:'flex',gap:10}}>
              <button onClick={()=>{doAssignSlot(confirmOW.matchId,confirmOW.field,confirmOW.player.id);setConfirmOW(null)}} style={{flex:1,padding:'9px 0',borderRadius:8,border:'1px solid var(--gold)',background:'var(--gold)',color:'var(--charcoal)',fontFamily:'Cinzel',fontWeight:700,fontSize:12,cursor:'pointer'}}>Replace</button>
              <button onClick={()=>setConfirmOW(null)} style={{flex:1,padding:'9px 0',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:12,cursor:'pointer'}}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Round header (live) ──────────────────────────────────────────────────────
function RoundHeaderLive({name,col,isCommissioner,onRename,onDelete}) {
  const [editing,setEditing]=useState(false)
  const [val,setVal]=useState(name)
  const save=()=>{onRename(val);setEditing(false)}
  return (
    <div style={{padding:'6px 8px',background:'var(--charcoal-2)',borderBottom:`1px solid ${col}33`,borderRight:'1px solid var(--border)',minHeight:30,display:'flex',alignItems:'center',gap:4}}>
      {editing
        ?<input autoFocus value={val} onChange={e=>setVal(e.target.value)} onBlur={save} onKeyDown={e=>e.key==='Enter'&&save()} style={{flex:1,background:'transparent',border:'none',borderBottom:`1px solid ${col}`,color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:2,outline:'none'}}/>
        :<span style={{flex:1,fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:2,textTransform:'uppercase'}}>{name}</span>}
      {isCommissioner&&!editing&&<button onClick={()=>{setVal(name);setEditing(true)}} style={{...S.icon('var(--gold-dark)'),fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>✎</button>}
      {isCommissioner&&onDelete&&<button onClick={onDelete} style={{...S.icon(),fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>🗑</button>}
    </div>
  )
}

function LegacyChamp({champ}) {
  return (
    <div style={{minWidth:140,display:'flex',flexDirection:'column'}}>
      <div style={{textAlign:'center',padding:'7px 4px',background:'var(--charcoal-2)',borderBottom:'1px solid var(--border)'}}><p style={{fontFamily:'Cinzel Decorative',color:'var(--gold)',fontSize:9,letterSpacing:2,margin:0}}>Champion</p></div>
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',padding:14}}>
        {champ?<div style={{textAlign:'center'}}><Avatar player={champ} size={56} ring/><p style={{color:'var(--gold)',fontFamily:'Cinzel',fontWeight:700,fontSize:11,margin:'7px 0 2px'}}>{champ.name}</p></div>:<p style={{color:'var(--charcoal-4)',fontSize:11,textAlign:'center',fontFamily:'IM Fell English',fontStyle:'italic'}}>To be decided</p>}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function BracketTab({ players, tournament, matches, isCommissioner, setActiveMatch, setTab }) {
  const structure = tournament?.bracket

  const handleGenerate = async (structure) => {
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({id:'season6',bracket:structure,status:'active',updated_at:new Date().toISOString()})
    if (structure.type==='freeform') {
      for (const sec of structure.sections) {
        for (let ri=0;ri<sec.rounds.length;ri++) {
          const rnd=sec.rounds[ri]
          for (let mi=0;mi<rnd.matches.length;mi++) {
            const m=rnd.matches[mi]
            if(slotIsBye(m.p1)&&slotIsBye(m.p2)) continue
            await supabase.from('matches').insert({round_index:ri,match_index:mi,bracket_section:sec.id,section_round_index:ri,freeform_round_id:rnd.id,player1_id:slotPlayer(m.p1)?.id||null,player2_id:slotPlayer(m.p2)?.id||null,rounds:[],total_net1:0,total_net2:0,status:'pending'})
          }
        }
      }
    } else {
      const ins=(rnd,ri,sec)=>Promise.all((rnd.matches??[]).map((m,mi)=>{
        if(slotIsBye(m.p1)&&slotIsBye(m.p2)) return Promise.resolve()
        return supabase.from('matches').insert({round_index:ri,match_index:mi,bracket_section:sec,section_round_index:ri,player1_id:slotPlayer(m.p1)?.id||m.p1?.id||null,player2_id:slotPlayer(m.p2)?.id||m.p2?.id||null,rounds:[],total_net1:0,total_net2:0,status:'pending'})
      }))
      if(structure.type==='single'){for(let ri=0;ri<structure.rounds.length;ri++) await ins(structure.rounds[ri],ri,'winners')}
      else{for(let ri=0;ri<structure.winners.length;ri++) await ins(structure.winners[ri],ri,'winners');for(let ri=0;ri<structure.losers.length;ri++) await ins(structure.losers[ri],ri,'losers');await ins(structure.grandFinal,0,'grand_final')}
    }
  }

  const handleReset = async () => {
    if(!window.confirm('Reset entire bracket? This cannot be undone.')) return
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({id:'season6',bracket:null,status:'setup',updated_at:new Date().toISOString()})
  }

  if (!structure) {
    if (!isCommissioner) return <div style={{padding:'32px 20px',textAlign:'center'}}><p style={{color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic',fontSize:15}}>🔒 Commissioner access required.</p></div>
    return <FreeformBuilder players={players} onGenerate={handleGenerate}/>
  }
  return <BracketViewer structure={structure} matches={matches} players={players} isCommissioner={isCommissioner} onReset={handleReset} setActiveMatch={setActiveMatch} setTab={setTab}/>
}
