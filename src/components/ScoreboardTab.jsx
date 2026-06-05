import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { calcRoundScore, calcMatchTotals, getDefaultRoundName } from '../lib/game'

function WasherInput({ label, value, onChange, max = 4, color }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
      <span style={{ fontFamily:'Cinzel', fontSize:9, letterSpacing:2, color, textTransform:'uppercase' }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <button onClick={() => onChange(Math.max(0, value - 1))}
          style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-3)', color:'#ef4444', fontSize:20, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>−</button>
        <span style={{ color:'var(--cream)', fontFamily:'Cinzel Decorative', fontSize:28, fontWeight:700, width:30, textAlign:'center' }}>{value}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))}
          style={{ width:32, height:32, borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-3)', color:'#10b981', fontSize:20, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>+</button>
      </div>
      <span style={{ color:'var(--cream-dim)', fontSize:10 }}>max {max}</span>
    </div>
  )
}

// Resolve a human-readable name for a match from the bracket structure
function resolveMatchName(match, bracket) {
  if (!bracket) return 'Match'
  const section = match.bracket_section || 'winners'
  const sri = match.section_round_index ?? match.round_index ?? 0
  const rndId = match.freeform_round_id

  // Freeform: bracket_section is a UUID (section ID), not a type string
  if (bracket.type === 'freeform' && bracket.sections) {
    const sec = bracket.sections.find(s => s.id === section)
    if (!sec) return 'Match'
    const rnd = rndId
      ? sec.rounds?.find(r => r.id === rndId)
      : sec.rounds?.[sri]
    const rndName = rnd?.name || `Round ${sri + 1}`
    return `${sec.name || 'Section'} — ${rndName}`
  }
  if (section === 'consolation') {
    return bracket.consolation?.[sri]?.name || `Consolation Round ${sri + 1}`
  }
  if (!bracket.type || bracket.type === 'single') {
    const totalRounds = bracket.rounds?.length || 1
    return bracket.rounds?.[sri]?.name || getDefaultRoundName(sri, totalRounds, 'winners')
  }
  if (section === 'winners') {
    const totalRounds = bracket.winners?.length || 1
    return bracket.winners?.[sri]?.name || getDefaultRoundName(sri, totalRounds, 'winners')
  }
  if (section === 'losers') {
    const totalRounds = bracket.losers?.length || 1
    return bracket.losers?.[sri]?.name || getDefaultRoundName(sri, totalRounds, 'losers')
  }
  return bracket.grandFinal?.name || 'Grand Final'
}

// Advance winner to next match in the bracket
// Find the builder (structure JSON) match id for a given DB match row
function findBuilderMatchId(dbMatch, bracket) {
  if (dbMatch.freeform_match_id) return dbMatch.freeform_match_id
  const sec = bracket?.sections?.find(s => s.id === dbMatch.bracket_section)
  if (!sec) return null
  const rnd = sec.rounds.find(r => r.id === dbMatch.freeform_round_id)
    || sec.rounds[dbMatch.section_round_index ?? 0]
  if (!rnd) return null
  const bm = rnd.matches?.[dbMatch.match_index ?? 0]
  return bm?.id || null
}

// Locate the DB row for a builder match (by id, then by section+round+index)
function findDbRowForBuilderMatch(builderMatchId, sec, rnd, mi, matches) {
  return matches.find(m => m.freeform_match_id === builderMatchId)
    || matches.find(m => m.bracket_section === sec.id && m.freeform_round_id === rnd.id && m.match_index === mi)
    || matches.find(m => m.bracket_section === sec.id && m.match_index === mi)
}

