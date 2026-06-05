import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { shuffle, buildBracket, getRoundName } from '../lib/game'

export function BracketTab({ players, tournament, matches, isCommissioner, setActiveMatch, setTab }) {
  const [mode, setMode] = useState('random')
  const [manualOrder, setManualOrder] = useState([])
  const [generating, setGenerating] = useState(false)

  const bracket = tournament?.bracket
  const locked = !!bracket

  const generate = async () => {
    if (players.length < 2) return
    setGenerating(true)
    let ordered
    if (mode === 'random') ordered = shuffle(players.filter(Boolean))
    else if (mode === 'manual') ordered = manualOrder.filter(Boolean)
    else {
      const placed = manualOrder.filter(Boolean)
      const rest = shuffle(players.filter(p => !placed.find(x => x.id === p.id)))
      ordered = [...placed, ...rest]
    }
    const newBracket = buildBracket(ordered)

    // Upsert tournament
    await supabase.from('tournament').upsert({ id: 'season6', bracket: newBracket, status: 'active', updated_at: new Date().toISOString() })

    // Create match rows
    for (let ri = 0; ri < newBracket.length; ri++) {
      for (let mi = 0; mi < newBracket[ri].length; mi++) {
        const m = newBracket[ri][mi]
        const p1 = m.p1; const p2 = m.p2
        if (!p1 && !p2) continue
        await supabase.from('matches').insert({
          round_index: ri, match_index: mi,
          player1_id: p1?.id || null,
          player2_id: p2?.id || null,
          rounds: [], total_net1: 0, total_net2: 0,
          status: ri === 0 ? 'pending' : 'pending',
        })
      }
    }
    setGenerating(false)
  }

  const reset = async () => {
    if (!window.confirm('Reset entire bracket? This cannot be undone.')) return
    await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({ id: 'season6', bracket: null, status: 'setup', updated_at: new Date().toISOString() })
  }

  const openMatch = (match, ri) => {
    setActiveMatch({ matchId: match.id, ri })
    setTab('Scoreboard')
  }

  // Map match data from DB onto bracket display
  const getMatchData = (ri, mi) => {
    return matches.find(m => m.round_index === ri && m.match_index === mi)
  }

  const getPlayer = (id) => players.find(p => p.id === id)

  if (!locked) return (
    <div style={{ padding:'24px 20px', maxWidth:560, margin:'0 auto' }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:13, letterSpacing:5, textTransform:'uppercase', marginBottom:4 }}>Generate Bracket</h2>
        <p style={{ color:'var(--cream-dim)', fontSize:13 }}>Season 6 · International Statewide World Championships</p>
      </div>

      {players.length < 2 && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:14, color:'#f59e0b', marginBottom:16, border:'1px solid #f59e0b44', fontSize:13 }}>
          ⚠ Register at least 2 competitors before generating the bracket.
        </div>
      )}

      {!isCommissioner && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:14, color:'var(--cream-dim)', marginBottom:16, border:'1px solid var(--border)', fontSize:13 }}>
          🔒 Commissioner access required to generate the bracket.
        </div>
      )}

      {isCommissioner && (
        <>
          <div style={{ display:'flex', gap:8, marginBottom:20 }}>
            {['random','manual','combo'].map(m => (
              <button key={m} onClick={() => setMode(m)}
                style={{ flex:1, padding:'9px 0', borderRadius:8, border:`1px solid ${mode===m ? 'var(--gold)' : 'var(--border)'}`,
                  background: mode===m ? 'var(--gold)' : 'transparent',
                  color: mode===m ? 'var(--charcoal)' : 'var(--cream-dim)',
                  fontFamily:'Cinzel', fontWeight:700, fontSize:11, letterSpacing:2, cursor:'pointer', textTransform:'uppercase' }}>
                {m}
              </button>
            ))}
          </div>

          {mode === 'random' && (
            <p style={{ color:'var(--cream-dim)', fontSize:13, marginBottom:20, fontStyle:'italic', fontFamily:'IM Fell English' }}>
              All competitors will be randomly seeded into the bracket.
            </p>
          )}

          {(mode === 'manual' || mode === 'combo') && (
            <div style={{ background:'var(--charcoal-2)', borderRadius:12, padding:14, border:'1px solid var(--border)', marginBottom:16 }}>
              <p style={{ color:'var(--gold)', fontFamily:'Cinzel', fontSize:10, letterSpacing:3, textTransform:'uppercase', marginBottom:10 }}>
                {mode === 'manual' ? 'Set seeding order:' : 'Set top seeds (rest fill randomly):'}
              </p>
              {players.map(p => {
                const idx = manualOrder.findIndex(x => x?.id === p.id)
                const selected = idx >= 0
                return (
                  <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <Avatar player={p} size={32} />
                    <span style={{ flex:1, color:'var(--cream)', fontSize:14, fontFamily:'Cinzel' }}>{p.name}</span>
                    <button onClick={() => setManualOrder(o => selected ? o.filter(x=>x?.id!==p.id) : [...o, p])}
                      style={{ padding:'4px 14px', borderRadius:6, border:`1px solid ${selected ? 'var(--gold)' : 'var(--border)'}`,
                        background: selected ? 'var(--gold)' : 'transparent',
                        color: selected ? 'var(--charcoal)' : 'var(--cream-dim)',
                        fontFamily:'Cinzel', fontSize:11, cursor:'pointer', fontWeight:700 }}>
                      {selected ? `#${idx+1}` : 'Seed'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <button onClick={generate} disabled={players.length < 2 || generating}
            style={{ width:'100%', padding:'13px 0', borderRadius:10, border:'1px solid var(--gold)',
              background: players.length >= 2 ? 'var(--gold)' : 'transparent',
              color: players.length >= 2 ? 'var(--charcoal)' : 'var(--gold-dark)',
              fontFamily:'Cinzel Decorative', fontWeight:700, fontSize:14, cursor: players.length >= 2 ? 'pointer' : 'not-allowed',
              letterSpacing:1 }}>
            {generating ? 'Generating…' : '⚔ Lock In Bracket'}
          </button>
        </>
      )}
    </div>
  )

  // Render bracket
  return (
    <div style={{ padding:'16px 12px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h2 style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:12, letterSpacing:4, textTransform:'uppercase', margin:0 }}>Season 6 Bracket</h2>
        </div>
        {isCommissioner && (
          <button onClick={reset}
            style={{ padding:'5px 13px', borderRadius:7, border:'1px solid var(--red-accent)', background:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:12, fontFamily:'Cinzel' }}>
            Reset
          </button>
        )}
      </div>

      <div style={{ overflowX:'auto', paddingBottom:16 }}>
        <div style={{ display:'flex', gap:0, minWidth: bracket.length * 185 + 160 }}>
          {bracket.map((round, ri) => {
            const roundName = getRoundName(ri, bracket.length)
            return (
              <div key={ri} style={{ flex:1, minWidth:175, display:'flex', flexDirection:'column' }}>
                <div style={{ textAlign:'center', padding:'8px 4px', background:'var(--charcoal-2)',
                  borderBottom:'1px solid var(--border)', borderRight:'1px solid var(--border)' }}>
                  <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:9, letterSpacing:3, textTransform:'uppercase', margin:0 }}>{roundName}</p>
                </div>
                <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'space-around', padding:'10px 6px', borderRight:'1px solid var(--border)' }}>
                  {round.map((bracketMatch, mi) => {
                    const dbMatch = getMatchData(ri, mi)
                    const p1 = bracketMatch.p1 || (dbMatch?.player1_id ? getPlayer(dbMatch.player1_id) : null)
                    const p2 = bracketMatch.p2 || (dbMatch?.player2_id ? getPlayer(dbMatch.player2_id) : null)
                    const s1 = dbMatch?.total_net1 || 0
                    const s2 = dbMatch?.total_net2 || 0
                    const winnerId = dbMatch?.winner_id
                    const isComplete = dbMatch?.status === 'complete'

                    return (
                      <div key={bracketMatch.id}
                        onClick={() => dbMatch && openMatch(dbMatch, ri)}
                        style={{ background:'var(--charcoal-2)', borderRadius:10, padding:'9px 11px',
                          border:`1px solid ${isComplete ? 'var(--gold-dark)' : 'var(--border)'}`,
                          cursor: dbMatch ? 'pointer' : 'default', marginBottom:6,
                          transition:'border-color 0.2s, background 0.2s' }}
                        onMouseEnter={e => dbMatch && (e.currentTarget.style.borderColor='var(--gold)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = isComplete ? 'var(--gold-dark)' : 'var(--border)')}>
                        {[{ p: p1, s: s1, wid: winnerId === p1?.id }, { p: p2, s: s2, wid: winnerId === p2?.id }].map(({ p, s, wid }, i) => (
                          <div key={i} style={{ display:'flex', alignItems:'center', gap:7, padding:'2px 0' }}>
                            <Avatar player={p} size={22} />
                            <span style={{ flex:1, color: wid ? 'var(--gold)' : 'var(--cream)', fontSize:12,
                              fontFamily: wid ? 'Cinzel' : 'Oswald', fontWeight: wid ? 700 : 400,
                              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {p ? (p.nickname ? `"${p.nickname}"` : p.name) : (!p && !bracketMatch.p1 && !bracketMatch.p2 ? '—' : 'TBD')}
                            </span>
                            <span style={{ color: wid ? 'var(--gold)' : 'var(--cream-dim)', fontWeight: wid ? 700 : 400, fontSize:13, fontFamily:'Cinzel' }}>{s}</span>
                          </div>
                        ))}
                        {isComplete && <div style={{ fontSize:9, color:'var(--gold-dark)', fontFamily:'Cinzel', letterSpacing:2, marginTop:3, textAlign:'right' }}>COMPLETE</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Champion column */}
          <div style={{ minWidth:155, display:'flex', flexDirection:'column' }}>
            <div style={{ textAlign:'center', padding:'8px 4px', background:'var(--charcoal-2)', borderBottom:'1px solid var(--border)' }}>
              <p style={{ fontFamily:'Cinzel Decorative', color:'var(--gold)', fontSize:9, letterSpacing:2, margin:0 }}>Champion</p>
            </div>
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', padding:16 }}>
              {(() => {
                const final = bracket[bracket.length-1]?.[0]
                const finalDb = getMatchData(bracket.length-1, 0)
                const champ = finalDb?.winner_id ? getPlayer(finalDb.winner_id) : null
                return champ
                  ? <div style={{ textAlign:'center' }}>
                      <Avatar player={champ} size={60} ring />
                      <p style={{ color:'var(--gold)', fontFamily:'Cinzel', fontWeight:700, fontSize:12, marginTop:8 }}>{champ.name}</p>
                      <p style={{ color:'var(--gold-dark)', fontSize:10, fontFamily:'IM Fell English', fontStyle:'italic' }}>Season 6 Champion</p>
                    </div>
                  : <p style={{ color:'var(--charcoal-4)', fontSize:12, textAlign:'center', fontFamily:'IM Fell English', fontStyle:'italic' }}>To be decided</p>
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
