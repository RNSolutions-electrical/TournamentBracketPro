import { useState, useRef, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { generateId, shuffle, getDefaultRoundName } from '../lib/game'

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  label: { fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase' },
  ghost: (c='var(--gold-dark)') => ({ padding:'5px 10px', borderRadius:7, border:`1px dashed ${c}`, background:'transparent', color:c, fontFamily:'Cinzel', fontSize:9, letterSpacing:2, cursor:'pointer', textTransform:'uppercase' }),
  icon:  (c='var(--red-accent)') => ({ background:'none', border:'none', color:c, cursor:'pointer', fontSize:13, padding:'0 3px', lineHeight:1, opacity:.45, transition:'opacity .15s' }),
}
const sCol = { winners:'var(--gold)', losers:'#ef4444', consolation:'#8b5cf6', pre:'#10b981', grand_final:'#e2c97e' }

// ─── Slot types ───────────────────────────────────────────────────────────────
// slot = null | { type:'player', player } | { type:'winner_of', matchId, matchLabel } | { type:'bye' }
const mkPlayer  = p  => p ? { type:'player', player:p } : null
const mkWinner  = (id,lbl) => ({ type:'winner_of', matchId:id, matchLabel:lbl })
const mkBye     = () => ({ type:'bye' })
const slotP     = s  => s?.type==='player' ? s.player : null
const isWinner  = s  => s?.type==='winner_of'
const isBye     = s  => s?.type==='bye'

// Get flat list of all matches with human labels (for winner_of linking)
function allMatchList(sections) {
  const out = []
  sections.forEach(sec => sec.rounds.forEach((rnd,ri) => rnd.matches.forEach((m,mi) => {
    const p1name = slotP(m.p1)?.name || (isWinner(m.p1) ? `W:${m.p1.matchLabel}` : '—')
    const p2name = slotP(m.p2)?.name || (isWinner(m.p2) ? `W:${m.p2.matchLabel}` : '—')
    out.push({ id:m.id, secName:sec.name||'Section', rndName:rnd.name||`Round ${ri+1}`, matchNum:mi+1, p1name, p2name })
  })))
  return out
}

// ─── Inline Slot Editor ───────────────────────────────────────────────────────
// Replaces the old modal. Shows directly in-line under the slot button.
function SlotEditor({ slot, matchId, allMatches, players, usedPlayerIds, onSet, onClose }) {
  const [mode, setMode] = useState(isWinner(slot) ? 'winner' : 'player')
  const [q, setQ] = useState('')

  const filtPlayers = players.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.nickname||'').toLowerCase().includes(q.toLowerCase()))
  const filtMatches = allMatches.filter(m => m.id !== matchId && (!q || `${m.secName} ${m.rndName} ${m.p1name} ${m.p2name}`.toLowerCase().includes(q.toLowerCase())))

  return (
    <div style={{ position:'fixed', inset:0, zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.85)', backdropFilter:'blur(4px)' }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'var(--charcoal-2)', border:'1px solid var(--border-bright)', borderRadius:14, width:340, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:3, textTransform:'uppercase' }}>Assign Slot</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--cream-dim)', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {/* Mode toggle */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', padding:'10px 14px 0' }}>
          <button onClick={()=>{setMode('player');setQ('')}}
            style={{ padding:'9px 0', borderRadius:'8px 0 0 8px', border:`1.5px solid ${mode==='player'?'var(--gold)':'var(--border)'}`, borderRight:'none', background:mode==='player'?'var(--gold)':'transparent', color:mode==='player'?'var(--charcoal)':'var(--cream-dim)', fontFamily:'Cinzel', fontSize:10, fontWeight:700, cursor:'pointer', letterSpacing:1 }}>
            👤 Player
          </button>
          <button onClick={()=>{setMode('winner');setQ('')}}
            style={{ padding:'9px 0', borderRadius:'0 8px 8px 0', border:`1.5px solid ${mode==='winner'?'#10b981':'var(--border)'}`, background:mode==='winner'?'#10b981':'transparent', color:mode==='winner'?'var(--charcoal)':'#10b981', fontFamily:'Cinzel', fontSize:10, fontWeight:700, cursor:'pointer', letterSpacing:1 }}>
            🔗 Winner Of
          </button>
        </div>

        {mode==='winner' && (
          <p style={{ margin:'8px 14px 0', color:'#10b981', fontSize:10, fontFamily:'Cinzel', letterSpacing:1 }}>
            Pick a match → this slot auto-fills with its winner
          </p>
        )}

        {/* Search */}
        <div style={{ padding:'8px 14px 0' }}>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
            placeholder={mode==='player' ? 'Search player…' : `Search ${filtMatches.length} match${filtMatches.length!==1?'es':''}…`}
            style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border-bright)', background:'var(--charcoal-3)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Oswald', boxSizing:'border-box' }} />
        </div>

        {/* List */}
        <div style={{ overflowY:'auto', flex:1, padding:'8px 14px', display:'flex', flexDirection:'column', gap:5 }}>

          {/* PLAYER MODE */}
          {mode==='player' && filtPlayers.map(p => {
            const busy = usedPlayerIds.has(p.id) && slotP(slot)?.id !== p.id
            const active = slotP(slot)?.id === p.id
            return (
              <button key={p.id} onClick={()=>!busy && onSet(mkPlayer(p))}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, textAlign:'left',
                  border:`1px solid ${active?'var(--gold)':busy?'var(--border)':'var(--border)'}`,
                  background:active?'#c8a84b18':'var(--charcoal-3)', cursor:busy?'not-allowed':'pointer', opacity:busy?.4:1 }}>
                <Avatar player={p} size={30}/>
                <div style={{flex:1}}>
                  <p style={{color:'var(--cream)',fontFamily:'Cinzel',fontSize:12,margin:0}}>{p.name}</p>
                  {p.nickname&&<p style={{color:'var(--gold)',fontSize:10,margin:0,fontStyle:'italic'}}>"{p.nickname}"</p>}
                  {busy&&<p style={{color:'#f59e0b',fontSize:9,margin:0}}>already in bracket</p>}
                </div>
                {active&&<span style={{color:'var(--gold)',fontSize:14}}>✓</span>}
              </button>
            )
          })}
          {mode==='player' && filtPlayers.length===0 && <p style={{color:'var(--cream-dim)',fontSize:12,textAlign:'center',padding:'8px 0',fontFamily:'IM Fell English',fontStyle:'italic'}}>No players found</p>}

          {/* WINNER OF MODE */}
          {mode==='winner' && filtMatches.length===0 && (
            <div style={{textAlign:'center',padding:'16px 8px'}}>
              <p style={{color:'var(--cream-dim)',fontSize:13,fontFamily:'IM Fell English',fontStyle:'italic',marginBottom:8}}>
                {allMatches.filter(m=>m.id!==matchId).length===0 ? 'No other matches exist yet.' : 'No matches match your search.'}
              </p>
              {allMatches.filter(m=>m.id!==matchId).length===0&&<p style={{color:'var(--charcoal-4)',fontSize:11}}>Add your other matches (Pre-Round, etc.) first, then come back to link this slot.</p>}
            </div>
          )}
          {mode==='winner' && filtMatches.map(m => {
            const active = isWinner(slot) && slot.matchId===m.id
            return (
              <button key={m.id} onClick={()=>onSet(mkWinner(m.id, `${m.secName} M${m.matchNum}`))}
                style={{ display:'flex', flexDirection:'column', padding:'10px 12px', borderRadius:9, textAlign:'left',
                  border:`2px solid ${active?'#10b981':'var(--border)'}`, background:active?'#10b98118':'var(--charcoal-3)', cursor:'pointer' }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                  <span style={{color:active?'#10b981':'var(--gold)',fontFamily:'Cinzel',fontSize:10,letterSpacing:1,fontWeight:700}}>
                    {m.secName} — {m.rndName} — Match {m.matchNum}
                  </span>
                  {active&&<span style={{color:'#10b981',fontSize:14}}>✓</span>}
                </div>
                <span style={{color:'var(--cream-dim)',fontSize:12}}>
                  <span style={{color:'var(--cream)'}}>{m.p1name}</span>
                  <span style={{color:'var(--gold-dark)',margin:'0 6px'}}>vs</span>
                  <span style={{color:'var(--cream)'}}>{m.p2name}</span>
                </span>
                {active&&<span style={{color:'#10b981',fontSize:10,marginTop:4,fontFamily:'Cinzel',letterSpacing:1}}>LINKED — slot fills with this match's winner</span>}
              </button>
            )
          })}
        </div>

        {/* Footer actions */}
        <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
          <button onClick={()=>onSet(mkBye())} style={{flex:1,padding:'7px 0',borderRadius:7,border:'1px solid #ef444466',background:'transparent',color:'#ef4444',fontFamily:'Cinzel',fontSize:9,cursor:'pointer',letterSpacing:2}}>BYE</button>
          {slot&&<button onClick={()=>onSet(null)} style={{flex:1,padding:'7px 0',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,cursor:'pointer',letterSpacing:2}}>CLEAR</button>}
        </div>
      </div>
    </div>
  )
}