async function advanceWinner(winnerId, loserPlayerId, match, matches, bracket, players) {
  const section = match.bracket_section || 'winners'
  const sri = match.section_round_index ?? match.round_index ?? 0
  const mi = match.match_index ?? 0

  // ── FREEFORM: push winner into any slot linked as "winner of THIS match" ──
  if (bracket?.type === 'freeform' && bracket.sections) {
    const thisBuilderId = findBuilderMatchId(match, bracket)
    if (!thisBuilderId) return
    for (const sec of bracket.sections) {
      for (let ri = 0; ri < sec.rounds.length; ri++) {
        const rnd = sec.rounds[ri]
        for (let mmi = 0; mmi < rnd.matches.length; mmi++) {
          const bm = rnd.matches[mmi]
          const p1Linked = bm.p1?.type === 'winner_of' && bm.p1.matchId === thisBuilderId
          const p2Linked = bm.p2?.type === 'winner_of' && bm.p2.matchId === thisBuilderId
          if (!p1Linked && !p2Linked) continue
          const depRow = findDbRowForBuilderMatch(bm.id, sec, rnd, mmi, matches)
          if (!depRow) continue
          const patch = { updated_at: new Date().toISOString() }
          if (p1Linked) patch.player1_id = winnerId
          if (p2Linked) patch.player2_id = winnerId
          await supabase.from('matches').update(patch).eq('id', depRow.id)
        }
      }
    }
    return
  }

  if (bracket?.type === 'single') {
    const nextSri = sri + 1
    const nextMi = Math.floor(mi / 2)
    const nextMatch = matches.find(m =>
      (m.bracket_section === 'winners' || !m.bracket_section) &&
      (m.section_round_index ?? m.round_index) === nextSri &&
      m.match_index === nextMi
    )
    if (nextMatch) {
      const field = mi % 2 === 0 ? 'player1_id' : 'player2_id'
      await supabase.from('matches').update({ [field]: winnerId, updated_at: new Date().toISOString() }).eq('id', nextMatch.id)
      // Update bracket JSON
      const winnerPlayer = players.find(p => p.id === winnerId)
      const updatedRounds = bracket.rounds.map((r, ri) =>
        ri === nextSri ? { ...r, matches: r.matches.map((m, mm) =>
          mm === nextMi ? { ...m, [mi % 2 === 0 ? 'p1' : 'p2']: winnerPlayer } : m
        )} : r
      )
      await supabase.from('tournament').update({ bracket: { ...bracket, rounds: updatedRounds }, updated_at: new Date().toISOString() }).eq('id','season6')
    }
  } else if (bracket?.type === 'double') {
    if (section === 'winners') {
      // Winner advances in winners bracket
      const nextSri = sri + 1
      const nextMi = Math.floor(mi / 2)
      const nextWMatch = matches.find(m => m.bracket_section === 'winners' && (m.section_round_index ?? m.round_index) === nextSri && m.match_index === nextMi)
      if (nextWMatch) {
        const field = mi % 2 === 0 ? 'player1_id' : 'player2_id'
        await supabase.from('matches').update({ [field]: winnerId, updated_at: new Date().toISOString() }).eq('id', nextWMatch.id)
      }
      // Loser drops to losers bracket — L round = sri*2, slot based on match position
      if (loserPlayerId) {
        const losersRoundIdx = sri * 2 // first losers round for this winners round
        const losersMi = mi
        const lMatch = matches.find(m => m.bracket_section === 'losers' && (m.section_round_index ?? m.round_index) === losersRoundIdx && m.match_index === losersMi)
        if (lMatch) {
          await supabase.from('matches').update({ player1_id: loserPlayerId, updated_at: new Date().toISOString() }).eq('id', lMatch.id)
        }
      }
    } else if (section === 'losers') {
      const totalLRounds = bracket.losers?.length || 1
      const nextSri = sri + 1
      if (nextSri < totalLRounds) {
        const nextMi = Math.floor(mi / 2)
        const nextLMatch = matches.find(m => m.bracket_section === 'losers' && (m.section_round_index ?? m.round_index) === nextSri && m.match_index === nextMi)
        if (nextLMatch) {
          const field = mi % 2 === 0 ? 'player1_id' : 'player2_id'
          await supabase.from('matches').update({ [field]: winnerId, updated_at: new Date().toISOString() }).eq('id', nextLMatch.id)
        }
      } else {
        // Last losers round — advance to grand final p2
        const gfMatch = matches.find(m => m.bracket_section === 'grand_final')
        if (gfMatch) await supabase.from('matches').update({ player2_id: winnerId, updated_at: new Date().toISOString() }).eq('id', gfMatch.id)
      }
    } else if (section === 'grand_final') {
      // Tournament over — no advancement needed
    }
  }
}

