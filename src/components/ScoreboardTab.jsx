import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { calcRoundScore, calcMatchTotals, getRoundName } from '../lib/game'

function WasherInput({ label, value, onChange, max = 4, color }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <span style={{ fontFamily:'Cinzel', fontSize:9, letterSpacing:2, color, textTransform:'uppercase' }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => onChange(Math.max(0, value - 1))}
          style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-3)', color:'#ef4444', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>−</button>
        <span style={{ color:'var(--cream)', fontFamily:'Cinzel Decorative', fontSize:28, fontWeight:700, width:30, textAlign:'center' }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))}
          style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-3)', color:'#10b981', fontSize:20, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
      </div>
      <span style={{ color:'var(--cream-dim)', fontSize:10 }}>max {max}</span>
    </div>
  )
}

export function ScoreboardTab({ matches, players, tournament, isCommissioner, activeMatch, setActiveMatch }) {
  const bracket = tournament?.bracket
  const [p1Box, setP1Box] = useState(0)
  const [p1Cup, setP1Cup] = useState(0)
  const [p2Box, setP2Box] = useState(0)
  const [p2Cup, setP2Cup] = useState(0)
  const [saving, setSaving] = useState(false)
  const [editRound, setEditRound] = useState(null)

  // Currently selected match
  const selectedMatch = activeMatch?.matchId
    ? matches.find(m => m.id === activeMatch.matchId)
    : matches.find(m => m.status === 'active') || matches.find(m => m.status === 'pending')

  useEffect(() => {
    setP1Box(0); setP1Cup(0); setP2Box(0); setP2Cup(0)
  }, [selectedMatch?.id])

  if (!bracket) return (
    <div style={{ padding:40, textAlign:'center', color:'var(--cream-dim)' }}>
      <p style={{ fontFamily:'IM Fell English', fontSize:16, fontStyle:'italic' }}>No bracket generated yet.</p>
    </div>
  )

  if (!selectedMatch) return (
    <div style={{ padding:40, textAlign:'center', color:'var(--cream-dim)' }}>
      <p style={{ fontFamily:'IM Fell English', fontSize:16, fontStyle:'italic' }}>No active match. Select one below.</p>
    </div>
  )

  const p1 = players.find(p => p.id === selectedMatch.player1_id)
  const p2 = players.find(p => p.id === selectedMatch.player2_id)
  const rounds = selectedMatch.rounds || []
  const { total1, total2 } = calcMatchTotals(rounds)
  const { gross1, gross2, net1, net2 } = calcRoundScore(p1Box, p1Cup, p2Box, p2Cup)
  const totalWashersP1 = p1Box + p1Cup
  const totalWashersP2 = p2Box + p2Cup

  const confirmRound = async () => {
    if (!isCommissioner) return
    setSaving(true)
    const newRound = { p1Box, p1Cup, p2Box, p2Cup, gross1, gross2, net1, net2, confirmed: true }
    const newRounds = [...rounds, newRound]
    const newTotal1 = total1 + net1
    const newTotal2 = total2 + net2
    await supabase.from('matches').update({
      rounds: newRounds,
      total_net1: newTotal1,
      total_net2: newTotal2,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedMatch.id)
    setP1Box(0); setP1Cup(0); setP2Box(0); setP2Cup(0)
    setSaving(false)
  }

  const editRoundFn = async (idx, field, val) => {
    const updated = rounds.map((r, i) => i === idx ? { ...r, [field]: val } : r)
    // Recalculate net for edited round
    const r = updated[idx]
    const recalc = calcRoundScore(r.p1Box, r.p1Cup, r.p2Box, r.p2Cup)
    updated[idx] = { ...updated[idx], ...recalc }
    const newTotal1 = updated.filter(r=>r.confirmed).reduce((s,r)=>s+r.net1,0)
    const newTotal2 = updated.filter(r=>r.confirmed).reduce((s,r)=>s+r.net2,0)
    await supabase.from('matches').update({ rounds: updated, total_net1: newTotal1, total_net2: newTotal2, updated_at: new Date().toISOString() }).eq('id', selectedMatch.id)
    setEditRound(null)
  }

  const deleteRound = async (idx) => {
    const updated = rounds.filter((_, i) => i !== idx)
    const newTotal1 = updated.filter(r=>r.confirmed).reduce((s,r)=>s+r.net1,0)
    const newTotal2 = updated.filter(r=>r.confirmed).reduce((s,r)=>s+r.net2,0)
    await supabase.from('matches').update({ rounds: updated, total_net1: newTotal1, total_net2: newTotal2, updated_at: new Date().toISOString() }).eq('id', selectedMatch.id)
  }

  const declareWinner = async (winnerId) => {
    if (!isCommissioner) return
    await supabase.from('matches').update({ winner_id: winnerId, status: 'complete', updated_at: new Date().toISOString() }).eq('id', selectedMatch.id)
    // Advance winner in bracket
    const ri = selectedMatch.round_index
    const mi = selectedMatch.match_index
    const nextRi = ri + 1
    if (bracket[nextRi]) {
      const nextMi = Math.floor(mi / 2)
      const nextMatch = matches.find(m => m.round_index === nextRi && m.match_index === nextMi)
      if (nextMatch) {
        const field = mi % 2 === 0 ? 'player1_id' : 'player2_id'
        await supabase.from('matches').update({ [field]: winnerId, updated_at: new Date().toISOString() }).eq('id', nextMatch.id)
        // Also update bracket JSON in tournament
        const newBracket = bracket.map((round, r) => r === nextRi ? round.map((m, mm) => mm === nextMi ? {
          ...m, [mi % 2 === 0 ? 'p1' : 'p2']: players.find(p=>p.id===winnerId)
        } : m) : round)
        await supabase.from('tournament').update({ bracket: newBracket, updated_at: new Date().toISOString() }).eq('id', 'season6')
      }
    }
  }

  const roundName = getRoundName(selectedMatch.round_index, bracket.length)

  return (
    <div style={{ padding:'16px', maxWidth:680, margin:'0 auto' }}>
      {/* Match selector */}
      <div style={{ marginBottom:16 }}>
        <select value={selectedMatch.id}
          onChange={e => setActiveMatch({ matchId: e.target.value })}
          style={{ width:'100%', padding:'9px 13px', borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-2)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Cinzel' }}>
          {matches.map(m => {
            const pp1 = players.find(p=>p.id===m.player1_id)
            const pp2 = players.find(p=>p.id===m.player2_id)
            const rn = getRoundName(m.round_index, bracket.length)
            return (
              <option key={m.id} value={m.id}>
                {rn} · {pp1?.name||'TBD'} vs {pp2?.name||'TBD'} {m.status==='complete'?'✓':''}
              </option>
            )
          })}
        </select>
      </div>

      {/* Round badge */}
      <div style={{ textAlign:'center', marginBottom:16 }}>
        <span style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:4, textTransform:'uppercase' }}>{roundName}</span>
      </div>

      {/* Scoreboard */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center', marginBottom:20 }}>
        {/* P1 */}
        <div style={{ background:'var(--charcoal-2)', borderRadius:14, padding:'18px 14px', border:`2px solid ${total1 > total2 ? 'var(--gold)' : 'var(--border)'}`, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
          <Avatar player={p1} size={64} ring={total1 > total2} />
          <p style={{ color:'var(--cream)', fontFamily:'Cinzel', fontWeight:600, fontSize:14, margin:0 }}>{p1?.name||'TBD'}</p>
          {p1?.nickname && <p style={{ color:'var(--gold)', fontSize:12, margin:0, fontFamily:'IM Fell English', fontStyle:'italic' }}>"{p1.nickname}"</p>}
          <div style={{ fontSize:52, fontFamily:'Cinzel Decorative', fontWeight:900, color: total1 > total2 ? 'var(--gold)' : 'var(--cream)', lineHeight:1 }}>{total1}</div>
          <span style={{ fontSize:11, color:'var(--cream-dim)', fontFamily:'Cinzel', letterSpacing:2 }}>NET PTS</span>
          {selectedMatch.winner_id === p1?.id && <span style={{ background:'var(--gold)', color:'var(--charcoal)', fontFamily:'Cinzel', fontSize:10, padding:'3px 12px', borderRadius:20, fontWeight:700, letterSpacing:2 }}>WINNER</span>}
        </div>

        {/* VS */}
        <div style={{ textAlign:'center' }}>
          <p style={{ fontFamily:'Cinzel Decorative', color:'var(--gold-dark)', fontSize:18, margin:0 }}>VS</p>
        </div>

        {/* P2 */}
        <div style={{ background:'var(--charcoal-2)', borderRadius:14, padding:'18px 14px', border:`2px solid ${total2 > total1 ? 'var(--gold)' : 'var(--border)'}`, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
          <Avatar player={p2} size={64} ring={total2 > total1} />
          <p style={{ color:'var(--cream)', fontFamily:'Cinzel', fontWeight:600, fontSize:14, margin:0 }}>{p2?.name||'TBD'}</p>
          {p2?.nickname && <p style={{ color:'var(--gold)', fontSize:12, margin:0, fontFamily:'IM Fell English', fontStyle:'italic' }}>"{p2.nickname}"</p>}
          <div style={{ fontSize:52, fontFamily:'Cinzel Decorative', fontWeight:900, color: total2 > total1 ? 'var(--gold)' : 'var(--cream)', lineHeight:1 }}>{total2}</div>
          <span style={{ fontSize:11, color:'var(--cream-dim)', fontFamily:'Cinzel', letterSpacing:2 }}>NET PTS</span>
          {selectedMatch.winner_id === p2?.id && <span style={{ background:'var(--gold)', color:'var(--charcoal)', fontFamily:'Cinzel', fontSize:10, padding:'3px 12px', borderRadius:20, fontWeight:700, letterSpacing:2 }}>WINNER</span>}
        </div>
      </div>

      {/* Current round entry — commissioner only */}
      {isCommissioner && selectedMatch.status !== 'complete' && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:14, padding:18, border:'1px solid var(--border-bright)', marginBottom:16 }}>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase', textAlign:'center', marginBottom:16 }}>
            Round {rounds.length + 1} Entry
          </p>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            {/* P1 inputs */}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <p style={{ color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:11, letterSpacing:2, textAlign:'center', textTransform:'uppercase' }}>{p1?.name||'P1'}</p>
              <WasherInput label="In Box (1pt)" value={p1Box} onChange={v => setP1Box(v)} color="var(--gold)" />
              <WasherInput label="In Cup (3pt)" value={p1Cup} onChange={v => setP1Cup(Math.min(v, Math.max(0, 4 - p1Box)))} max={Math.max(0,4-p1Box)} color="var(--gold-light)" />
              <div style={{ textAlign:'center', color:'var(--gold)', fontFamily:'Cinzel', fontSize:13 }}>
                Gross: <strong>{gross1}</strong>
              </div>
            </div>

            {/* P2 inputs */}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <p style={{ color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:11, letterSpacing:2, textAlign:'center', textTransform:'uppercase' }}>{p2?.name||'P2'}</p>
              <WasherInput label="In Box (1pt)" value={p2Box} onChange={v => setP2Box(v)} color="var(--gold)" />
              <WasherInput label="In Cup (3pt)" value={p2Cup} onChange={v => setP2Cup(Math.min(v, Math.max(0, 4 - p2Box)))} max={Math.max(0,4-p2Box)} color="var(--gold-light)" />
              <div style={{ textAlign:'center', color:'var(--gold)', fontFamily:'Cinzel', fontSize:13 }}>
                Gross: <strong>{gross2}</strong>
              </div>
            </div>
          </div>

          {/* Net preview */}
          <div style={{ background:'var(--charcoal-3)', borderRadius:10, padding:'12px 16px', marginTop:16, display:'flex', justifyContent:'space-around', alignItems:'center' }}>
            <div style={{ textAlign:'center' }}>
              <p style={{ color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:9, letterSpacing:2, textTransform:'uppercase', margin:0 }}>Net — {p1?.name||'P1'}</p>
              <p style={{ color: net1 > 0 ? '#10b981' : 'var(--cream-dim)', fontFamily:'Cinzel Decorative', fontSize:28, fontWeight:700, margin:0 }}>+{net1}</p>
            </div>
            <div style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:11 }}>CANCEL</div>
            <div style={{ textAlign:'center' }}>
              <p style={{ color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:9, letterSpacing:2, textTransform:'uppercase', margin:0 }}>Net — {p2?.name||'P2'}</p>
              <p style={{ color: net2 > 0 ? '#10b981' : 'var(--cream-dim)', fontFamily:'Cinzel Decorative', fontSize:28, fontWeight:700, margin:0 }}>+{net2}</p>
            </div>
          </div>

          {totalWashersP1 > 4 && <p style={{ color:'#ef4444', fontSize:12, textAlign:'center', marginTop:8 }}>⚠ {p1?.name} has {totalWashersP1} washers — max 4</p>}
          {totalWashersP2 > 4 && <p style={{ color:'#ef4444', fontSize:12, textAlign:'center', marginTop:8 }}>⚠ {p2?.name} has {totalWashersP2} washers — max 4</p>}

          <button onClick={confirmRound}
            disabled={saving || totalWashersP1 > 4 || totalWashersP2 > 4}
            style={{ width:'100%', marginTop:16, padding:'12px 0', borderRadius:10, border:'1px solid var(--gold)',
              background:'var(--gold)', color:'var(--charcoal)', fontFamily:'Cinzel', fontWeight:700,
              fontSize:13, letterSpacing:2, cursor:'pointer', textTransform:'uppercase' }}>
            {saving ? 'Saving…' : '✓ Confirm Round'}
          </button>
        </div>
      )}

      {/* Round history */}
      {rounds.length > 0 && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:12, padding:14, border:'1px solid var(--border)', marginBottom:16 }}>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>Round History</p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {rounds.map((r, i) => (
              <div key={i} style={{ display:'grid', gridTemplateColumns:'auto 1fr 1fr auto', gap:10, alignItems:'center',
                background:'var(--charcoal-3)', borderRadius:8, padding:'8px 12px' }}>
                <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:11 }}>R{i+1}</span>
                <div>
                  <span style={{ color:'var(--cream-dim)', fontSize:11 }}>{p1?.name}: </span>
                  <span style={{ color:'var(--cream)', fontSize:11 }}>{r.p1Box}📦 {r.p1Cup}🔵 </span>
                  <span style={{ color: r.net1 > 0 ? '#10b981' : 'var(--cream-dim)', fontSize:12, fontWeight:700 }}>+{r.net1}</span>
                </div>
                <div>
                  <span style={{ color:'var(--cream-dim)', fontSize:11 }}>{p2?.name}: </span>
                  <span style={{ color:'var(--cream)', fontSize:11 }}>{r.p2Box}📦 {r.p2Cup}🔵 </span>
                  <span style={{ color: r.net2 > 0 ? '#10b981' : 'var(--cream-dim)', fontSize:12, fontWeight:700 }}>+{r.net2}</span>
                </div>
                {isCommissioner && (
                  <button onClick={() => deleteRound(i)}
                    style={{ background:'none', border:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:14 }}>×</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Declare winner */}
      {isCommissioner && selectedMatch.status !== 'complete' && rounds.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[{ p: p1, label: p1?.name }, { p: p2, label: p2?.name }].map(({ p, label }) => (
            <button key={p?.id} onClick={() => p && declareWinner(p.id)}
              disabled={!p}
              style={{ padding:'11px 0', borderRadius:10, border:'1px solid var(--gold)',
                background:'transparent', color:'var(--gold)', fontFamily:'Cinzel', fontSize:11,
                letterSpacing:2, cursor: p ? 'pointer' : 'not-allowed', textTransform:'uppercase' }}>
              {label || 'TBD'} Wins
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