// ─── Slot display button ──────────────────────────────────────────────────────
function SlotBtn({ slot, label, col, onOpen }) {
  const player = slotP(slot)
  const linked = isWinner(slot)
  const bye    = isBye(slot)
  const empty  = !slot

  let bg='#ffffff05', border='var(--border)', text='var(--charcoal-4)', display=`Assign ${label}`, icon=null
  if (bye)    { bg='#7f1d1d22'; border='#ef444466'; text='#ef4444'; display='BYE' }
  else if (linked) { bg='#10b98118'; border='#10b98166'; text='#10b981'; display=`🔗 W: ${slot.matchLabel||'?'}`; }
  else if (player) { bg='var(--charcoal-3)'; border='var(--border)'; text='var(--cream)'; display=player.name }

  return (
    <button onClick={onOpen}
      style={{ flex:1, display:'flex', alignItems:'center', gap:6, padding:'6px 9px', borderRadius:8,
        border:`1.5px solid ${border}`, background:bg, cursor:'pointer', minWidth:0, textAlign:'left',
        transition:'border-color .12s' }}
      onMouseEnter={e=>e.currentTarget.style.borderColor=col||'var(--gold)'}
      onMouseLeave={e=>e.currentTarget.style.borderColor=border}>
      {player && <Avatar player={player} size={22}/>}
      {linked && <span style={{fontSize:16,flexShrink:0}}>🔗</span>}
      {bye    && <span style={{fontSize:14,flexShrink:0}}>✗</span>}
      {empty  && <span style={{fontSize:14,flexShrink:0,color:'var(--charcoal-4)'}}>+</span>}
      <span style={{ color:text, fontSize:11, fontFamily:player||linked?'Cinzel':'Oswald',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, fontWeight:linked?600:400 }}>
        {display}
      </span>
    </button>
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
    ]},
  ])
  const [editor, setEditor] = useState(null) // { secId, rndId, matchId, slot:'p1'|'p2' }
  const [generating, setGenerating] = useState(false)
  const dragRef = useRef(null)

  const matchList = useMemo(() => allMatchList(sections), [sections])

  // ── CRUD ──
  const addSection  = t => { const names={winners:'Main Bracket',losers:'Losers Bracket',consolation:'Consolation',pre:'Pre-Round',grand_final:'Grand Final'}; setSections(s=>[...s,{id:generateId(),name:names[t]||'New Section',type:t,rounds:[{id:generateId(),name:'',matches:[{id:generateId(),p1:null,p2:null}]}]}]) }
  const delSection  = sid => setSections(s=>s.filter(x=>x.id!==sid))
  const updSection  = (sid,p) => setSections(s=>s.map(x=>x.id===sid?{...x,...p}:x))
  const moveSection = (i,d) => setSections(s=>{ const a=[...s],t=i+d; if(t<0||t>=a.length)return a; [a[i],a[t]]=[a[t],a[i]]; return a })

  const addRound  = sid => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:[...x.rounds,{id:generateId(),name:'',matches:[{id:generateId(),p1:null,p2:null}]}]}))
  const delRound  = (sid,rid) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.filter(r=>r.id!==rid)}))
  const updRound  = (sid,rid,p) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,...p})}))

  const addMatch  = (sid,rid) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:[...r.matches,{id:generateId(),p1:null,p2:null}]})}))
  const delMatch  = (sid,rid,mid) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.filter(m=>m.id!==mid)})}))
  const updMatch  = (sid,rid,mid,p) => setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.map(m=>m.id!==mid?m:{...m,...p})})}))

  // Set a slot value; also clears same player from other slots
  const setSlot = (sid, rid, mid, slotKey, value) => {
    const pid = slotP(value)?.id
    setSections(s => s.map(sec => ({...sec, rounds:sec.rounds.map(r => ({...r, matches:r.matches.map(m => {
      let updated = {...m}
      // Clear this player from everywhere else first
      if (pid) {
        if (slotP(m.p1)?.id===pid && !(sec.id===sid&&r.id===rid&&m.id===mid&&slotKey==='p1')) updated.p1=null
        if (slotP(m.p2)?.id===pid && !(sec.id===sid&&r.id===rid&&m.id===mid&&slotKey==='p2')) updated.p2=null
      }
      if (sec.id===sid && r.id===rid && m.id===mid) updated[slotKey]=value
      return updated
    })}))})))
    setEditor(null)
  }

  const fillRandom = (sid,rid) => {
    const used = new Set(sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[slotP(m.p1)?.id,slotP(m.p2)?.id].filter(Boolean)))))
    const avail = shuffle(players.filter(p=>!used.has(p.id)))
    setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.map(m=>{
      const mm={...m}
      if(!mm.p1&&avail.length) mm.p1=mkPlayer(avail.shift())
      if(!mm.p2&&avail.length) mm.p2=mkPlayer(avail.shift())
      return mm
    })})}))
  }

  const onDragStart = (e,sid,rid,idx)=>{ dragRef.current={sid,rid,idx}; e.dataTransfer.effectAllowed='move' }
  const onDrop = (e,sid,rid,toIdx)=>{ e.preventDefault(); const {sid:fs,rid:fr,idx:fi}=dragRef.current||{}; if(!fs||fs!==sid||fr!==rid||fi===toIdx)return; setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>{ if(r.id!==rid)return r; const ms=[...r.matches],[mv]=ms.splice(fi,1); ms.splice(toIdx,0,mv); return {...r,matches:ms} })})); dragRef.current=null }

  const handleGenerate = async () => {
    setGenerating(true)
    try { await onGenerate({ type:'freeform', sections: sections.map(s=>({...s, rounds:s.rounds.map(r=>({...r, matches:r.matches.map(m=>({...m,score1:0,score2:0,winner:null}))})) })) }) }
    finally { setGenerating(false) }
  }

  const allUsed = useMemo(()=>new Set(sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[slotP(m.p1)?.id,slotP(m.p2)?.id].filter(Boolean))))),[sections])
  const unplaced = players.filter(p=>!allUsed.has(p.id))
  const totalMatches = sections.reduce((a,s)=>a+s.rounds.reduce((b,r)=>b+r.matches.length,0),0)

  const editorMatch = editor && sections.flatMap(s=>s.rounds.flatMap(r=>r.matches)).find(m=>m.id===editor.matchId)
  const editorSlotValue = editor ? (editor.slot==='p1' ? editorMatch?.p1 : editorMatch?.p2) : null

  return (
    <div style={{padding:'16px',maxWidth:700,margin:'0 auto'}}>
      <div style={{marginBottom:16}}>
        <h2 style={{...S.label,fontSize:13,letterSpacing:5,display:'block',marginBottom:4}}>Build Bracket</h2>
        <p style={{color:'var(--cream-dim)',fontSize:12}}>Season 6 · Full Commissioner Control</p>
      </div>

      {players.length<2&&<div style={{background:'var(--charcoal-2)',borderRadius:10,padding:12,color:'#f59e0b',marginBottom:12,border:'1px solid #f59e0b44',fontSize:12}}>⚠ Add at least 2 players first.</div>}

      {/* Unplaced */}
      {unplaced.length>0&&<div style={{background:'var(--charcoal-2)',borderRadius:10,padding:'8px 14px',marginBottom:12,border:'1px solid #f59e0b33',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{color:'#f59e0b',fontSize:10,fontFamily:'Cinzel',letterSpacing:1,flexShrink:0}}>UNPLACED:</span>
        {unplaced.map(p=><span key={p.id} style={{display:'flex',alignItems:'center',gap:4,background:'var(--charcoal-3)',borderRadius:6,padding:'3px 8px'}}><Avatar player={p} size={18}/><span style={{color:'var(--cream-dim)',fontSize:11}}>{p.name}</span></span>)}
      </div>}

      {/* Sections */}
      {sections.map((sec,si)=>{
        const col=sCol[sec.type]||'var(--gold)'
        return (
          <div key={sec.id} style={{background:'var(--charcoal-2)',borderRadius:14,border:`1px solid ${col}33`,marginBottom:12,overflow:'hidden'}}>
            {/* Section header */}
            <div style={{background:'var(--charcoal-3)',padding:'9px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${col}44`}}>
              <div style={{width:3,height:18,borderRadius:2,background:col,flexShrink:0}}/>
              <input value={sec.name} onChange={e=>updSection(sec.id,{name:e.target.value})}
                style={{flex:1,background:'transparent',border:'none',color:col,fontFamily:'Cinzel',fontWeight:700,fontSize:12,letterSpacing:2,outline:'none',textTransform:'uppercase'}}/>
              <select value={sec.type} onChange={e=>updSection(sec.id,{type:e.target.value})}
                style={{background:'var(--charcoal-2)',border:'1px solid var(--border)',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,borderRadius:6,padding:'3px 6px',cursor:'pointer',outline:'none'}}>
                <option value="pre">Pre-Round</option>
                <option value="winners">Winners</option>
                <option value="losers">Losers</option>
                <option value="consolation">Consolation</option>
                <option value="grand_final">Grand Final</option>
              </select>
              <button onClick={()=>moveSection(si,-1)} disabled={si===0} style={{background:'none',border:'none',color:'var(--cream-dim)',cursor:'pointer',fontSize:13,opacity:si===0?.2:.6,padding:'0 2px'}}>↑</button>
              <button onClick={()=>moveSection(si,1)} disabled={si===sections.length-1} style={{background:'none',border:'none',color:'var(--cream-dim)',cursor:'pointer',fontSize:13,opacity:si===sections.length-1?.2:.6,padding:'0 2px'}}>↓</button>
              <button onClick={()=>delSection(sec.id)} style={{background:'none',border:'none',color:'var(--red-accent)',cursor:'pointer',fontSize:16,opacity:.5,padding:'0 4px'}}
                onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.5'}>×</button>
            </div>

            {/* Rounds */}
            <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:10}}>
              {sec.rounds.map((rnd,ri)=>(
                <div key={rnd.id} style={{background:'var(--charcoal-3)',borderRadius:10,overflow:'hidden',border:'1px solid var(--border)'}}>
                  <div style={{padding:'7px 12px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid var(--border)',background:'var(--charcoal-2)'}}>
                    <input value={rnd.name} onChange={e=>updRound(sec.id,rnd.id,{name:e.target.value})} placeholder={`Round ${ri+1}`}
                      style={{flex:1,background:'transparent',border:'none',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,letterSpacing:2,outline:'none',textTransform:'uppercase'}}/>
                    <button onClick={()=>fillRandom(sec.id,rnd.id)} style={S.ghost('#10b981')}>🎲 Fill</button>
                    <button onClick={()=>addMatch(sec.id,rnd.id)} style={S.ghost()}>+ Match</button>
                    <button onClick={()=>delRound(sec.id,rnd.id)} style={S.icon()} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>🗑</button>
                  </div>

                  <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:5}}>
                    {rnd.matches.map((m,mi)=>(
                      <div key={m.id} draggable
                        onDragStart={e=>onDragStart(e,sec.id,rnd.id,mi)}
                        onDragOver={e=>e.preventDefault()} onDrop={e=>onDrop(e,sec.id,rnd.id,mi)}
                        style={{display:'flex',alignItems:'center',gap:6,background:'var(--charcoal-2)',borderRadius:8,padding:'6px 10px',border:'1px solid var(--border)'}}>
                        <span style={{color:'var(--charcoal-4)',fontSize:11,userSelect:'none',cursor:'grab'}}>⠿</span>
                        <span style={{color:'var(--gold-dark)',fontFamily:'Cinzel',fontSize:9,width:16,flexShrink:0,textAlign:'right'}}>{mi+1}</span>
                        <SlotBtn slot={m.p1} label="P1" col={col} onOpen={()=>setEditor({secId:sec.id,rndId:rnd.id,matchId:m.id,slot:'p1'})}/>
                        <span style={{color:'var(--gold-dark)',fontFamily:'Cinzel',fontSize:9,flexShrink:0}}>vs</span>
                        <SlotBtn slot={m.p2} label="P2" col={col} onOpen={()=>setEditor({secId:sec.id,rndId:rnd.id,matchId:m.id,slot:'p2'})}/>
                        <button onClick={()=>delMatch(sec.id,rnd.id,m.id)} style={S.icon()} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>×</button>
                      </div>
                    ))}
                    {rnd.matches.length===0&&<p style={{color:'var(--charcoal-4)',fontSize:11,textAlign:'center',padding:'4px 0',fontFamily:'IM Fell English',fontStyle:'italic'}}>No matches — click + Match</p>}
                  </div>
                </div>
              ))}
              <button onClick={()=>addRound(sec.id)} style={{...S.ghost(col),width:'100%',padding:'7px 0',textAlign:'center'}}>+ Add Round to {sec.name||'Section'}</button>
            </div>
          </div>
        )
      })}

      {/* Add section */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        {[['pre','+ Pre-Round','#10b981'],['winners','+ Winners','var(--gold)'],['losers','+ Losers','#ef4444'],['consolation','+ Consolation','#8b5cf6'],['grand_final','+ Grand Final','#e2c97e']].map(([t,l,c])=>(
          <button key={t} onClick={()=>addSection(t)} style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${c}66`,background:'transparent',color:c,fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase'}}>{l}</button>
        ))}
      </div>

      <button onClick={handleGenerate} disabled={generating||totalMatches===0}
        style={{width:'100%',padding:'13px 0',borderRadius:10,border:'1px solid var(--gold)',background:totalMatches>0?'var(--gold)':'transparent',color:totalMatches>0?'var(--charcoal)':'var(--gold-dark)',fontFamily:'Cinzel Decorative',fontWeight:700,fontSize:14,cursor:totalMatches>0?'pointer':'not-allowed',letterSpacing:1}}>
        {generating?'Locking In…':`⚔ Lock In Bracket  (${totalMatches} matches)`}
      </button>

      {/* Slot editor overlay */}
      {editor&&(
        <SlotEditor
          slot={editorSlotValue}
          matchId={editor.matchId}
          allMatches={matchList}
          players={players}
          usedPlayerIds={allUsed}
          onSet={value=>setSlot(editor.secId,editor.rndId,editor.matchId,editor.slot,value)}
          onClose={()=>setEditor(null)}
        />
      )}
    </div>
  )
}

// ─── Live Bracket Viewer ──────────────────────────────────────────────────────
function BracketViewer({ structure, matches, players, isCommissioner, onReset, setActiveMatch, setTab }) {
  const [liveEditor, setLiveEditor] = useState(null)

  const getPlayer = id => players.find(p=>p.id===id)
  const isFreeform = structure.type==='freeform'
  const isSingle   = !structure.type||structure.type==='single'
  const rounds     = isSingle?(structure.rounds??[]):null
  const winners    = !isSingle&&!isFreeform?(structure.winners??[]):null
  const losers     = !isSingle&&!isFreeform?(structure.losers??[]):null
  const gfRound    = !isSingle&&!isFreeform?(structure.grandFinal??{matches:[],name:'Grand Final',type:'grand_final'}):null
  const sections   = isFreeform?(structure.sections??[]):null

  // Match list for winner_of linking in live editor
  const liveMatchList = useMemo(()=>isFreeform?allMatchList(sections??[]):[],[structure])

  const openMatch = dbm => { setActiveMatch({matchId:dbm.id}); setTab('Scoreboard') }

  const getDbm = (secId,rndId,mi) =>
    matches.find(m=>m.bracket_section===secId&&m.match_index===mi&&(m.freeform_round_id===rndId||m.section_round_index===(sections?.find(s=>s.id===secId)?.rounds?.findIndex(r=>r.id===rndId)??0))) ||
    matches.find(m=>m.bracket_section===secId&&m.match_index===mi)

  // Resolve a slot to a live player (checking DB winner chain)
  const resolveSlot = (slot, dbId) => {
    if (dbId) return getPlayer(dbId)
    if (!slot) return null
    if (slot.type==='player') return slot.player
    if (slot.type==='winner_of') {
      for (const sec of (sections||[])) for (let ri=0;ri<sec.rounds.length;ri++) { const rnd=sec.rounds[ri]; for (let mi=0;mi<rnd.matches.length;mi++) { if(rnd.matches[mi].id===slot.matchId) { const src=getDbm(sec.id,rnd.id,mi); return src?.winner_id?getPlayer(src.winner_id):null } } }
      return null
    }
    return null
  }

  const mutateBracket = async updater => {
    const {data}=await supabase.from('tournament').select('bracket').eq('id','season6').single()
    if(!data?.bracket)return
    await supabase.from('tournament').update({bracket:updater(JSON.parse(JSON.stringify(data.bracket))),updated_at:new Date().toISOString()}).eq('id','season6')
  }

  const renameRound  = async (si,ri,name) => mutateBracket(b=>{if(b.sections?.[si]?.rounds?.[ri])b.sections[si].rounds[ri].name=name;return b})
  const addLiveRound = async si => { const rid=generateId(); await mutateBracket(b=>{if(b.sections?.[si])b.sections[si].rounds.push({id:rid,name:'',matches:[{id:generateId(),p1:null,p2:null}]});return b}); const sec=structure.sections?.[si];if(sec)await supabase.from('matches').insert({round_index:sec.rounds.length,match_index:0,bracket_section:sec.id,section_round_index:sec.rounds.length,freeform_round_id:rid,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'}) }
  const addLiveMatch = async (si,ri) => { const sec=structure.sections?.[si],rnd=sec?.rounds?.[ri];if(!rnd)return;const mi=rnd.matches.length,mid=generateId();await mutateBracket(b=>{if(b.sections?.[si]?.rounds?.[ri])b.sections[si].rounds[ri].matches.push({id:mid,p1:null,p2:null});return b});await supabase.from('matches').insert({round_index:ri,match_index:mi,bracket_section:sec.id,section_round_index:ri,freeform_round_id:rnd.id,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'}) }
  const delLiveMatch = async (si,ri,mi) => { if(!window.confirm('Remove match?'))return;const sec=structure.sections?.[si],rnd=sec?.rounds?.[ri];if(!rnd)return;await mutateBracket(b=>{if(b.sections?.[si]?.rounds?.[ri])b.sections[si].rounds[ri].matches=b.sections[si].rounds[ri].matches.filter((_,i)=>i!==mi);return b});const d=getDbm(sec.id,rnd.id,mi);if(d)await supabase.from('matches').delete().eq('id',d.id) }
  const delLiveRound = async (si,ri) => { if(!window.confirm('Remove round?'))return;const sec=structure.sections?.[si],rnd=sec?.rounds?.[ri];if(!rnd)return;await mutateBracket(b=>{if(b.sections?.[si])b.sections[si].rounds=b.sections[si].rounds.filter((_,i)=>i!==ri);return b});const rows=matches.filter(m=>m.bracket_section===sec.id&&m.freeform_round_id===rnd.id);await Promise.all(rows.map(m=>supabase.from('matches').delete().eq('id',m.id))) }

  const doAssignLive = async (matchId,field,playerId) => {
    await supabase.from('matches').update({[field]:playerId||null,updated_at:new Date().toISOString()}).eq('id',matchId)
    setLiveEditor(null)
  }

  const usedIds = new Set(matches.flatMap(m=>[m.player1_id,m.player2_id].filter(Boolean)))

  const getChampion = () => {
    if(isFreeform&&sections?.length){const ls=sections[sections.length-1];const lr=ls?.rounds?.[ls.rounds.length-1];if(!lr)return null;const d=getDbm(ls.id,lr.id,0);return d?.winner_id?getPlayer(d.winner_id):null}
    if(isSingle){const d=matches.find(m=>(m.bracket_section==='winners'||!m.bracket_section)&&m.round_index===rounds.length-1&&m.match_index===0);return d?.winner_id?getPlayer(d.winner_id):null}
    const d=matches.find(m=>m.bracket_section==='grand_final'&&m.match_index===0);return d?.winner_id?getPlayer(d.winner_id):null
  }
  const champ = getChampion()

  // ── Match card ──
  const MatchCard = ({bm,dbm,si,ri,mi}) => {
    if(!bm)return null
    const sec = isFreeform?sections?.[si]:null
    const p1  = resolveSlot(bm.p1,dbm?.player1_id)
    const p2  = resolveSlot(bm.p2,dbm?.player2_id)
    const s1=dbm?.total_net1||0,s2=dbm?.total_net2||0,wId=dbm?.winner_id,done=dbm?.status==='complete'

    if(isBye(bm.p1)&&isBye(bm.p2))return <div style={{background:'var(--charcoal-3)',borderRadius:7,padding:'5px 9px',opacity:.3,border:'1px dashed var(--border)',fontSize:10,color:'var(--cream-dim)',textAlign:'center',fontFamily:'Cinzel',marginBottom:4}}>— BYE —</div>

    return (
      <div style={{position:'relative',marginBottom:5}}>
        <div onClick={()=>dbm&&openMatch(dbm)}
          style={{background:'var(--charcoal-2)',borderRadius:9,padding:'7px 9px',border:`1.5px solid ${done?'var(--gold-dark)':'var(--border)'}`,cursor:dbm?'pointer':'default',transition:'border-color .12s'}}
          onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'} onMouseLeave={e=>e.currentTarget.style.borderColor=done?'var(--gold-dark)':'var(--border)'}>
          {[{slot:bm.p1,res:p1,s:s1,win:wId&&wId===p1?.id,field:'player1_id'},{slot:bm.p2,res:p2,s:s2,win:wId&&wId===p2?.id,field:'player2_id'}].map(({slot,res,s,win,field},i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:5,padding:'2px 0'}}>
              <div onClick={e=>{e.stopPropagation();dbm&&isCommissioner&&!done&&setLiveEditor({matchId:dbm.id,field,current:res})}} style={{flexShrink:0,cursor:isCommissioner?'pointer':'default'}}><Avatar player={res} size={20}/></div>
              <span style={{flex:1,color:win?'var(--gold)':res?'var(--cream)':isWinner(slot)?'#10b981':'var(--charcoal-4)',fontSize:11,fontFamily:win||isWinner(slot)?'Cinzel':'Oswald',fontWeight:win?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {isBye(slot)?'BYE':res?(res.nickname?`"${res.nickname}"`:res.name):isWinner(slot)?`🔗 W: ${slot.matchLabel||'?'}`:'TBD'}
              </span>
              <span style={{color:win?'var(--gold)':'var(--cream-dim)',fontWeight:win?700:400,fontSize:12,fontFamily:'Cinzel',flexShrink:0}}>{s}</span>
              {isCommissioner&&!done&&dbm&&<button onClick={e=>{e.stopPropagation();setLiveEditor({matchId:dbm.id,field,current:res})}} style={{...S.icon('var(--gold-dark)'),opacity:.35,fontSize:9}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.35'}>✎</button>}
            </div>
          ))}
          {done&&<div style={{fontSize:8,color:'var(--gold-dark)',fontFamily:'Cinzel',letterSpacing:2,marginTop:2,textAlign:'right'}}>FINAL</div>}
        </div>
        {isCommissioner&&isFreeform&&<button onClick={()=>delLiveMatch(si,ri,mi)} style={{...S.icon(),position:'absolute',top:2,right:2,fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>×</button>}
      </div>
    )
  }

  // ── Round column ──
  const RoundCol = ({rnd,ri,sec,si}) => {
    if(!rnd)return null
    const col=sCol[sec?.type]||'var(--gold)'
    const name=rnd.name||(sec?.type==='grand_final'?'Grand Final':`Round ${ri+1}`)
    return (
      <div style={{flex:1,minWidth:172,display:'flex',flexDirection:'column'}}>
        <RHdr name={name} col={col} isComm={isCommissioner} onRename={n=>renameRound(si,ri,n)} onDelete={isCommissioner?()=>delLiveRound(si,ri):null}/>
        <div style={{flex:1,display:'flex',flexDirection:'column',padding:'8px 5px',borderRight:'1px solid var(--border)'}}>
          {(rnd.matches??[]).map((bm,mi)=>{ const dbm=getDbm(sec.id,rnd.id,mi); return <MatchCard key={bm?.id||mi} bm={bm??{}} dbm={dbm} si={si} ri={ri} mi={mi}/> })}
          {isCommissioner&&<button onClick={()=>addLiveMatch(si,ri)} style={{...S.ghost(col),padding:'4px 0',textAlign:'center',marginTop:2,fontSize:8}}>+ Match</button>}
        </div>
      </div>
    )
  }

  if(isSingle&&rounds.length===0)return(<div style={{padding:40,textAlign:'center'}}><p style={{color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic',fontSize:14}}>Bracket is empty. Reset and regenerate.</p>{isCommissioner&&<button onClick={onReset} style={{marginTop:16,padding:'8px 20px',borderRadius:8,border:'1px solid var(--red-accent)',background:'none',color:'var(--red-accent)',cursor:'pointer',fontFamily:'Cinzel',fontSize:12}}>Reset</button>}</div>)

  return (
    <div style={{padding:'12px 10px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <p style={{...S.label,letterSpacing:4,margin:0}}>Season 6 · {isFreeform?'Custom':isSingle?'Single Elim':'Double Elim'}</p>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {isCommissioner&&isFreeform&&[['pre','Pre','#10b981'],['winners','Round','var(--gold)'],['consolation','Consol.','#8b5cf6'],['grand_final','G.Final','#e2c97e']].map(([t,l,c])=>(
            <button key={t} onClick={async()=>{ const sid=generateId(),rid=generateId(),names={pre:'Pre-Round',winners:'New Round',consolation:'Consolation',grand_final:'Grand Final'}; await mutateBracket(b=>{b.sections.push({id:sid,name:names[t],type:t,rounds:[{id:rid,name:'',matches:[{id:generateId(),p1:null,p2:null}]}]});return b}); await supabase.from('matches').insert({round_index:0,match_index:0,bracket_section:sid,section_round_index:0,freeform_round_id:rid,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'}) }}
              style={{padding:'4px 9px',borderRadius:7,border:`1px solid ${c}55`,background:'transparent',color:c,fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase'}}>+ {l}</button>
          ))}
          {isCommissioner&&<button onClick={onReset} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--red-accent)',background:'none',color:'var(--red-accent)',cursor:'pointer',fontSize:10,fontFamily:'Cinzel'}}>Reset</button>}
        </div>
      </div>

      <div style={{overflowX:'auto',paddingBottom:16}}>
        {isFreeform&&sections&&(
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {sections.map((sec,si)=>{ const col=sCol[sec.type]||'var(--gold)'; return (
              <div key={sec.id}>
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',background:'var(--charcoal-3)',borderRadius:'8px 8px 0 0',borderBottom:`2px solid ${col}44`}}>
                  <div style={{width:3,height:14,borderRadius:2,background:col,flexShrink:0}}/>
                  <span style={{fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:3,textTransform:'uppercase',flex:1}}>{sec.name||`Section ${si+1}`}</span>
                  {isCommissioner&&<button onClick={()=>addLiveRound(si)} style={{...S.ghost(col),padding:'2px 8px',fontSize:8}}>+ Round</button>}
                </div>
                <div style={{display:'flex',gap:0,overflowX:'auto',minWidth:sec.rounds.length*176}}>
                  {sec.rounds.map((rnd,ri)=><RoundCol key={rnd.id||ri} rnd={rnd} ri={ri} sec={sec} si={si}/>)}
                </div>
              </div>
            )})}
            {champ&&<div style={{textAlign:'center',padding:'14px 0'}}><p style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:10,letterSpacing:4,textTransform:'uppercase',marginBottom:10}}>🏆 Champion</p><Avatar player={champ} size={60} ring/><p style={{color:'var(--gold)',fontFamily:'Cinzel',fontWeight:700,fontSize:12,marginTop:7}}>{champ.name}</p></div>}
          </div>
        )}
        {isSingle&&<div style={{display:'flex',gap:0,minWidth:rounds.length*173+140}}>{rounds.map((r,ri)=><RoundCol key={ri} rnd={r} ri={ri} sec={{id:'winners',name:'',type:'winners'}} si={-1}/>)}<LegChamp champ={champ}/></div>}
        {!isSingle&&!isFreeform&&(
          <div style={{display:'flex',flexDirection:'column',gap:0}}>
            <div style={{marginBottom:4}}><div style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:9,letterSpacing:4,textTransform:'uppercase',padding:'6px 8px',background:'var(--charcoal-3)',borderRadius:'8px 8px 0 0',borderBottom:'1px solid var(--border)'}}>Winners Bracket</div><div style={{display:'flex',gap:0,overflowX:'auto'}}>{winners.map((r,ri)=><RoundCol key={ri} rnd={r} ri={ri} sec={{id:'winners',name:'',type:'winners'}} si={-1}/>)}</div></div>
            <div style={{marginBottom:4}}><div style={{fontFamily:'Cinzel',color:'#ef4444',fontSize:9,letterSpacing:4,textTransform:'uppercase',padding:'6px 8px',background:'var(--charcoal-3)',borderBottom:'1px solid var(--border)'}}>Losers Bracket</div><div style={{display:'flex',gap:0,overflowX:'auto'}}>{losers.map((r,ri)=><RoundCol key={ri} rnd={r} ri={ri} sec={{id:'losers',name:'',type:'losers'}} si={-1}/>)}</div></div>
            <div style={{display:'flex',gap:0}}><RoundCol rnd={gfRound} ri={0} sec={{id:'grand_final',name:'',type:'grand_final'}} si={-1}/><LegChamp champ={champ}/></div>
          </div>
        )}
      </div>

      {/* Live slot editor */}
      {liveEditor&&(
        <SlotEditor
          slot={null}
          matchId={liveEditor.matchId}
          allMatches={liveMatchList}
          players={players}
          usedPlayerIds={usedIds}
          onSet={async value=>{
            if(value?.type==='player') await doAssignLive(liveEditor.matchId,liveEditor.field,value.player?.id)
            else await doAssignLive(liveEditor.matchId,liveEditor.field,null)
          }}
          onClose={()=>setLiveEditor(null)}
        />
      )}
    </div>
  )
}

// ── Round header ──
function RHdr({name,col,isComm,onRename,onDelete}) {
  const [ed,setEd]=useState(false),[v,setV]=useState(name)
  const save=()=>{onRename(v);setEd(false)}
  return (
    <div style={{padding:'6px 8px',background:'var(--charcoal-2)',borderBottom:`1px solid ${col}33`,borderRight:'1px solid var(--border)',minHeight:30,display:'flex',alignItems:'center',gap:4}}>
      {ed?<input autoFocus value={v} onChange={e=>setV(e.target.value)} onBlur={save} onKeyDown={e=>e.key==='Enter'&&save()} style={{flex:1,background:'transparent',border:'none',borderBottom:`1px solid ${col}`,color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:2,outline:'none'}}/>
        :<span style={{flex:1,fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:2,textTransform:'uppercase'}}>{name}</span>}
      {isComm&&!ed&&<button onClick={()=>{setV(name);setEd(true)}} style={{...S.icon('var(--gold-dark)'),fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>✎</button>}
      {isComm&&onDelete&&<button onClick={onDelete} style={{...S.icon(),fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>🗑</button>}
    </div>
  )
}

function LegChamp({champ}) {
  return (<div style={{minWidth:140,display:'flex',flexDirection:'column'}}><div style={{textAlign:'center',padding:'7px 4px',background:'var(--charcoal-2)',borderBottom:'1px solid var(--border)'}}><p style={{fontFamily:'Cinzel Decorative',color:'var(--gold)',fontSize:9,letterSpacing:2,margin:0}}>Champion</p></div><div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',padding:14}}>{champ?<div style={{textAlign:'center'}}><Avatar player={champ} size={56} ring/><p style={{color:'var(--gold)',fontFamily:'Cinzel',fontWeight:700,fontSize:11,margin:'7px 0 2px'}}>{champ.name}</p></div>:<p style={{color:'var(--charcoal-4)',fontSize:11,textAlign:'center',fontFamily:'IM Fell English',fontStyle:'italic'}}>To be decided</p>}</div></div>)
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function BracketTab({ players, tournament, matches, isCommissioner, setActiveMatch, setTab }) {
  const structure = tournament?.bracket

  const handleGenerate = async structure => {
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({id:'season6',bracket:structure,status:'active',updated_at:new Date().toISOString()})
    if(structure.type==='freeform'){
      for(const sec of structure.sections) for(let ri=0;ri<sec.rounds.length;ri++){ const rnd=sec.rounds[ri]; for(let mi=0;mi<rnd.matches.length;mi++){
        const m=rnd.matches[mi]; if(isBye(m.p1)&&isBye(m.p2))continue
        await supabase.from('matches').insert({round_index:ri,match_index:mi,bracket_section:sec.id,section_round_index:ri,freeform_round_id:rnd.id,player1_id:slotP(m.p1)?.id||null,player2_id:slotP(m.p2)?.id||null,rounds:[],total_net1:0,total_net2:0,status:'pending'})
      }}
    } else {
      const ins=(rnd,ri,sec)=>Promise.all((rnd.matches??[]).map((m,mi)=>{if(isBye(m.p1)&&isBye(m.p2))return Promise.resolve();return supabase.from('matches').insert({round_index:ri,match_index:mi,bracket_section:sec,section_round_index:ri,player1_id:slotP(m.p1)?.id||m.p1?.id||null,player2_id:slotP(m.p2)?.id||m.p2?.id||null,rounds:[],total_net1:0,total_net2:0,status:'pending'})}))
      if(structure.type==='single'){for(let ri=0;ri<structure.rounds.length;ri++)await ins(structure.rounds[ri],ri,'winners')}
      else{for(let ri=0;ri<structure.winners.length;ri++)await ins(structure.winners[ri],ri,'winners');for(let ri=0;ri<structure.losers.length;ri++)await ins(structure.losers[ri],ri,'losers');await ins(structure.grandFinal,0,'grand_final')}
    }
  }

  const handleReset = async () => {
    if(!window.confirm('Reset entire bracket? Cannot be undone.'))return
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({id:'season6',bracket:null,status:'setup',updated_at:new Date().toISOString()})
  }

  if(!structure){
    if(!isCommissioner)return <div style={{padding:'32px 20px',textAlign:'center'}}><p style={{color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic',fontSize:15}}>🔒 Commissioner access required.</p></div>
    return <FreeformBuilder players={players} onGenerate={handleGenerate}/>
  }
  return <BracketViewer structure={structure} matches={matches} players={players} isCommissioner={isCommissioner} onReset={handleReset} setActiveMatch={setActiveMatch} setTab={setTab}/>
}
