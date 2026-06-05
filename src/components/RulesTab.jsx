import { useState } from 'react'

const DEFAULT_OFFICIAL = [
  'Each player throws 4 washers per round.',
  'Player 1 throws all 4 washers, then Player 2 throws all 4 washers.',
  'A washer landing in the BOX scores 1 point.',
  'A washer landing in the CUP scores 3 points.',
  'Scoring is cancellation-based: only the net difference is recorded after both players throw.',
  'Example: P1 scores 4pts, P2 scores 3pts → P1 earns 1 net point for the round.',
  'If both players score equally, no points are awarded for the round.',
  'The player with the most total net points at the end of the match wins.',
  'In the event of a tie, a sudden-death tiebreaker round is played.',
  'Washers must be tossed underhanded from behind the designated throw line.',
  'A washer that bounces off a solid surface and lands in the box or cup does NOT count.',
  'No leaning over the board while the opposing player is throwing.',
  'The Brotherhood Code: respect your opponent, honor the game.',
]

const DEFAULT_SCORING = [
  { id: '1', label: 'Washer in BOX', points: 1, color: '#c8a84b', emoji: '⬜' },
  { id: '2', label: 'Washer in CUP', points: 3, color: '#e2c97e', emoji: '🔵' },
]

export function RulesTab({ isCommissioner }) {
  const [official, setOfficial] = useState(DEFAULT_OFFICIAL.map((t, i) => ({ id: String(i), text: t })))
  const [scoring] = useState(DEFAULT_SCORING)
  const [newRule, setNewRule] = useState('')

  const addRule = () => {
    if (!newRule.trim()) return
    setOfficial(r => [...r, { id: Date.now().toString(), text: newRule.trim() }])
    setNewRule('')
  }
  const removeRule = id => setOfficial(r => r.filter(x => x.id !== id))
  const updateRule = (id, text) => setOfficial(r => r.map(x => x.id === id ? { ...x, text } : x))

  return (
    <div style={{ padding:'24px 20px', maxWidth:660, margin:'0 auto' }}>

      {/* Scoring rules */}
      <div style={{ marginBottom:32 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <div style={{ height:1, flex:1, background:'var(--border)' }} />
          <h3 style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:4, textTransform:'uppercase', whiteSpace:'nowrap' }}>Scoring Rules</h3>
          <div style={{ height:1, flex:1, background:'var(--border)' }} />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          {scoring.map(s => (
            <div key={s.id} style={{ background:'var(--charcoal-2)', borderRadius:12, padding:'16px 18px',
              border:`1px solid ${s.color}44`, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:28 }}>{s.emoji}</span>
              <div>
                <p style={{ color: s.color, fontFamily:'Cinzel', fontWeight:600, fontSize:13, margin:0 }}>{s.label}</p>
                <p style={{ color:'var(--cream)', fontSize:22, fontWeight:700, margin:0, fontFamily:'Cinzel Decorative' }}>
                  {s.points > 0 ? `+${s.points}` : s.points} <span style={{ fontSize:13, color:'var(--cream-dim)' }}>pts</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ background:'var(--charcoal-2)', borderRadius:12, padding:16, border:'1px solid var(--border)' }}>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase', marginBottom:8 }}>Cancellation Rule</p>
          <p style={{ color:'var(--cream-dim)', fontSize:13, lineHeight:1.6 }}>
            After both players throw, only the <strong style={{ color:'var(--cream)' }}>net difference</strong> counts.
            Equal scores cancel out. The higher scorer earns the difference.
            Scores are locked in after confirmation — editable by Commissioner only.
          </p>
        </div>
      </div>

      {/* Official rules */}
      <div>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
          <div style={{ height:1, flex:1, background:'var(--border)' }} />
          <h3 style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:4, textTransform:'uppercase', whiteSpace:'nowrap' }}>Official Rules</h3>
          <div style={{ height:1, flex:1, background:'var(--border)' }} />
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
          {official.map((r, i) => (
            <div key={r.id} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:11, width:22, paddingTop:9, flexShrink:0, textAlign:'right' }}>{i+1}.</span>
              {isCommissioner
                ? <textarea value={r.text} onChange={e => updateRule(r.id, e.target.value)}
                    style={{ flex:1, padding:'7px 11px', borderRadius:8, border:'1px solid var(--border)',
                      background:'var(--charcoal-2)', color:'var(--cream)', fontSize:13, resize:'vertical',
                      minHeight:36, outline:'none', fontFamily:'Oswald', lineHeight:1.5 }} />
                : <p style={{ flex:1, color:'var(--cream-dim)', fontSize:13, padding:'7px 0', lineHeight:1.6, margin:0 }}>{r.text}</p>}
              {isCommissioner && (
                <button onClick={() => removeRule(r.id)}
                  style={{ background:'none', border:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:16, paddingTop:8 }}>×</button>
              )}
            </div>
          ))}
        </div>

        {isCommissioner && (
          <div style={{ display:'flex', gap:8 }}>
            <input value={newRule} onChange={e => setNewRule(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addRule()}
              placeholder="Add a rule…"
              style={{ flex:1, padding:'9px 13px', borderRadius:8, border:'1px solid var(--border-bright)',
                background:'var(--charcoal-2)', color:'var(--cream)', fontSize:13, outline:'none', fontFamily:'Oswald' }} />
            <button onClick={addRule}
              style={{ padding:'9px 18px', borderRadius:8, border:'1px solid var(--gold)',
                background:'transparent', color:'var(--gold)', fontFamily:'Cinzel', fontWeight:700,
                fontSize:12, letterSpacing:1, cursor:'pointer' }}>+ ADD</button>
          </div>
        )}
      </div>
    </div>
  )
}