export function ScoreboardTab({ matches, players, tournament, isCommissioner, activeMatch, setActiveMatch }) {
  const bracket = tournament?.bracket
  const [p1Box, setP1Box] = useState(0)
  const [p1Cup, setP1Cup] = useState(0)
  const [p2Box, setP2Box] = useState(0)
  const [p2Cup, setP2Cup] = useState(0)
  const [saving, setSaving] = useState(false)

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
      rounds: newRounds, total_net1: newTotal1, total_net2: newTotal2,
      updated_at: new Date().toISOString(),
    }).eq('id', selectedMatch.id)
    setP1Box(0); setP1Cup(0); setP2Box(0); setP2Cup(0)
    setSaving(false)
  }

  const deleteRound = async (idx) => {
    const updated = rounds.filter((_, i) => i !== idx)
    const newTotal1 = updated.filter(r => r.confirmed).reduce((s, r) => s + r.net1, 0)
    const newTotal2 = updated.filter(r => r.confirmed).reduce((s, r) => s + r.net2, 0)
    await supabase.from('matches').update({ rounds: updated, total_net1: newTotal1, total_net2: newTotal2, updated_at: new Date().toISOString() }).eq('id', selectedMatch.id)
  }

  const declareWinner = async (winnerId) => {
    if (!isCommissioner) return
    const loserId = winnerId === selectedMatch.player1_id ? selectedMatch.player2_id : selectedMatch.player1_id
    await supabase.from('matches').update({ winner_id: winnerId, status: 'complete', updated_at: new Date().toISOString() }).eq('id', selectedMatch.id)
    await advanceWinner(winnerId, loserId, selectedMatch, matches, bracket, players)
  }

  const matchLabel = resolveMatchName(selectedMatch, bracket)
  const isFreeform = bracket?.type === 'freeform'
  const freeformSec = isFreeform ? bracket.sections?.find(s=>s.id===selectedMatch.bracket_section) : null
  const sectionBadge = freeformSec ? `📋 ${freeformSec.name||'Custom Section'}`
    : selectedMatch.bracket_section === 'losers' ? '🔴 Losers Bracket'
    : selectedMatch.bracket_section === 'grand_final' ? '🏆 Grand Final'
    : selectedMatch.bracket_section === 'consolation' ? '🟣 Consolation Bracket'
    : '🟡 Winners Bracket'

  return (
    <div style={{ padding:'16px', maxWidth:680, margin:'0 auto' }}>
      {/* Match selector */}
      <div style={{ marginBottom:14 }}>
        <select value={selectedMatch.id}
          onChange={e => setActiveMatch({ matchId: e.target.value })}
          style={{ width:'100%', padding:'9px 13px', borderRadius:8, border:'1px solid var(--border-bright)',
            background:'var(--charcoal-2)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Cinzel' }}>
          {matches.map(m => {
            const pp1 = players.find(p => p.id === m.player1_id)
            const pp2 = players.find(p => p.id === m.player2_id)
            const sec = m.bracket_section === 'losers' ? '[L] ' : m.bracket_section === 'grand_final' ? '[GF] ' : ''
            return (
              <option key={m.id} value={m.id}>
                {sec}{resolveMatchName(m, bracket)} · {pp1?.name||'TBD'} vs {pp2?.name||'TBD'} {m.status==='complete'?'✓':''}
              </option>
            )
          })}
        </select>
      </div>

      {/* Match label */}
      <div style={{ textAlign:'center', marginBottom:16 }}>
        <span style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:4, textTransform:'uppercase' }}>{matchLabel}</span>
        {bracket?.type === 'double' && (
          <div style={{ fontSize:11, color:'var(--cream-dim)', marginTop:4, fontFamily:'Oswald' }}>{sectionBadge}</div>
        )}
      </div>

      {/* Scoreboard panels */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center', marginBottom:20 }}>
        {[
          { player: p1, total: total1, other: total2, idx: 1 },
          { player: p2, total: total2, other: total1, idx: 2 },
        ].reduce((acc, item, i) => {
          if (i === 1) acc.push(<div key="vs" style={{ textAlign:'center' }}><p style={{ fontFamily:'Cinzel Decorative', color:'var(--gold-dark)', fontSize:18, margin:0 }}>VS</p></div>)
          acc.push(
            <div key={item.idx} style={{ background:'var(--charcoal-2)', borderRadius:14, padding:'18px 14px',
              border:`2px solid ${item.total > item.other ? 'var(--gold)' : 'var(--border)'}`,
              textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <Avatar player={item.player} size={64} ring={item.total > item.other} />
              <p style={{ color:'var(--cream)', fontFamily:'Cinzel', fontWeight:600, fontSize:14, margin:0 }}>{item.player?.name||'TBD'}</p>
              {item.player?.nickname && <p style={{ color:'var(--gold)', fontSize:12, margin:0, fontFamily:'IM Fell English', fontStyle:'italic' }}>"{item.player.nickname}"</p>}
              <div style={{ fontSize:52, fontFamily:'Cinzel Decorative', fontWeight:900, color: item.total > item.other ? 'var(--gold)' : 'var(--cream)', lineHeight:1 }}>{item.total}</div>
              <span style={{ fontSize:11, color:'var(--cream-dim)', fontFamily:'Cinzel', letterSpacing:2 }}>NET PTS</span>
              {selectedMatch.winner_id === item.player?.id && <span style={{ background:'var(--gold)', color:'var(--charcoal)', fontFamily:'Cinzel', fontSize:10, padding:'3px 12px', borderRadius:20, fontWeight:700, letterSpacing:2 }}>WINNER</span>}
            </div>
          )
          return acc
        }, [])}
      </div>

      {/* Commissioner entry */}
      {isCommissioner && selectedMatch.status !== 'complete' && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:14, padding:18, border:'1px solid var(--border-bright)', marginBottom:16 }}>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase', textAlign:'center', marginBottom:16 }}>
            Round {rounds.length + 1} Entry
          </p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <p style={{ color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:11, letterSpacing:2, textAlign:'center', textTransform:'uppercase', margin:0 }}>{p1?.name||'P1'}</p>
              <WasherInput label="In Box (1pt)" value={p1Box} onChange={setP1Box} color="var(--gold)" />
              <WasherInput label="In Cup (3pt)" value={p1Cup} onChange={v => setP1Cup(Math.min(v, Math.max(0, 4-p1Box)))} max={Math.max(0,4-p1Box)} color="var(--gold-light)" />
              <div style={{ textAlign:'center', color:'var(--gold)', fontFamily:'Cinzel', fontSize:13 }}>Gross: <strong>{gross1}</strong></div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <p style={{ color:'var(--cream-dim)', fontFamily:'Cinzel', fontSize:11, letterSpacing:2, textAlign:'center', textTransform:'uppercase', margin:0 }}>{p2?.name||'P2'}</p>
              <WasherInput label="In Box (1pt)" value={p2Box} onChange={setP2Box} color="var(--gold)" />
              <WasherInput label="In Cup (3pt)" value={p2Cup} onChange={v => setP2Cup(Math.min(v, Math.max(0, 4-p2Box)))} max={Math.max(0,4-p2Box)} color="var(--gold-light)" />
              <div style={{ textAlign:'center', color:'var(--gold)', fontFamily:'Cinzel', fontSize:13 }}>Gross: <strong>{gross2}</strong></div>
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

          <button onClick={confirmRound} disabled={saving || totalWashersP1 > 4 || totalWashersP2 > 4}
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
          {rounds.map((r, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'auto 1fr 1fr auto', gap:10, alignItems:'center',
              background:'var(--charcoal-3)', borderRadius:8, padding:'8px 12px', marginBottom:6 }}>
              <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:11 }}>R{i+1}</span>
              <div>
                <span style={{ color:'var(--cream-dim)', fontSize:11 }}>{p1?.name}: </span>
                <span style={{ color:'var(--cream)', fontSize:11 }}>{r.p1Box}📦{r.p1Cup}🔵 </span>
                <span style={{ color: r.net1 > 0 ? '#10b981' : 'var(--cream-dim)', fontSize:12, fontWeight:700 }}>+{r.net1}</span>
              </div>
              <div>
                <span style={{ color:'var(--cream-dim)', fontSize:11 }}>{p2?.name}: </span>
                <span style={{ color:'var(--cream)', fontSize:11 }}>{r.p2Box}📦{r.p2Cup}🔵 </span>
                <span style={{ color: r.net2 > 0 ? '#10b981' : 'var(--cream-dim)', fontSize:12, fontWeight:700 }}>+{r.net2}</span>
              </div>
              {isCommissioner && (
                <button onClick={() => deleteRound(i)}
                  style={{ background:'none', border:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:14 }}>×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Declare winner */}
      {isCommissioner && selectedMatch.status !== 'complete' && rounds.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[p1, p2].map(p => (
            <button key={p?.id || Math.random()} onClick={() => p && declareWinner(p.id)}
              disabled={!p}
              style={{ padding:'11px 0', borderRadius:10, border:'1px solid var(--gold)',
                background:'transparent', color:'var(--gold)', fontFamily:'Cinzel', fontSize:11,
                letterSpacing:2, cursor: p ? 'pointer' : 'not-allowed', textTransform:'uppercase' }}>
              {p?.name || 'TBD'} Wins
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
