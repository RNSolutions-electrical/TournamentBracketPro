import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import {
  shuffle, generateId, nextPow2, buildSingleElim, buildDoubleElim,
  flattenDoubleElim, buildSeededSlots, getDefaultRoundName, COLORS
} from '../lib/game'

// ─── Bracket Builder (pre-lock wizard) ───────────────────────────────────────
function BracketBuilder({ players, onGenerate }) {
  const [format, setFormat] = useState('single')      // single | double
  const [seedMode, setSeedMode] = useState('random')  // random | manual | combo
  const [manualOrder, setManualOrder] = useState([])
  const [byeSlots, setByeSlots] = useState(new Set()) // set of slot indices
  const [roundNames, setRoundNames] = useState({})    // { ri: string }
  const [generating, setGenerating] = useState(false)

  // Preview slot count
  const baseSize = nextPow2(players.length + byeSlots.size)
  const slotCount = baseSize
  const byeCount = byeSlots.size
  const playerCount = players.length

  const toggleBye = (idx) => {
    setByeSlots(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const toggleManual = (p) => {
    setManualOrder(o => o.find(x => x?.id === p.id) ? o.filter(x => x?.id !== p.id) : [...o, p])
  }

  const updateRoundName = (ri, name) => setRoundNames(n => ({ ...n, [ri]: name }))

  // Estimate round count for naming
  const estimatedRounds = Math.log2(slotCount)
  const roundNamesArr = Array.from({ length: estimatedRounds }, (_, i) =>
    roundNames[i] || getDefaultRoundName(i, estimatedRounds))

  const handleGenerate = async () => {
    if (players.length < 2) return
    setGenerating(true)
    try {
      const slots = buildSeededSlots(players, byeSlots, seedMode, manualOrder)
      const customNames = Object.entries(roundNames).reduce((acc, [k, v]) => { acc[+k] = v; return acc }, [])

      let structure
      if (format === 'single') {
        const rounds = buildSingleElim(slots, customNames)
        structure = { type: 'single', rounds, roundNames }
      } else {
        const de = buildDoubleElim(slots)
        const flat = flattenDoubleElim(de)
        structure = { type: 'double', winners: de.winners, losers: de.losers, grandFinal: de.grandFinal, flat, roundNames }
      }
      await onGenerate(structure)
    } finally {
      setGenerating(false)
    }
  }

  const S = styles

  return (
    <div style={{ padding:'24px 20px', maxWidth:600, margin:'0 auto' }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={S.sectionLabel}>Build Bracket</h2>
        <p style={{ color:'var(--cream-dim)', fontSize:13 }}>Season 6 · International Statewide World Championships</p>
      </div>

      {players.length < 2 && (
        <div style={S.warning}>⚠ Register at least 2 competitors in the Players tab first.</div>
      )}

      {/* ── Format ── */}
      <Section title="Elimination Format">
        <div style={{ display:'flex', gap:8 }}>
          {[['single','Single Elimination'],['double','Double Elimination']].map(([val, label]) => (
            <button key={val} onClick={() => setFormat(val)} style={S.segBtn(format === val)}>
              {val === 'double' && '⚔ '}{label}
            </button>
          ))}
        </div>
        {format === 'double' && (
          <p style={{ color:'var(--cream-dim)', fontSize:12, marginTop:8, fontFamily:'IM Fell English', fontStyle:'italic' }}>
            Losers bracket + grand final. A player must lose twice to be eliminated.
          </p>
        )}
      </Section>

      {/* ── Seeding ── */}
      <Section title="Seeding Mode">
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          {[['random','Random'],['manual','Manual'],['combo','Combo']].map(([val, label]) => (
            <button key={val} onClick={() => setSeedMode(val)} style={S.segBtn(seedMode === val)}>{label}</button>
          ))}
        </div>
        {seedMode === 'random' && (
          <p style={{ color:'var(--cream-dim)', fontSize:12, fontFamily:'IM Fell English', fontStyle:'italic' }}>All competitors randomly seeded.</p>
        )}
        {(seedMode === 'manual' || seedMode === 'combo') && (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <p style={{ color:'var(--cream-dim)', fontSize:11, marginBottom:4 }}>
              {seedMode === 'manual' ? 'Click to set full seed order:' : 'Set top seeds — rest fill randomly:'}
            </p>
            {players.map(p => {
              const idx = manualOrder.findIndex(x => x?.id === p.id)
              const selected = idx >= 0
              return (
                <div key={p.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Avatar player={p} size={28} />
                  <span style={{ flex:1, color:'var(--cream)', fontSize:13, fontFamily:'Cinzel' }}>{p.name}</span>
                  <button onClick={() => toggleManual(p)}
                    style={{ padding:'3px 12px', borderRadius:6, border:`1px solid ${selected ? 'var(--gold)' : 'var(--border)'}`,
                      background: selected ? 'var(--gold)' : 'transparent',
                      color: selected ? 'var(--charcoal)' : 'var(--cream-dim)',
                      fontFamily:'Cinzel', fontSize:10, cursor:'pointer', fontWeight:700, minWidth:48 }}>
                    {selected ? `#${idx+1}` : 'Seed'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* ── Bye Slots ── */}
      <Section title={`Bye Slots  (${byeCount} added)`}>
        <p style={{ color:'var(--cream-dim)', fontSize:12, marginBottom:10 }}>
          Toggle which seed positions receive a bye. Bye players auto-advance; total slots round up to next power of 2.
        </p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
          {Array.from({ length: slotCount }, (_, i) => {
            const isBye = byeSlots.has(i)
            const player = !isBye ? (() => {
              // figure out which player would be in slot i given current seeding preview
              const nonByeSlots = Array.from({ length: slotCount }, (_, j) => j).filter(j => !byeSlots.has(j))
              const playerIdx = nonByeSlots.indexOf(i)
              return seedMode === 'manual' || seedMode === 'combo'
                ? manualOrder[playerIdx] || players[playerIdx] || null
                : players[playerIdx] || null
            })() : null

            return (
              <button key={i} onClick={() => toggleBye(i)}
                style={{ width:40, height:40, borderRadius:8,
                  border:`1.5px solid ${isBye ? '#ef4444' : 'var(--border)'}`,
                  background: isBye ? '#7f1d1d44' : 'var(--charcoal-3)',
                  color: isBye ? '#ef4444' : 'var(--cream-dim)',
                  fontSize:11, fontFamily:'Cinzel', cursor:'pointer',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:1 }}>
                <span style={{ fontSize:9, color: isBye ? '#ef4444' : 'var(--gold-dark)' }}>#{i+1}</span>
                <span style={{ fontSize:isBye ? 11 : 8 }}>{isBye ? 'BYE' : (player ? player.name.slice(0,3) : '?')}</span>
              </button>
            )
          })}
        </div>
      </Section>

      {/* ── Custom Round Names ── */}
      {format === 'single' && (
        <Section title="Custom Round Names  (optional)">
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {roundNamesArr.map((name, i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:10, width:60, flexShrink:0 }}>Round {i+1}</span>
                <input
                  value={roundNames[i] || ''}
                  onChange={e => updateRoundName(i, e.target.value)}
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
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ background:'var(--charcoal-2)', borderRadius:12, padding:16, marginBottom:14, border:'1px solid var(--border)' }}>
      <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase', marginBottom:12 }}>{title}</p>
      {children}
    </div>
  )
}

// ─── Match Card ───────────────────────────────────────────────────────────────
function MatchCard({ bracketMatch, dbMatch, players, onClick }) {
  const getPlayer = id => players.find(p => p.id === id)
  const p1 = bracketMatch?.p1 || (dbMatch?.player1_id ? getPlayer(dbMatch.player1_id) : null)
  const p2 = bracketMatch?.p2 || (dbMatch?.player2_id ? getPlayer(dbMatch.player2_id) : null)
  const s1 = dbMatch?.total_net1 || 0
  const s2 = dbMatch?.total_net2 || 0
  const winnerId = dbMatch?.winner_id
  const isComplete = dbMatch?.status === 'complete'
  const isBye = bracketMatch?.isBye || (!p1 && !p2)

  if (isBye && !p1 && !p2) return (
    <div style={{ background:'var(--charcoal-3)', borderRadius:8, padding:'6px 10px', marginBottom:5, opacity:0.3, border:'1px dashed var(--border)', fontSize:11, color:'var(--cream-dim)', textAlign:'center', fontFamily:'Cinzel' }}>— BYE —</div>
  )

  return (
    <div onClick={() => dbMatch && onClick(dbMatch)}
      style={{ background:'var(--charcoal-2)', borderRadius:10, padding:'8px 10px',
        border:`1.5px solid ${isComplete ? 'var(--gold-dark)' : 'var(--border)'}`,
        cursor: dbMatch ? 'pointer' : 'default', marginBottom:6, transition:'border-color 0.15s' }}
      onMouseEnter={e => dbMatch && (e.currentTarget.style.borderColor='var(--gold)')}
      onMouseLeave={e => e.currentTarget.style.borderColor = isComplete ? 'var(--gold-dark)' : 'var(--border)'}>
      {[{ p: p1, s: s1, win: winnerId && winnerId === p1?.id },
        { p: p2, s: s2, win: winnerId && winnerId === p2?.id }].map(({ p, s, win }, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'2px 0' }}>
          <Avatar player={p} size={20} />
          <span style={{ flex:1, color: win ? 'var(--gold)' : p ? 'var(--cream)' : 'var(--charcoal-4)',
            fontSize:11, fontFamily: win ? 'Cinzel' : 'Oswald', fontWeight: win ? 700 : 400,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {p ? (p.nickname ? `"${p.nickname}"` : p.name) : (bracketMatch?.isBye ? 'BYE' : 'TBD')}
          </span>
          <span style={{ color: win ? 'var(--gold)' : 'var(--cream-dim)', fontWeight: win ? 700 : 400, fontSize:12, fontFamily:'Cinzel', flexShrink:0 }}>{s}</span>
        </div>
      ))}
      {isComplete && <div style={{ fontSize:8, color:'var(--gold-dark)', fontFamily:'Cinzel', letterSpacing:2, marginTop:2, textAlign:'right' }}>FINAL</div>}
    </div>
  )
}

// ─── Bracket Viewer ───────────────────────────────────────────────────────────
function BracketViewer({ structure, matches, players, isCommissioner, onEdit, onReset, setActiveMatch, setTab }) {
  const getPlayer = id => players.find(p => p.id === id)

  const openMatch = (dbMatch) => {
    setActiveMatch({ matchId: dbMatch.id })
    setTab('Scoreboard')
  }

  // Fallback: match by both new section fields and legacy round_index
  const getDbMatch = (section, sectionIndex, matchIndex) =>
    matches.find(m =>
      m.match_index === matchIndex && (
        (m.bracket_section === section && (m.section_round_index ?? m.round_index) === sectionIndex) ||
        (!m.bracket_section && section === 'winners' && m.round_index === sectionIndex)
      )
    )

  // ── Edit: rename a round ──
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

  // Defensive: normalise whatever shape arrived
  const isSingle = !structure.type || structure.type === 'single'
  const rounds    = isSingle ? (structure.rounds  ?? []) : null
  const winners   = !isSingle ? (structure.winners ?? []) : null
  const losers    = !isSingle ? (structure.losers  ?? []) : null
  const grandFinal = !isSingle
    ? (structure.grandFinal ?? { matches: [], name: 'Grand Final', type: 'grand_final' })
    : null

  // Guard: empty bracket
  if (isSingle && rounds.length === 0) return (
    <div style={{ padding:40, textAlign:'center' }}>
      <p style={{ color:'var(--cream-dim)', fontFamily:'IM Fell English', fontStyle:'italic', fontSize:14 }}>
        Bracket structure is empty or unreadable. Reset and regenerate.
      </p>
      {isCommissioner && (
        <button onClick={onReset} style={{ marginTop:16, padding:'8px 20px', borderRadius:8,
          border:'1px solid var(--red-accent)', background:'none', color:'var(--red-accent)',
          cursor:'pointer', fontFamily:'Cinzel', fontSize:12 }}>Reset Bracket</button>
      )}
    </div>
  )

  // Champion
  const getChampion = () => {
    if (isSingle) {
      const finalMatch = getDbMatch('winners', rounds.length - 1, 0)
      return finalMatch?.winner_id ? getPlayer(finalMatch.winner_id) : null
    } else {
      const gfMatch = getDbMatch('grand_final', 0, 0)
      return gfMatch?.winner_id ? getPlayer(gfMatch.winner_id) : null
    }
  }
  const champ = getChampion()

  const renderRoundColumn = (round, ri, section) => {
    if (!round) return null
    const safeMatches = round.matches ?? []
    const totalInSection = section === 'winners' ? (rounds || winners || []).length
      : section === 'losers' ? (losers || []).length : 1
    const defaultName = section === 'grand_final' ? 'Grand Final'
      : getDefaultRoundName(ri, totalInSection, section)
    const displayName = round.name || defaultName

    return (
      <div key={`${section}-${ri}`} style={{ flex:1, minWidth:168, display:'flex', flexDirection:'column' }}>
        <RoundHeader
          name={displayName}
          section={section}
          isCommissioner={isCommissioner}
          onRename={name => renameRound(section, ri, name)} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'space-around',
          padding:'10px 5px', borderRight:'1px solid var(--border)' }}>
          {safeMatches.map((bm, mi) => (
            <MatchCard key={bm?.id || mi} bracketMatch={bm ?? {}}
              dbMatch={getDbMatch(section, ri, mi)}
              players={players} onClick={openMatch} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding:'14px 10px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:4, textTransform:'uppercase', margin:0 }}>
            Season 6 · {isSingle ? 'Single' : 'Double'} Elimination
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {isCommissioner && (
            <button onClick={onReset}
              style={{ padding:'5px 12px', borderRadius:7, border:'1px solid var(--red-accent)', background:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:11, fontFamily:'Cinzel' }}>
              Reset
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowX:'auto', paddingBottom:16 }}>
        {/* Single elim */}
        {isSingle && (
          <div style={{ display:'flex', gap:0, minWidth: rounds.length * 173 + 140 }}>
            {rounds.map((r, ri) => renderRoundColumn(r, ri, 'winners'))}
            <ChampionColumn champ={champ} />
          </div>
        )}

        {/* Double elim */}
        {!isSingle && (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {/* Winners */}
            <div style={{ marginBottom:4 }}>
              <div style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:9, letterSpacing:4, textTransform:'uppercase', padding:'6px 8px', background:'var(--charcoal-3)', borderRadius:'8px 8px 0 0', borderBottom:'1px solid var(--border)' }}>
                Winners Bracket
              </div>
              <div style={{ display:'flex', gap:0, overflowX:'auto' }}>
                {winners.map((r, ri) => renderRoundColumn(r, ri, 'winners'))}
              </div>
            </div>
            {/* Losers */}
            <div style={{ marginBottom:4 }}>
              <div style={{ fontFamily:'Cinzel', color:'#ef4444', fontSize:9, letterSpacing:4, textTransform:'uppercase', padding:'6px 8px', background:'var(--charcoal-3)', borderBottom:'1px solid var(--border)' }}>
                Losers Bracket
              </div>
              <div style={{ display:'flex', gap:0, overflowX:'auto' }}>
                {losers.map((r, ri) => renderRoundColumn(r, ri, 'losers'))}
              </div>
            </div>
            {/* Grand Final */}
            <div>
              <div style={{ display:'flex', gap:0 }}>
                {renderRoundColumn(grandFinal, 0, 'grand_final')}
                <ChampionColumn champ={champ} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Round header with inline rename ─────────────────────────────────────────
function RoundHeader({ name, section, isCommissioner, onRename }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(name)

  const save = () => { onRename(val); setEditing(false) }

  const borderColor = section === 'losers' ? '#ef444433' : section === 'grand_final' ? 'var(--gold-dark)' : 'var(--border)'
  const textColor = section === 'losers' ? '#ef4444' : section === 'grand_final' ? 'var(--gold)' : 'var(--gold)'

  return (
    <div style={{ textAlign:'center', padding:'7px 4px', background:'var(--charcoal-2)',
      borderBottom:`1px solid ${borderColor}`, borderRight:'1px solid var(--border)', minHeight:32,
      display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
      {editing ? (
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onBlur={save} onKeyDown={e => e.key === 'Enter' && save()}
          style={{ background:'transparent', border:'none', borderBottom:'1px solid var(--gold)',
            color: textColor, fontFamily:'Cinzel', fontSize:9, letterSpacing:2, textAlign:'center',
            outline:'none', width:'90%' }} />
      ) : (
        <>
          <span style={{ fontFamily:'Cinzel', color: textColor, fontSize:9, letterSpacing:2, textTransform:'uppercase' }}>{name}</span>
          {isCommissioner && (
            <button onClick={() => { setVal(name); setEditing(true) }}
              style={{ background:'none', border:'none', color:'var(--gold-dark)', cursor:'pointer', fontSize:10, padding:'0 2px', lineHeight:1, opacity:0.5 }}>✎</button>
          )}
        </>
      )}
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
              <p style={{ color:'var(--gold)', fontFamily:'Cinzel', fontWeight:700, fontSize:11, marginTop:7, margin:'7px 0 2px' }}>{champ.name}</p>
              <p style={{ color:'var(--gold-dark)', fontSize:9, fontFamily:'IM Fell English', fontStyle:'italic', margin:0 }}>Season 6 Champion</p>
            </div>
          : <p style={{ color:'var(--charcoal-4)', fontSize:11, textAlign:'center', fontFamily:'IM Fell English', fontStyle:'italic' }}>To be decided</p>}
      </div>
    </div>
  )
}

// ─── Main BracketTab export ───────────────────────────────────────────────────
export function BracketTab({ players, tournament, matches, isCommissioner, setActiveMatch, setTab }) {
  const structure = tournament?.bracket
  const locked = !!structure

  const handleGenerate = async (structure) => {
    // Clear existing matches
    await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // Upsert tournament
    await supabase.from('tournament').upsert({
      id: 'season6', bracket: structure, status: 'active', updated_at: new Date().toISOString()
    })

    // Insert match rows for every non-empty slot
    const insertMatch = async (round, ri, mi, section) => {
      const promises = round.matches.map((m, mi2) => {
        if (m.isBye || (!m.p1 && !m.p2 && !m.id)) return Promise.resolve()
        return supabase.from('matches').insert({
          round_index: ri, match_index: mi2,
          bracket_section: section,
          section_round_index: ri,
          player1_id: m.p1?.id || null,
          player2_id: m.p2?.id || null,
          rounds: [], total_net1: 0, total_net2: 0, status: 'pending',
        })
      })
      await Promise.all(promises)
    }

    if (structure.type === 'single') {
      for (let ri = 0; ri < structure.rounds.length; ri++) {
        await insertMatch(structure.rounds[ri], ri, 0, 'winners')
      }
    } else {
      for (let ri = 0; ri < structure.winners.length; ri++) await insertMatch(structure.winners[ri], ri, 0, 'winners')
      for (let ri = 0; ri < structure.losers.length; ri++) await insertMatch(structure.losers[ri], ri, 0, 'losers')
      await insertMatch(structure.grandFinal, 0, 0, 'grand_final')
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Reset entire bracket? This cannot be undone.')) return
    await supabase.from('matches').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('tournament').upsert({ id: 'season6', bracket: null, status: 'setup', updated_at: new Date().toISOString() })
  }

  if (!locked) {
    if (!isCommissioner) return (
      <div style={{ padding:'32px 20px', textAlign:'center' }}>
        <p style={{ color:'var(--cream-dim)', fontFamily:'IM Fell English', fontStyle:'italic', fontSize:15 }}>
          🔒 Commissioner access required to build the bracket.
        </p>
      </div>
    )
    return <BracketBuilder players={players} onGenerate={handleGenerate} />
  }

  return (
    <BracketViewer
      structure={structure}
      matches={matches}
      players={players}
      isCommissioner={isCommissioner}
      onReset={handleReset}
      setActiveMatch={setActiveMatch}
      setTab={setTab}
    />
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const styles = {
  sectionLabel: { fontFamily:'Cinzel', color:'var(--gold)', fontSize:13, letterSpacing:5, textTransform:'uppercase', marginBottom:4, margin:0 },
  warning: { background:'var(--charcoal-2)', borderRadius:10, padding:14, color:'#f59e0b', marginBottom:16, border:'1px solid #f59e0b44', fontSize:13 },
  segBtn: (active) => ({
    flex:1, padding:'9px 0', borderRadius:8, border:`1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
    background: active ? 'var(--gold)' : 'transparent',
    color: active ? 'var(--charcoal)' : 'var(--cream-dim)',
    fontFamily:'Cinzel', fontWeight:700, fontSize:11, letterSpacing:1, cursor:'pointer', textTransform:'uppercase'
  }),
}
