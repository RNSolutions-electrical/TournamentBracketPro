import { useState, useRef, useMemo, useLayoutEffect, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { WBLogo } from './WBLogo'
import { generateId, shuffle, calcRoundScore, calcMatchTotals } from '../lib/game'
import { advanceWinner } from '../lib/scoring'

const S = {
  label: { fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase' },
  ghost: (c='var(--gold-dark)') => ({ padding:'5px 10px', borderRadius:7, border:`1px dashed ${c}`, background:'transparent', color:c, fontFamily:'Cinzel', fontSize:9, letterSpacing:2, cursor:'pointer', textTransform:'uppercase' }),
  icon:  (c='var(--red-accent)') => ({ background:'none', border:'none', color:c, cursor:'pointer', fontSize:13, padding:'0 3px', lineHeight:1, opacity:.45, transition:'opacity .15s' }),
}
const sCol = { winners:'var(--gold)', losers:'#ef4444', consolation:'#8b5cf6', pre:'#10b981', grand_final:'#e2c97e' }

const mkPlayer = p => p ? { type:'player', player:p } : null
const mkWinner = (id,lbl) => ({ type:'winner_of', matchId:id, matchLabel:lbl })
const mkBye    = () => ({ type:'bye' })
const slotP    = s => s?.type==='player' ? s.player : null
const isWinner = s => s?.type==='winner_of'
const isBye    = s => s?.type==='bye'

function allMatchList(sections) {
  const out = []
  sections.forEach(sec => sec.rounds.forEach((rnd,ri) => rnd.matches.forEach((m,mi) => {
    const p1 = slotP(m.p1)?.name || (isWinner(m.p1) ? `W:${m.p1.matchLabel}` : '—')
    const p2 = slotP(m.p2)?.name || (isWinner(m.p2) ? `W:${m.p2.matchLabel}` : '—')
    out.push({ id:m.id, secName:sec.name||'Section', rndName:rnd.name||`Round ${ri+1}`, matchNum:mi+1, p1name:p1, p2name:p2 })
  })))
  return out
}

function SlotEditor({ slot, matchId, allMatches, players, usedPlayerIds, onSet, onClose }) {
  const [mode, setMode] = useState(isWinner(slot) ? 'winner' : 'player')
  const [q, setQ] = useState('')
  const fPlayers = players.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.nickname||'').toLowerCase().includes(q.toLowerCase()))
  const fMatches = allMatches.filter(m => m.id !== matchId && (!q || `${m.secName} ${m.rndName} ${m.p1name} ${m.p2name}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div style={{ position:'fixed', inset:0, zIndex:3000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.85)', backdropFilter:'blur(4px)' }} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'var(--charcoal-2)', border:'1px solid var(--border-bright)', borderRadius:14, width:340, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:3, textTransform:'uppercase' }}>Assign Slot</span>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--cream-dim)', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', padding:'10px 14px 0' }}>
          <button onClick={()=>{setMode('player');setQ('')}} style={{ padding:'9px 0', borderRadius:'8px 0 0 8px', border:`1.5px solid ${mode==='player'?'var(--gold)':'var(--border)'}`, borderRight:'none', background:mode==='player'?'var(--gold)':'transparent', color:mode==='player'?'var(--charcoal)':'var(--cream-dim)', fontFamily:'Cinzel', fontSize:10, fontWeight:700, cursor:'pointer', letterSpacing:1 }}>👤 Player</button>
          <button onClick={()=>{setMode('winner');setQ('')}} style={{ padding:'9px 0', borderRadius:'0 8px 8px 0', border:`1.5px solid ${mode==='winner'?'#10b981':'var(--border)'}`, background:mode==='winner'?'#10b981':'transparent', color:mode==='winner'?'var(--charcoal)':'#10b981', fontFamily:'Cinzel', fontSize:10, fontWeight:700, cursor:'pointer', letterSpacing:1 }}>🔗 Winner Of</button>
        </div>
        {mode==='winner' && <p style={{ margin:'8px 14px 0', color:'#10b981', fontSize:10, fontFamily:'Cinzel', letterSpacing:1 }}>Pick a match → this slot auto-fills with its winner</p>}
        <div style={{ padding:'8px 14px 0' }}>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder={mode==='player'?'Search player…':`Search ${fMatches.length} match${fMatches.length!==1?'es':''}…`} style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid var(--border-bright)', background:'var(--charcoal-3)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Oswald', boxSizing:'border-box' }} />
        </div>
        <div style={{ overflowY:'auto', flex:1, padding:'8px 14px', display:'flex', flexDirection:'column', gap:5 }}>
          {mode==='player' && fPlayers.map(p=>{
            const busy = usedPlayerIds.has(p.id) && slotP(slot)?.id!==p.id, active = slotP(slot)?.id===p.id
            return (<button key={p.id} onClick={()=>!busy&&onSet(mkPlayer(p))} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:9, textAlign:'left', border:`1px solid ${active?'var(--gold)':'var(--border)'}`, background:active?'#c8a84b18':'var(--charcoal-3)', cursor:busy?'not-allowed':'pointer', opacity:busy?.4:1 }}>
              <Avatar player={p} size={30}/><div style={{flex:1}}><p style={{color:'var(--cream)',fontFamily:'Cinzel',fontSize:12,margin:0}}>{p.name}</p>{p.nickname&&<p style={{color:'var(--gold)',fontSize:10,margin:0,fontStyle:'italic'}}>"{p.nickname}"</p>}{busy&&<p style={{color:'#f59e0b',fontSize:9,margin:0}}>already in bracket</p>}</div>{active&&<span style={{color:'var(--gold)',fontSize:14}}>✓</span>}</button>)
          })}
          {mode==='winner' && fMatches.length===0 && <div style={{textAlign:'center',padding:'16px 8px'}}><p style={{color:'var(--cream-dim)',fontSize:13,fontFamily:'IM Fell English',fontStyle:'italic'}}>No other matches to link to yet.</p></div>}
          {mode==='winner' && fMatches.map(m=>{
            const active = isWinner(slot) && slot.matchId===m.id
            return (<button key={m.id} onClick={()=>onSet(mkWinner(m.id,`${m.secName} M${m.matchNum}`))} style={{ display:'flex', flexDirection:'column', padding:'10px 12px', borderRadius:9, textAlign:'left', border:`2px solid ${active?'#10b981':'var(--border)'}`, background:active?'#10b98118':'var(--charcoal-3)', cursor:'pointer' }}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}><span style={{color:active?'#10b981':'var(--gold)',fontFamily:'Cinzel',fontSize:10,letterSpacing:1,fontWeight:700}}>{m.secName} — {m.rndName} — Match {m.matchNum}</span>{active&&<span style={{color:'#10b981',fontSize:14}}>✓</span>}</div>
              <span style={{color:'var(--cream-dim)',fontSize:12}}><span style={{color:'var(--cream)'}}>{m.p1name}</span><span style={{color:'var(--gold-dark)',margin:'0 6px'}}>vs</span><span style={{color:'var(--cream)'}}>{m.p2name}</span></span></button>)
          })}
        </div>
        <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
          <button onClick={()=>onSet(mkBye())} style={{flex:1,padding:'7px 0',borderRadius:7,border:'1px solid #ef444466',background:'transparent',color:'#ef4444',fontFamily:'Cinzel',fontSize:9,cursor:'pointer',letterSpacing:2}}>BYE</button>
          {slot&&<button onClick={()=>onSet(null)} style={{flex:1,padding:'7px 0',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,cursor:'pointer',letterSpacing:2}}>CLEAR</button>}
        </div>
      </div>
    </div>
  )
}

function SlotBtn({ slot, label, col, onOpen }) {
  const player=slotP(slot), linked=isWinner(slot), bye=isBye(slot), empty=!slot
  let bg='#ffffff05',border='var(--border)',text='var(--charcoal-4)',display=`Assign ${label}`
  if(bye){bg='#7f1d1d22';border='#ef444466';text='#ef4444';display='BYE'}
  else if(linked){bg='#10b98118';border='#10b98166';text='#10b981';display=`🔗 W: ${slot.matchLabel||'?'}`}
  else if(player){bg='var(--charcoal-3)';border='var(--border)';text='var(--cream)';display=player.name}
  return (<button onClick={onOpen} style={{flex:1,display:'flex',alignItems:'center',gap:6,padding:'6px 9px',borderRadius:8,border:`1.5px solid ${border}`,background:bg,cursor:'pointer',minWidth:0,textAlign:'left',transition:'border-color .12s'}} onMouseEnter={e=>e.currentTarget.style.borderColor=col||'var(--gold)'} onMouseLeave={e=>e.currentTarget.style.borderColor=border}>
    {player&&<Avatar player={player} size={22}/>}{linked&&<span style={{fontSize:16,flexShrink:0}}>🔗</span>}{bye&&<span style={{fontSize:14,flexShrink:0}}>✗</span>}{empty&&<span style={{fontSize:14,flexShrink:0,color:'var(--charcoal-4)'}}>+</span>}
    <span style={{color:text,fontSize:11,fontFamily:player||linked?'Cinzel':'Oswald',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,fontWeight:linked?600:400}}>{display}</span></button>)
}

const STARTER_SECTIONS = () => ([
  { id:generateId(), name:'Pre-Round', type:'pre', rounds:[ { id:generateId(), name:'', matches:[ {id:generateId(),p1:null,p2:null}, {id:generateId(),p1:null,p2:null} ]} ]},
  { id:generateId(), name:'Main Bracket', type:'winners', rounds:[ { id:generateId(), name:'Round 1', matches:[ {id:generateId(),p1:null,p2:null}, {id:generateId(),p1:null,p2:null}, {id:generateId(),p1:null,p2:null}, {id:generateId(),p1:null,p2:null} ]} ]},
])

function FreeformBuilder({ players, onGenerate }) {
  const [sections, setSections] = useState(STARTER_SECTIONS)
  const [editor, setEditor] = useState(null)
  const [generating, setGenerating] = useState(false)
  const dragRef = useRef(null)
  const matchList = useMemo(()=>allMatchList(sections),[sections])
  const addSection=t=>{const names={winners:'Main Bracket',losers:'Losers Bracket',consolation:'Consolation',pre:'Pre-Round',grand_final:'Grand Final'};setSections(s=>[...s,{id:generateId(),name:names[t]||'New Section',type:t,rounds:[{id:generateId(),name:'',matches:[{id:generateId(),p1:null,p2:null}]}]}])}
  const delSection=sid=>setSections(s=>s.filter(x=>x.id!==sid))
  const updSection=(sid,p)=>setSections(s=>s.map(x=>x.id===sid?{...x,...p}:x))
  const moveSection=(i,d)=>setSections(s=>{const a=[...s],t=i+d;if(t<0||t>=a.length)return a;[a[i],a[t]]=[a[t],a[i]];return a})
  const addRound=sid=>setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:[...x.rounds,{id:generateId(),name:'',matches:[{id:generateId(),p1:null,p2:null}]}]}))
  const delRound=(sid,rid)=>setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.filter(r=>r.id!==rid)}))
  const updRound=(sid,rid,p)=>setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,...p})}))
  const addMatch=(sid,rid)=>setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:[...r.matches,{id:generateId(),p1:null,p2:null}]})}))
  const delMatch=(sid,rid,mid)=>setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.filter(m=>m.id!==mid)})}))
  const clearAll=()=>{if(window.confirm('Clear the entire bracket build and start over?'))setSections(STARTER_SECTIONS())}
  const setSlot=(sid,rid,mid,slotKey,value)=>{const pid=slotP(value)?.id;setSections(s=>s.map(sec=>({...sec,rounds:sec.rounds.map(r=>({...r,matches:r.matches.map(m=>{let u={...m};if(pid){if(slotP(m.p1)?.id===pid&&!(sec.id===sid&&r.id===rid&&m.id===mid&&slotKey==='p1'))u.p1=null;if(slotP(m.p2)?.id===pid&&!(sec.id===sid&&r.id===rid&&m.id===mid&&slotKey==='p2'))u.p2=null}if(sec.id===sid&&r.id===rid&&m.id===mid)u[slotKey]=value;return u})}))})));setEditor(null)}
  const fillRandom=(sid,rid)=>{const used=new Set(sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[slotP(m.p1)?.id,slotP(m.p2)?.id].filter(Boolean)))));const avail=shuffle(players.filter(p=>!used.has(p.id)));setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>r.id!==rid?r:{...r,matches:r.matches.map(m=>{const mm={...m};if(!mm.p1&&avail.length)mm.p1=mkPlayer(avail.shift());if(!mm.p2&&avail.length)mm.p2=mkPlayer(avail.shift());return mm})})}))}
  const onDragStart=(e,sid,rid,idx)=>{dragRef.current={sid,rid,idx};e.dataTransfer.effectAllowed='move'}
  const onDrop=(e,sid,rid,toIdx)=>{e.preventDefault();const{sid:fs,rid:fr,idx:fi}=dragRef.current||{};if(!fs||fs!==sid||fr!==rid||fi===toIdx)return;setSections(s=>s.map(x=>x.id!==sid?x:{...x,rounds:x.rounds.map(r=>{if(r.id!==rid)return r;const ms=[...r.matches],[mv]=ms.splice(fi,1);ms.splice(toIdx,0,mv);return{...r,matches:ms}})}));dragRef.current=null}
  const handleGenerate=async()=>{setGenerating(true);try{await onGenerate({type:'freeform',sections:sections.map(s=>({...s,rounds:s.rounds.map(r=>({...r,matches:r.matches.map(m=>({...m,score1:0,score2:0,winner:null}))}))}))})}finally{setGenerating(false)}}
  const allUsed=useMemo(()=>new Set(sections.flatMap(s=>s.rounds.flatMap(r=>r.matches.flatMap(m=>[slotP(m.p1)?.id,slotP(m.p2)?.id].filter(Boolean))))),[sections])
  const unplaced=players.filter(p=>!allUsed.has(p.id))
  const total=sections.reduce((a,s)=>a+s.rounds.reduce((b,r)=>b+r.matches.length,0),0)
  const editorMatch=editor&&sections.flatMap(s=>s.rounds.flatMap(r=>r.matches)).find(m=>m.id===editor.matchId)
  const editorVal=editor?(editor.slot==='p1'?editorMatch?.p1:editorMatch?.p2):null
  return (
    <div style={{padding:'16px',maxWidth:700,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14,gap:10}}>
        <div><h2 style={{...S.label,fontSize:13,letterSpacing:5,display:'block',marginBottom:4}}>Build Bracket</h2><p style={{color:'var(--cream-dim)',fontSize:12,margin:0}}>Season 6 · Full Commissioner Control</p></div>
        <button onClick={clearAll} style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--red-accent)',background:'transparent',color:'var(--red-accent)',fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase',flexShrink:0}}>🗑 Clear All</button>
      </div>
      {players.length<2&&<div style={{background:'var(--charcoal-2)',borderRadius:10,padding:12,color:'#f59e0b',marginBottom:12,border:'1px solid #f59e0b44',fontSize:12}}>⚠ Add at least 2 players first.</div>}
      {unplaced.length>0&&<div style={{background:'var(--charcoal-2)',borderRadius:10,padding:'8px 14px',marginBottom:12,border:'1px solid #f59e0b33',display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><span style={{color:'#f59e0b',fontSize:10,fontFamily:'Cinzel',letterSpacing:1,flexShrink:0}}>UNPLACED:</span>{unplaced.map(p=><span key={p.id} style={{display:'flex',alignItems:'center',gap:4,background:'var(--charcoal-3)',borderRadius:6,padding:'3px 8px'}}><Avatar player={p} size={18}/><span style={{color:'var(--cream-dim)',fontSize:11}}>{p.name}</span></span>)}</div>}
      {sections.map((sec,si)=>{const col=sCol[sec.type]||'var(--gold)';return(
        <div key={sec.id} style={{background:'var(--charcoal-2)',borderRadius:14,border:`1px solid ${col}33`,marginBottom:12,overflow:'hidden'}}>
          <div style={{background:'var(--charcoal-3)',padding:'9px 14px',display:'flex',alignItems:'center',gap:8,borderBottom:`1px solid ${col}44`}}>
            <div style={{width:3,height:18,borderRadius:2,background:col,flexShrink:0}}/>
            <input value={sec.name} onChange={e=>updSection(sec.id,{name:e.target.value})} style={{flex:1,background:'transparent',border:'none',color:col,fontFamily:'Cinzel',fontWeight:700,fontSize:12,letterSpacing:2,outline:'none',textTransform:'uppercase'}}/>
            <select value={sec.type} onChange={e=>updSection(sec.id,{type:e.target.value})} style={{background:'var(--charcoal-2)',border:'1px solid var(--border)',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,borderRadius:6,padding:'3px 6px',cursor:'pointer',outline:'none'}}><option value="pre">Pre-Round</option><option value="winners">Winners</option><option value="losers">Losers</option><option value="consolation">Consolation</option><option value="grand_final">Grand Final</option></select>
            <button onClick={()=>moveSection(si,-1)} disabled={si===0} style={{background:'none',border:'none',color:'var(--cream-dim)',cursor:'pointer',fontSize:13,opacity:si===0?.2:.6,padding:'0 2px'}}>↑</button>
            <button onClick={()=>moveSection(si,1)} disabled={si===sections.length-1} style={{background:'none',border:'none',color:'var(--cream-dim)',cursor:'pointer',fontSize:13,opacity:si===sections.length-1?.2:.6,padding:'0 2px'}}>↓</button>
            <button onClick={()=>delSection(sec.id)} style={{background:'none',border:'none',color:'var(--red-accent)',cursor:'pointer',fontSize:16,opacity:.5,padding:'0 4px'}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.5'}>×</button>
          </div>
          <div style={{padding:'10px 12px',display:'flex',flexDirection:'column',gap:10}}>
            {sec.rounds.map((rnd,ri)=>(
              <div key={rnd.id} style={{background:'var(--charcoal-3)',borderRadius:10,overflow:'hidden',border:'1px solid var(--border)'}}>
                <div style={{padding:'7px 12px',display:'flex',alignItems:'center',gap:8,borderBottom:'1px solid var(--border)',background:'var(--charcoal-2)'}}>
                  <input value={rnd.name} onChange={e=>updRound(sec.id,rnd.id,{name:e.target.value})} placeholder={`Round ${ri+1}`} style={{flex:1,background:'transparent',border:'none',color:'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,letterSpacing:2,outline:'none',textTransform:'uppercase'}}/>
                  <button onClick={()=>fillRandom(sec.id,rnd.id)} style={S.ghost('#10b981')}>🎲 Fill</button>
                  <button onClick={()=>addMatch(sec.id,rnd.id)} style={S.ghost()}>+ Match</button>
                  <button onClick={()=>delRound(sec.id,rnd.id)} style={S.icon()} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>🗑</button>
                </div>
                <div style={{padding:'8px 10px',display:'flex',flexDirection:'column',gap:5}}>
                  {rnd.matches.map((m,mi)=>(
                    <div key={m.id} draggable onDragStart={e=>onDragStart(e,sec.id,rnd.id,mi)} onDragOver={e=>e.preventDefault()} onDrop={e=>onDrop(e,sec.id,rnd.id,mi)} style={{display:'flex',alignItems:'center',gap:6,background:'var(--charcoal-2)',borderRadius:8,padding:'6px 10px',border:'1px solid var(--border)'}}>
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
      )})}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        {[['pre','+ Pre-Round','#10b981'],['winners','+ Winners','var(--gold)'],['losers','+ Losers','#ef4444'],['consolation','+ Consolation','#8b5cf6'],['grand_final','+ Grand Final','#e2c97e']].map(([t,l,c])=>(<button key={t} onClick={()=>addSection(t)} style={{padding:'6px 12px',borderRadius:8,border:`1px solid ${c}66`,background:'transparent',color:c,fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase'}}>{l}</button>))}
      </div>
      <button onClick={handleGenerate} disabled={generating||total===0} style={{width:'100%',padding:'13px 0',borderRadius:10,border:'1px solid var(--gold)',background:total>0?'var(--gold)':'transparent',color:total>0?'var(--charcoal)':'var(--gold-dark)',fontFamily:'Cinzel Decorative',fontWeight:700,fontSize:14,cursor:total>0?'pointer':'not-allowed',letterSpacing:1}}>{generating?'Locking In…':`⚔ Lock In Bracket  (${total} matches)`}</button>
      {editor&&<SlotEditor slot={editorVal} matchId={editor.matchId} allMatches={matchList} players={players} usedPlayerIds={allUsed} onSet={v=>setSlot(editor.secId,editor.rndId,editor.matchId,editor.slot,v)} onClose={()=>setEditor(null)}/>}
    </div>
  )
}

// ═══ VISUAL BRACKET (connector-line layout, like the cardboard) ═══
const CARD_W=178, CARD_H=56, V_GAP=24, COL_GAP=54, HDR_H=36
const COL_W=CARD_W+COL_GAP

function VisualBracket({ structure, matches, players, isCommissioner, onOpenScore, onEditSlot, scroll=true }) {
  const getPlayer=id=>players.find(p=>p.id===id)
  const sections=structure.sections||[]
  const getDbm=(secId,rndId,mi)=>matches.find(m=>m.bracket_section===secId&&m.match_index===mi&&m.freeform_round_id===rndId)||matches.find(m=>m.bracket_section===secId&&m.match_index===mi)
  const winnerOf=bid=>{for(const sec of sections)for(let ri=0;ri<sec.rounds.length;ri++){const rnd=sec.rounds[ri];for(let mi=0;mi<rnd.matches.length;mi++){if(rnd.matches[mi].id===bid){const d=getDbm(sec.id,rnd.id,mi);return d?.winner_id?getPlayer(d.winner_id):null}}}return null}
  const resolveSlot=(slot,dbId)=>{if(dbId)return getPlayer(dbId);if(!slot)return null;if(slot.type==='player')return slot.player;if(slot.type==='winner_of')return winnerOf(slot.matchId);return null}

  const columns=[]
  sections.forEach(sec=>sec.rounds.forEach((rnd,ri)=>columns.push({key:`${sec.id}-${rnd.id}`,secId:sec.id,secName:sec.name,secType:sec.type,rnd,rndName:rnd.name||`Round ${ri+1}`})))

  const entryBy={}
  columns.forEach((col,ci)=>col.rnd.matches.forEach((m,mi)=>{entryBy[m.id]={ci,mi}}))
  const posY={}
  columns.forEach(col=>{
    let cursor=0
    col.rnd.matches.forEach(m=>{
      const feeders=[];if(isWinner(m.p1))feeders.push(m.p1.matchId);if(isWinner(m.p2))feeders.push(m.p2.matchId)
      const placed=feeders.filter(id=>posY[id]!=null)
      if(placed.length)posY[m.id]=placed.reduce((a,id)=>a+posY[id],0)/placed.length
      else{posY[m.id]=cursor;cursor+=CARD_H+V_GAP}
    })
    const sorted=[...col.rnd.matches].sort((a,b)=>posY[a.id]-posY[b.id])
    for(let i=1;i<sorted.length;i++){const prev=posY[sorted[i-1].id];if(posY[sorted[i].id]<prev+CARD_H+V_GAP)posY[sorted[i].id]=prev+CARD_H+V_GAP}
  })
  const allY=Object.values(posY)
  const totalH=allY.length?Math.max(...allY.map(y=>y+CARD_H)):CARD_H
  const totalW=columns.length*COL_W+130

  const rowCY=(y,slot)=>y+13+(slot==='p1'?11:32)
  const connectors=[]
  columns.forEach((col,ci)=>col.rnd.matches.forEach(m=>['p1','p2'].forEach(sk=>{
    const slot=m[sk];if(!isWinner(slot))return;const src=entryBy[slot.matchId];if(!src)return
    connectors.push({sx:src.ci*COL_W+CARD_W,sy:posY[slot.matchId]+CARD_H/2,tx:ci*COL_W,ty:rowCY(posY[m.id],sk),decided:!!winnerOf(slot.matchId),key:`${m.id}-${sk}`})
  })))

  const lastCol=columns[columns.length-1]
  const champMatch=lastCol?.rnd.matches[lastCol.rnd.matches.length-1]
  const champDb=champMatch?getDbm(lastCol.secId,lastCol.rnd.id,lastCol.rnd.matches.indexOf(champMatch)):null
  const champ=champDb?.winner_id?getPlayer(champDb.winner_id):null

  const inner = (
      <div style={{position:'relative',width:totalW,height:HDR_H+totalH+10,minWidth:'100%'}}>
        {columns.map((col,ci)=>{const c=sCol[col.secType]||'var(--gold)';return(
          <div key={col.key} style={{position:'absolute',left:ci*COL_W,top:0,width:CARD_W,textAlign:'center'}}>
            <div style={{fontFamily:'Cinzel',color:c,fontSize:8,letterSpacing:2,textTransform:'uppercase',opacity:.6,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{col.secName}</div>
            <div style={{fontFamily:'Cinzel',color:c,fontSize:9,letterSpacing:2,textTransform:'uppercase',fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{col.rndName}</div>
          </div>)})}
        <svg style={{position:'absolute',left:0,top:HDR_H,width:totalW,height:totalH+10,pointerEvents:'none',overflow:'visible'}}>
          {connectors.map(c=>{const mx=c.sx+COL_GAP/2;return <path key={c.key} d={`M ${c.sx} ${c.sy} L ${mx} ${c.sy} L ${mx} ${c.ty} L ${c.tx} ${c.ty}`} fill="none" stroke={c.decided?'#10b981':'var(--gold-dark)'} strokeWidth={c.decided?2:1.5} strokeDasharray={c.decided?'0':'4 3'} opacity={c.decided?.9:.5}/>})}
          {connectors.map(c=><circle key={c.key+'d'} cx={c.tx} cy={c.ty} r={3} fill={c.decided?'#10b981':'var(--gold-dark)'} opacity={c.decided?.9:.5}/>)}
        </svg>
        {columns.map((col,ci)=>col.rnd.matches.map((m,mi)=>{
          if(isBye(m.p1)&&isBye(m.p2))return null
          const dbm=getDbm(col.secId,col.rnd.id,mi)
          const p1=resolveSlot(m.p1,dbm?.player1_id),p2=resolveSlot(m.p2,dbm?.player2_id)
          const s1=dbm?.total_net1||0,s2=dbm?.total_net2||0,wId=dbm?.winner_id,done=dbm?.status==='complete'
          const c=sCol[col.secType]||'var(--gold)',ready=!done&&p1&&p2
          return (
            <div key={m.id} onClick={()=>dbm&&onOpenScore(dbm)} style={{position:'absolute',left:ci*COL_W,top:HDR_H+posY[m.id],width:CARD_W,height:CARD_H,background:'var(--charcoal-2)',borderRadius:9,border:`1.5px solid ${done?c:ready?'#10b98166':'var(--border)'}`,display:'flex',flexDirection:'column',cursor:dbm?'pointer':'default',overflow:'hidden'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 7px 0',height:13}}>
                <span style={{fontFamily:'Cinzel',color:c,fontSize:7,letterSpacing:1,opacity:.6}}>M{mi+1}</span>
                {done?<span style={{fontFamily:'Cinzel',color:c,fontSize:7,letterSpacing:1}}>FINAL</span>:ready?<span style={{fontFamily:'Cinzel',color:'#10b981',fontSize:7,letterSpacing:1}}>● READY</span>:<span style={{fontFamily:'Cinzel',color:'var(--charcoal-4)',fontSize:7,letterSpacing:1}}>PENDING</span>}
              </div>
              {[{slot:m.p1,res:p1,s:s1,win:wId&&wId===p1?.id,field:'player1_id'},{slot:m.p2,res:p2,s:s2,win:wId&&wId===p2?.id,field:'player2_id'}].map(({slot,res,s,win,field},i)=>(
                <div key={i} style={{flex:1,display:'flex',alignItems:'center',gap:5,padding:'0 7px',borderTop:i?'1px solid var(--border)':'none',background:win?`${c}14`:'transparent'}}>
                  <Avatar player={res} size={17}/>
                  <span style={{flex:1,color:win?c:res?'var(--cream)':isWinner(slot)?'#10b981':'var(--charcoal-4)',fontSize:10,fontFamily:win||isWinner(slot)?'Cinzel':'Oswald',fontWeight:win?700:400,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isBye(slot)?'BYE':res?(res.nickname||res.name):isWinner(slot)?`W: ${slot.matchLabel||'?'}`:'TBD'}</span>
                  {isCommissioner&&!done&&dbm&&<button onClick={e=>{e.stopPropagation();onEditSlot(dbm,field,res,col.secId,col.rnd.id,mi)}} style={{...S.icon('var(--gold-dark)'),fontSize:8,opacity:.4}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.4'}>✎</button>}
                  <span style={{color:win?c:'var(--cream-dim)',fontWeight:win?700:400,fontSize:11,fontFamily:'Cinzel',flexShrink:0,minWidth:12,textAlign:'right'}}>{s}</span>
                </div>
              ))}
            </div>
          )
        }))}
        <div style={{position:'absolute',left:columns.length*COL_W,top:HDR_H,width:115,textAlign:'center'}}>
          <div style={{fontFamily:'Cinzel Decorative',color:'var(--gold)',fontSize:9,letterSpacing:2,marginBottom:8}}>🏆 Champion</div>
          {champ?<div><Avatar player={champ} size={46} ring/><p style={{color:'var(--gold)',fontFamily:'Cinzel',fontWeight:700,fontSize:11,margin:'6px 0 0'}}>{champ.name}</p></div>:<p style={{color:'var(--charcoal-4)',fontSize:10,fontFamily:'IM Fell English',fontStyle:'italic'}}>TBD</p>}
        </div>
      </div>
  )
  if(!scroll) return inner
  return <div style={{overflowX:'auto',overflowY:'hidden',paddingBottom:16}}>{inner}</div>
}

// ═══ FULL-SCREEN BRACKET PAGE (pan + zoom, breaks out of the 720px column) ═══
function FullBracketOverlay({ structure, matches, players, isCommissioner, onOpenScore, onClose }) {
  const [zoom, setZoom] = useState(1)
  const innerRef = useRef(null)
  const [nat, setNat] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = innerRef.current
    if (el) setNat({ w: el.scrollWidth, h: el.scrollHeight })
  }, [structure, matches, players])

  const clamp = z => Math.min(2, Math.max(0.4, z))

  return (
    <div style={{ position:'fixed', inset:0, zIndex:4000, background:'var(--charcoal)', display:'flex', flexDirection:'column' }}>
      {/* Top bar */}
      <div style={{ flexShrink:0, background:'linear-gradient(180deg,#0d0d10,#1a1a1f)', borderBottom:'1px solid var(--border)', padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
        <WBLogo size={30} />
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontFamily:'Cinzel Decorative', color:'var(--gold)', fontSize:12, letterSpacing:1, margin:0, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>Season VI · Full Bracket</p>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold-dark)', fontSize:8, letterSpacing:2, textTransform:'uppercase', margin:0 }}>Pinch / scroll to pan · live scores</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <button onClick={()=>setZoom(z=>clamp(z-0.15))} style={zBtn}>−</button>
          <span style={{ fontFamily:'Cinzel', color:'var(--cream-dim)', fontSize:10, minWidth:38, textAlign:'center' }}>{Math.round(zoom*100)}%</span>
          <button onClick={()=>setZoom(z=>clamp(z+0.15))} style={zBtn}>+</button>
          <button onClick={()=>setZoom(1)} style={{ ...zBtn, width:'auto', padding:'0 8px', fontSize:9, fontFamily:'Cinzel', letterSpacing:1 }}>FIT</button>
        </div>
        <button onClick={onClose} style={{ padding:'7px 14px', borderRadius:8, border:'1px solid var(--gold)', background:'var(--gold)', color:'var(--charcoal)', fontFamily:'Cinzel', fontSize:10, fontWeight:700, letterSpacing:1, cursor:'pointer', flexShrink:0 }}>✕ Close</button>
      </div>

      {/* Scroll + zoom canvas */}
      <div style={{ flex:1, overflow:'auto', WebkitOverflowScrolling:'touch', background:'radial-gradient(circle at 30% 20%, #1f1f26, var(--charcoal))' }}>
        <div style={{ width: nat.w*zoom, height: nat.h*zoom, padding:24, boxSizing:'content-box' }}>
          <div ref={innerRef} style={{ transformOrigin:'top left', transform:`scale(${zoom})`, width:'max-content' }}>
            <VisualBracket structure={structure} matches={matches} players={players} isCommissioner={false} onOpenScore={dbm=>{onClose();onOpenScore(dbm)}} onEditSlot={()=>{}} scroll={false} />
          </div>
        </div>
      </div>
    </div>
  )
}
const zBtn = { width:28, height:28, borderRadius:7, border:'1px solid var(--border-bright)', background:'var(--charcoal-2)', color:'var(--gold)', fontSize:16, lineHeight:1, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }

// ═══ MOBILE VIEW (vertical cards + inline commissioner scoring) ═══
function Stepper({ value, onChange, color, max }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <button onClick={()=>onChange(Math.max(0,value-1))} style={{ width:30, height:30, borderRadius:8, border:'1px solid var(--border-bright)', background:'var(--charcoal-3)', color:'#ef4444', fontSize:18, fontWeight:700, cursor:'pointer', lineHeight:1 }}>−</button>
      <span style={{ color:'var(--cream)', fontFamily:'Cinzel Decorative', fontSize:20, fontWeight:700, width:22, textAlign:'center' }}>{value}</span>
      <button onClick={()=>onChange(value+1)} disabled={max!=null&&value>=max} style={{ width:30, height:30, borderRadius:8, border:`1px solid ${color}66`, background:'var(--charcoal-3)', color, fontSize:18, fontWeight:700, cursor:max!=null&&value>=max?'not-allowed':'pointer', opacity:max!=null&&value>=max?.4:1, lineHeight:1 }}>+</button>
    </div>
  )
}

function MobileMatchCard({ dbm, p1, p2, slot1, slot2, label, col, isCommissioner, matches, players, structure }) {
  const [open, setOpen] = useState(false)
  const [b1,setB1]=useState(0),[c1,setC1]=useState(0),[b2,setB2]=useState(0),[c2,setC2]=useState(0)
  useEffect(()=>{ setB1(0);setC1(0);setB2(0);setC2(0) },[open])

  const rounds = dbm?.rounds||[]
  const t1=dbm?.total_net1||0, t2=dbm?.total_net2||0
  const wId=dbm?.winner_id, done=dbm?.status==='complete'
  const ready=!done&&p1&&p2
  const { gross1,gross2,net1,net2 } = calcRoundScore(b1,c1,b2,c2)

  const confirmRound = async () => {
    if(!p1||!p2)return
    const newRounds=[...rounds,{p1Box:b1,p1Cup:c1,p2Box:b2,p2Cup:c2,gross1,gross2,net1,net2,confirmed:true}]
    await supabase.from('matches').update({rounds:newRounds,total_net1:t1+net1,total_net2:t2+net2,status:'active',updated_at:new Date().toISOString()}).eq('id',dbm.id)
    setB1(0);setC1(0);setB2(0);setC2(0)
  }
  const deleteRound = async idx => {
    const upd=rounds.filter((_,i)=>i!==idx)
    const n1=upd.filter(r=>r.confirmed).reduce((s,r)=>s+r.net1,0), n2=upd.filter(r=>r.confirmed).reduce((s,r)=>s+r.net2,0)
    await supabase.from('matches').update({rounds:upd,total_net1:n1,total_net2:n2,updated_at:new Date().toISOString()}).eq('id',dbm.id)
  }
  const declareWinner = async winnerId => {
    const loserId=winnerId===dbm.player1_id?dbm.player2_id:dbm.player1_id
    await supabase.from('matches').update({winner_id:winnerId,status:'complete',updated_at:new Date().toISOString()}).eq('id',dbm.id)
    await advanceWinner(winnerId,loserId,dbm,matches,structure,players)
    setOpen(false)
  }
  const reopen = async () => { await supabase.from('matches').update({winner_id:null,status:'active',updated_at:new Date().toISOString()}).eq('id',dbm.id) }

  const PlayerRow = ({slot,res,score,win}) => (
    <div style={{display:'flex',alignItems:'center',gap:9,padding:'7px 0',background:win?`${col}14`:'transparent',borderRadius:6}}>
      <Avatar player={res} size={28}/>
      <span style={{flex:1,color:win?col:res?'var(--cream)':isWinner(slot)?'#10b981':'var(--charcoal-4)',fontSize:14,fontFamily:win||isWinner(slot)?'Cinzel':'Oswald',fontWeight:win?700:400}}>
        {isBye(slot)?'BYE':res?(res.nickname?`"${res.nickname}"`:res.name):isWinner(slot)?`🔗 W: ${slot.matchLabel||'?'}`:'TBD'}
      </span>
      {win&&<span style={{color:col,fontSize:11,fontFamily:'Cinzel'}}>👑</span>}
      <span style={{color:win?col:'var(--cream-dim)',fontWeight:700,fontSize:18,fontFamily:'Cinzel Decorative',minWidth:24,textAlign:'right'}}>{score}</span>
    </div>
  )

  const canScore = isCommissioner && dbm && p1 && p2

  return (
    <div style={{background:'var(--charcoal-2)',borderRadius:12,border:`1.5px solid ${done?col:ready?'#10b98144':'var(--border)'}`,overflow:'hidden'}}>
      {/* Card header (tap to expand) */}
      <div onClick={()=>dbm&&setOpen(o=>!o)} style={{padding:'9px 13px',cursor:dbm?'pointer':'default'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
          <span style={{fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:1,textTransform:'uppercase'}}>{label}</span>
          {done?<span style={{fontFamily:'Cinzel',color:col,fontSize:9,letterSpacing:1}}>FINAL</span>:ready?<span style={{fontFamily:'Cinzel',color:'#10b981',fontSize:9,letterSpacing:1}}>● READY</span>:<span style={{fontFamily:'Cinzel',color:'var(--charcoal-4)',fontSize:9,letterSpacing:1}}>PENDING</span>}
        </div>
        <PlayerRow slot={slot1} res={p1} score={t1} win={wId&&wId===p1?.id}/>
        <div style={{height:1,background:'var(--border)',margin:'0 0'}}/>
        <PlayerRow slot={slot2} res={p2} score={t2} win={wId&&wId===p2?.id}/>
        {dbm&&<div style={{textAlign:'center',marginTop:4,color:'var(--gold-dark)',fontSize:9,fontFamily:'Cinzel',letterSpacing:1}}>{open?'▲ Tap to close':canScore?'▼ Tap to score':'▼ Tap for details'}</div>}
      </div>

      {/* Expanded scoring */}
      {open&&dbm&&(
        <div style={{borderTop:`1px solid var(--border)`,padding:'12px 13px',background:'var(--charcoal-3)'}}>
          {!p1||!p2 ? (
            <p style={{color:'var(--cream-dim)',fontSize:12,textAlign:'center',fontFamily:'IM Fell English',fontStyle:'italic',margin:0}}>Both players must be set before scoring. Waiting on a feeder match.</p>
          ) : done ? (
            <div style={{textAlign:'center'}}>
              <p style={{color:col,fontFamily:'Cinzel',fontSize:12,letterSpacing:1,marginBottom:10}}>🏆 {(wId===p1?.id?p1:p2)?.name} wins</p>
              {isCommissioner&&<button onClick={reopen} style={{padding:'7px 16px',borderRadius:8,border:'1px solid var(--gold-dark)',background:'transparent',color:'var(--gold)',fontFamily:'Cinzel',fontSize:10,letterSpacing:1,cursor:'pointer'}}>↺ Reopen Match</button>}
            </div>
          ) : !isCommissioner ? (
            <p style={{color:'var(--cream-dim)',fontSize:12,textAlign:'center',fontFamily:'IM Fell English',fontStyle:'italic',margin:0}}>🔒 Commissioner can score this match.</p>
          ) : (
            <>
              {/* Round entry */}
              <p style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:9,letterSpacing:2,textTransform:'uppercase',margin:'0 0 8px',textAlign:'center'}}>Enter Round {rounds.length+1}</p>
              {[{res:p1,b:b1,setB:setB1,c:c1,setC:setC1},{res:p2,b:b2,setB:setB2,c:c2,setC:setC2}].map((r,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,flex:1,minWidth:0}}>
                    <Avatar player={r.res} size={22}/>
                    <span style={{color:'var(--cream)',fontSize:12,fontFamily:'Cinzel',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.res.nickname||r.res.name}</span>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                    <span style={{fontFamily:'Cinzel',fontSize:7,letterSpacing:1,color:'var(--cream-dim)'}}>BOX·1</span>
                    <Stepper value={r.b} onChange={v=>{ if(v+r.c<=4||v<r.b) r.setB(v) }} color="#3b82f6" max={4-r.c}/>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                    <span style={{fontFamily:'Cinzel',fontSize:7,letterSpacing:1,color:'var(--gold)'}}>CUP·3</span>
                    <Stepper value={r.c} onChange={v=>{ if(v+r.b<=4||v<r.c) r.setC(v) }} color="var(--gold)" max={4-r.b}/>
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-around',padding:'6px 0',marginBottom:8,background:'var(--charcoal-2)',borderRadius:8}}>
                <span style={{color:'var(--cream-dim)',fontSize:11,fontFamily:'Cinzel'}}>{p1.nickname||p1.name}: <span style={{color:'var(--cream)'}}>{gross1}</span> → net <span style={{color:'#10b981',fontWeight:700}}>{net1}</span></span>
                <span style={{color:'var(--cream-dim)',fontSize:11,fontFamily:'Cinzel'}}>{p2.nickname||p2.name}: <span style={{color:'var(--cream)'}}>{gross2}</span> → net <span style={{color:'#10b981',fontWeight:700}}>{net2}</span></span>
              </div>
              <button onClick={confirmRound} disabled={b1+c1===0&&b2+c2===0} style={{width:'100%',padding:'10px 0',borderRadius:9,border:'1px solid var(--gold)',background:(b1+c1===0&&b2+c2===0)?'transparent':'var(--gold)',color:(b1+c1===0&&b2+c2===0)?'var(--gold-dark)':'var(--charcoal)',fontFamily:'Cinzel',fontWeight:700,fontSize:12,letterSpacing:1,cursor:'pointer',marginBottom:10}}>✓ Confirm Round</button>

              {/* Round history */}
              {rounds.length>0&&(
                <div style={{marginBottom:10}}>
                  <p style={{fontFamily:'Cinzel',color:'var(--cream-dim)',fontSize:8,letterSpacing:2,textTransform:'uppercase',margin:'0 0 5px'}}>Rounds Played</p>
                  {rounds.map((r,i)=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'4px 8px',background:'var(--charcoal-2)',borderRadius:6,marginBottom:3}}>
                      <span style={{color:'var(--gold-dark)',fontFamily:'Cinzel',fontSize:9,width:20}}>R{i+1}</span>
                      <span style={{flex:1,color:'var(--cream-dim)',fontSize:11}}>net {r.net1} — {r.net2}</span>
                      <button onClick={()=>deleteRound(i)} style={S.icon()} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>🗑</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Declare winner */}
              <p style={{fontFamily:'Cinzel',color:'var(--gold)',fontSize:9,letterSpacing:2,textTransform:'uppercase',margin:'0 0 6px',textAlign:'center'}}>Declare Winner</p>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>declareWinner(p1.id)} style={{flex:1,padding:'9px 0',borderRadius:9,border:`1px solid ${col}`,background:'transparent',color:col,fontFamily:'Cinzel',fontWeight:700,fontSize:11,cursor:'pointer',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>👑 {p1.nickname||p1.name}</button>
                <button onClick={()=>declareWinner(p2.id)} style={{flex:1,padding:'9px 0',borderRadius:9,border:`1px solid ${col}`,background:'transparent',color:col,fontFamily:'Cinzel',fontWeight:700,fontSize:11,cursor:'pointer',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>👑 {p2.nickname||p2.name}</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MobileBracketView({ structure, matches, players, isCommissioner }) {
  const getPlayer=id=>players.find(p=>p.id===id)
  const sections=structure.sections||[]
  const getDbm=(secId,rndId,mi)=>matches.find(m=>m.bracket_section===secId&&m.match_index===mi&&m.freeform_round_id===rndId)||matches.find(m=>m.bracket_section===secId&&m.match_index===mi)
  const winnerOf=bid=>{for(const sec of sections)for(let ri=0;ri<sec.rounds.length;ri++){const rnd=sec.rounds[ri];for(let mi=0;mi<rnd.matches.length;mi++){if(rnd.matches[mi].id===bid){const d=getDbm(sec.id,rnd.id,mi);return d?.winner_id?getPlayer(d.winner_id):null}}}return null}
  const resolveSlot=(slot,dbId)=>{if(dbId)return getPlayer(dbId);if(!slot)return null;if(slot.type==='player')return slot.player;if(slot.type==='winner_of')return winnerOf(slot.matchId);return null}

  return (
    <div style={{padding:'4px 12px 24px',display:'flex',flexDirection:'column',gap:18,maxWidth:480,margin:'0 auto'}}>
      {sections.map(sec=>{const col=sCol[sec.type]||'var(--gold)';return(
        <div key={sec.id}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <div style={{width:4,height:16,borderRadius:2,background:col}}/>
            <span style={{fontFamily:'Cinzel',color:col,fontSize:11,letterSpacing:3,textTransform:'uppercase',fontWeight:700}}>{sec.name}</span>
          </div>
          {sec.rounds.map((rnd,ri)=>(
            <div key={rnd.id} style={{marginBottom:12}}>
              <p style={{fontFamily:'Cinzel',color:'var(--cream-dim)',fontSize:9,letterSpacing:2,textTransform:'uppercase',margin:'0 0 6px 4px'}}>{rnd.name||`Round ${ri+1}`}</p>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {rnd.matches.map((m,mi)=>{
                  if(isBye(m.p1)&&isBye(m.p2))return null
                  const dbm=getDbm(sec.id,rnd.id,mi)
                  const p1=resolveSlot(m.p1,dbm?.player1_id),p2=resolveSlot(m.p2,dbm?.player2_id)
                  return <MobileMatchCard key={m.id} dbm={dbm} p1={p1} p2={p2} slot1={m.p1} slot2={m.p2} label={`Match ${mi+1}`} col={col} isCommissioner={isCommissioner} matches={matches} players={players} structure={structure}/>
                })}
              </div>
            </div>
          ))}
        </div>
      )})}
    </div>
  )
}

// ═══ LIVE VIEWER (visual + edit toggle) ═══
function BracketViewer({ structure, matches, players, isCommissioner, onReset, setActiveMatch, setTab }) {
  const [view, setView] = useState(()=> (typeof window!=='undefined' && window.innerWidth<640) ? 'mobile' : 'visual')
  const [editor, setEditor] = useState(null)  // { matchId, field, secId, rndId, mi, current }
  const [fullScreen, setFullScreen] = useState(false)
  const isFreeform = structure.type==='freeform'
  const sections = isFreeform?(structure.sections??[]):[]
  const matchList = useMemo(()=>isFreeform?allMatchList(sections):[],[structure])
  const getPlayer = id=>players.find(p=>p.id===id)
  const openMatch = dbm=>{ setActiveMatch({matchId:dbm.id}); setTab('Scoreboard') }
  const getDbm=(secId,rndId,mi)=>matches.find(m=>m.bracket_section===secId&&m.match_index===mi&&m.freeform_round_id===rndId)||matches.find(m=>m.bracket_section===secId&&m.match_index===mi)
  const mutate=async upd=>{const{data}=await supabase.from('tournament').select('bracket').eq('id','season6').single();if(!data?.bracket)return;await supabase.from('tournament').update({bracket:upd(JSON.parse(JSON.stringify(data.bracket))),updated_at:new Date().toISOString()}).eq('id','season6')}

  const renameRound=async(si,ri,name)=>mutate(b=>{if(b.sections?.[si]?.rounds?.[ri])b.sections[si].rounds[ri].name=name;return b})
  const addLiveRound=async si=>{const rid=generateId(),mid=generateId();const sec=structure.sections?.[si];if(!sec)return;await mutate(b=>{if(b.sections?.[si])b.sections[si].rounds.push({id:rid,name:'',matches:[{id:mid,p1:null,p2:null}]});return b});await supabase.from('matches').insert({round_index:sec.rounds.length,match_index:0,bracket_section:sec.id,section_round_index:sec.rounds.length,freeform_round_id:rid,freeform_match_id:mid,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'})}
  const addLiveMatch=async(si,ri)=>{const sec=structure.sections?.[si],rnd=sec?.rounds?.[ri];if(!rnd)return;const mi=rnd.matches.length,mid=generateId();await mutate(b=>{if(b.sections?.[si]?.rounds?.[ri])b.sections[si].rounds[ri].matches.push({id:mid,p1:null,p2:null});return b});await supabase.from('matches').insert({round_index:ri,match_index:mi,bracket_section:sec.id,section_round_index:ri,freeform_round_id:rnd.id,freeform_match_id:mid,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'})}
  const delLiveRound=async(si,ri)=>{if(!window.confirm('Remove this round and its matches?'))return;const sec=structure.sections?.[si],rnd=sec?.rounds?.[ri];if(!rnd)return;await mutate(b=>{if(b.sections?.[si])b.sections[si].rounds=b.sections[si].rounds.filter((_,i)=>i!==ri);return b});const rows=matches.filter(m=>m.bracket_section===sec.id&&m.freeform_round_id===rnd.id);await Promise.all(rows.map(m=>supabase.from('matches').delete().eq('id',m.id)))}
  const delLiveMatch=async(si,ri,mi)=>{if(!window.confirm('Remove match?'))return;const sec=structure.sections?.[si],rnd=sec?.rounds?.[ri];if(!rnd)return;await mutate(b=>{if(b.sections?.[si]?.rounds?.[ri])b.sections[si].rounds[ri].matches=b.sections[si].rounds[ri].matches.filter((_,i)=>i!==mi);return b});const d=getDbm(sec.id,rnd.id,mi);if(d)await supabase.from('matches').delete().eq('id',d.id)}
  const addLiveSection=async t=>{const sid=generateId(),rid=generateId(),mid=generateId(),names={pre:'Pre-Round',winners:'New Round',consolation:'Consolation',grand_final:'Grand Final'};await mutate(b=>{b.sections.push({id:sid,name:names[t],type:t,rounds:[{id:rid,name:'',matches:[{id:mid,p1:null,p2:null}]}]});return b});await supabase.from('matches').insert({round_index:0,match_index:0,bracket_section:sid,section_round_index:0,freeform_round_id:rid,freeform_match_id:mid,player1_id:null,player2_id:null,rounds:[],total_net1:0,total_net2:0,status:'pending'})}

  // Live slot assignment: supports player, winner-of link, bye, clear
  const applyLiveSlot=async(value)=>{
    const{matchId,field,secId,rndId,mi}=editor
    const slotKey=field==='player1_id'?'p1':'p2'
    // Update bracket JSON for the slot
    await mutate(b=>{const sec=b.sections?.find(s=>s.id===secId);if(!sec)return b;const rnd=sec.rounds.find(r=>r.id===rndId);if(!rnd)return b;const m=rnd.matches[mi];if(!m)return b
      // clear player from elsewhere if assigning a player
      const pid=slotP(value)?.id
      if(pid)b.sections.forEach(s=>s.rounds.forEach(r=>r.matches.forEach(mm=>{if(slotP(mm.p1)?.id===pid)mm.p1=null;if(slotP(mm.p2)?.id===pid)mm.p2=null})))
      const sec2=b.sections.find(s=>s.id===secId),rnd2=sec2.rounds.find(r=>r.id===rndId),m2=rnd2.matches[mi]
      m2[slotKey]=value;return b})
    // Update DB row: player → set id; winner_of with decided source → push player; else null
    let pid=null
    if(value?.type==='player')pid=value.player.id
    else if(value?.type==='winner_of'){const src=sections.flatMap(s=>s.rounds.map(r=>({s,r}))).flatMap(({s,r})=>r.matches.map((mm,idx)=>({s,r,mm,idx}))).find(x=>x.mm.id===value.matchId);if(src){const d=getDbm(src.s.id,src.r.id,src.idx);pid=d?.winner_id||null}}
    await supabase.from('matches').update({[field]:pid,updated_at:new Date().toISOString()}).eq('id',matchId)
    setEditor(null)
  }

  const sectionAddButtons = isCommissioner&&isFreeform ? [['pre','Pre','#10b981'],['winners','Round','var(--gold)'],['consolation','Consol.','#8b5cf6'],['grand_final','G.Final','#e2c97e']] : []

  // Edit list view round column (reuses builder-style controls)
  const EditRoundCol=({sec,si,rnd,ri})=>{
    const col=sCol[sec.type]||'var(--gold)'
    return (
      <div style={{flex:1,minWidth:174,display:'flex',flexDirection:'column'}}>
        <div style={{padding:'6px 8px',background:'var(--charcoal-2)',borderBottom:`1px solid ${col}33`,borderRight:'1px solid var(--border)',minHeight:30,display:'flex',alignItems:'center',gap:4}}>
          <input value={rnd.name} onChange={e=>renameRound(si,ri,e.target.value)} placeholder={`Round ${ri+1}`} style={{flex:1,background:'transparent',border:'none',color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:2,outline:'none',textTransform:'uppercase'}}/>
          <button onClick={()=>delLiveRound(si,ri)} style={{...S.icon(),fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>🗑</button>
        </div>
        <div style={{flex:1,display:'flex',flexDirection:'column',padding:'8px 5px',borderRight:'1px solid var(--border)',gap:5}}>
          {(rnd.matches??[]).map((bm,mi)=>{
            const dbm=getDbm(sec.id,rnd.id,mi)
            return (
              <div key={bm.id} style={{position:'relative'}}>
                <div style={{background:'var(--charcoal-2)',borderRadius:8,padding:'5px 7px',border:'1px solid var(--border)'}}>
                  {['p1','p2'].map((sk,i)=>{const field=sk==='p1'?'player1_id':'player2_id';const slot=bm[sk];const res=slotP(slot)||(dbm?.[field]?getPlayer(dbm[field]):null);return(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:5,padding:'2px 0'}}>
                      <Avatar player={res} size={18}/>
                      <span style={{flex:1,color:res?'var(--cream)':isWinner(slot)?'#10b981':'var(--charcoal-4)',fontSize:10,fontFamily:'Oswald',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{isBye(slot)?'BYE':res?res.name:isWinner(slot)?`W: ${slot.matchLabel||'?'}`:'—'}</span>
                      <button onClick={()=>setEditor({matchId:dbm?.id,field,secId:sec.id,rndId:rnd.id,mi,current:res})} disabled={!dbm} style={{...S.icon('var(--gold-dark)'),fontSize:9,opacity:.5}}>✎</button>
                    </div>
                  )})}
                </div>
                <button onClick={()=>delLiveMatch(si,ri,mi)} style={{...S.icon(),position:'absolute',top:1,right:1,fontSize:10}} onMouseEnter={e=>e.currentTarget.style.opacity='1'} onMouseLeave={e=>e.currentTarget.style.opacity='.45'}>×</button>
              </div>
            )
          })}
          <button onClick={()=>addLiveMatch(si,ri)} style={{...S.ghost(col),padding:'4px 0',textAlign:'center',fontSize:8}}>+ Match</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{padding:'12px 10px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
          <button onClick={()=>setView('mobile')} style={{padding:'5px 12px',borderRadius:7,border:`1px solid ${view==='mobile'?'var(--gold)':'var(--border)'}`,background:view==='mobile'?'var(--gold)':'transparent',color:view==='mobile'?'var(--charcoal)':'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase',fontWeight:700}}>📱 Mobile</button>
          <button onClick={()=>setView('visual')} style={{padding:'5px 12px',borderRadius:7,border:`1px solid ${view==='visual'?'var(--gold)':'var(--border)'}`,background:view==='visual'?'var(--gold)':'transparent',color:view==='visual'?'var(--charcoal)':'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase',fontWeight:700}}>🏆 Bracket</button>
          {isCommissioner&&<button onClick={()=>setView('edit')} style={{padding:'5px 12px',borderRadius:7,border:`1px solid ${view==='edit'?'var(--gold)':'var(--border)'}`,background:view==='edit'?'var(--gold)':'transparent',color:view==='edit'?'var(--charcoal)':'var(--cream-dim)',fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase',fontWeight:700}}>✏️ Edit</button>}
          {isFreeform&&<button onClick={()=>setFullScreen(true)} style={{padding:'5px 12px',borderRadius:7,border:'1px solid var(--gold-dark)',background:'transparent',color:'var(--gold)',fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase',fontWeight:700}}>🖥 Full View</button>}
        </div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {view==='edit'&&sectionAddButtons.map(([t,l,c])=><button key={t} onClick={()=>addLiveSection(t)} style={{padding:'4px 9px',borderRadius:7,border:`1px solid ${c}55`,background:'transparent',color:c,fontFamily:'Cinzel',fontSize:9,letterSpacing:1,cursor:'pointer',textTransform:'uppercase'}}>+ {l}</button>)}
          {isCommissioner&&<button onClick={onReset} style={{padding:'5px 10px',borderRadius:7,border:'1px solid var(--red-accent)',background:'none',color:'var(--red-accent)',cursor:'pointer',fontSize:10,fontFamily:'Cinzel'}}>Clear All</button>}
        </div>
      </div>

      {!isFreeform&&<div style={{padding:30,textAlign:'center',color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic'}}>This bracket was built in an older format. Click "Clear All" to rebuild with the new visual editor.</div>}

      {isFreeform&&view==='mobile'&&<MobileBracketView structure={structure} matches={matches} players={players} isCommissioner={isCommissioner}/>}

      {isFreeform&&view==='visual'&&<VisualBracket structure={structure} matches={matches} players={players} isCommissioner={isCommissioner} onOpenScore={openMatch} onEditSlot={(dbm,field,current,secId,rndId,mi)=>setEditor({matchId:dbm.id,field,secId,rndId,mi,current})}/>}

      {isFreeform&&view==='edit'&&(
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          {sections.map((sec,si)=>{const col=sCol[sec.type]||'var(--gold)';return(
            <div key={sec.id}>
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'5px 10px',background:'var(--charcoal-3)',borderRadius:'8px 8px 0 0',borderBottom:`2px solid ${col}44`}}>
                <div style={{width:3,height:14,borderRadius:2,background:col,flexShrink:0}}/>
                <input value={sec.name} onChange={e=>mutate(b=>{if(b.sections?.[si])b.sections[si].name=e.target.value;return b})} style={{flex:1,background:'transparent',border:'none',color:col,fontFamily:'Cinzel',fontSize:9,letterSpacing:3,textTransform:'uppercase',outline:'none',fontWeight:700}}/>
                <button onClick={()=>addLiveRound(si)} style={{...S.ghost(col),padding:'2px 8px',fontSize:8}}>+ Round</button>
              </div>
              <div style={{display:'flex',gap:0,overflowX:'auto',minWidth:sec.rounds.length*176}}>{sec.rounds.map((rnd,ri)=><EditRoundCol key={rnd.id} sec={sec} si={si} rnd={rnd} ri={ri}/>)}</div>
            </div>
          )})}
        </div>
      )}

      {editor&&(()=>{
        const sec=sections.find(s=>s.id===editor.secId)
        const rnd=sec?.rounds.find(r=>r.id===editor.rndId)
        const bm=rnd?.matches[editor.mi]
        const curSlot = bm ? (editor.field==='player1_id'?bm.p1:bm.p2) : null
        return <SlotEditor slot={curSlot} matchId={bm?.id} allMatches={matchList} players={players} usedPlayerIds={new Set(matches.flatMap(m=>[m.player1_id,m.player2_id].filter(Boolean)))} onSet={applyLiveSlot} onClose={()=>setEditor(null)}/>
      })()}

      {fullScreen&&<FullBracketOverlay structure={structure} matches={matches} players={players} isCommissioner={isCommissioner} onOpenScore={openMatch} onClose={()=>setFullScreen(false)}/>}
    </div>
  )
}

// ═══ MAIN EXPORT ═══
export function BracketTab({ players, tournament, matches, isCommissioner, setActiveMatch, setTab }) {
  const structure = tournament?.bracket

  const handleGenerate = async (structure) => {
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({id:'season6',bracket:structure,status:'active',updated_at:new Date().toISOString()})
    if(structure.type==='freeform'){
      for(const sec of structure.sections)for(let ri=0;ri<sec.rounds.length;ri++){const rnd=sec.rounds[ri];for(let mi=0;mi<rnd.matches.length;mi++){const m=rnd.matches[mi];if(isBye(m.p1)&&isBye(m.p2))continue
        await supabase.from('matches').insert({round_index:ri,match_index:mi,bracket_section:sec.id,section_round_index:ri,freeform_round_id:rnd.id,freeform_match_id:m.id,player1_id:slotP(m.p1)?.id||null,player2_id:slotP(m.p2)?.id||null,rounds:[],total_net1:0,total_net2:0,status:'pending'})}}
    }
  }

  const handleReset = async () => {
    if(!window.confirm('Clear the entire bracket? This cannot be undone.'))return
    await supabase.from('matches').delete().neq('id','00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({id:'season6',bracket:null,status:'setup',updated_at:new Date().toISOString()})
  }

  if(!structure){
    if(!isCommissioner)return <div style={{padding:'32px 20px',textAlign:'center'}}><p style={{color:'var(--cream-dim)',fontFamily:'IM Fell English',fontStyle:'italic',fontSize:15}}>🔒 Commissioner access required.</p></div>
    return <FreeformBuilder players={players} onGenerate={handleGenerate}/>
  }
  return <BracketViewer structure={structure} matches={matches} players={players} isCommissioner={isCommissioner} onReset={handleReset} setActiveMatch={setActiveMatch} setTab={setTab}/>
}
