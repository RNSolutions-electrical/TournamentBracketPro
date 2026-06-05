import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useRealtime } from './hooks/useRealtime'
import { WBLogo } from './components/WBLogo'
import { PinModal } from './components/PinModal'
import { PlayersTab } from './components/PlayersTab'
import { RulesTab } from './components/RulesTab'
import { BracketTab } from './components/BracketTab'
import { ScoreboardTab } from './components/ScoreboardTab'
import { ExportTab } from './components/ExportTab'

const TABS = ['Players', 'Rules', 'Bracket', 'Scoreboard', 'Export']

export default function App() {
  const [tab, setTab] = useState('Bracket')
  const [players, setPlayers] = useState([])
  const [tournament, setTournament] = useState(null)
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [isCommissioner, setIsCommissioner] = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [activeMatch, setActiveMatch] = useState(null)
  const [connError, setConnError] = useState(false)

  // Initial load
  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: pData, error: pErr }, { data: tData }, { data: mData }] = await Promise.all([
          supabase.from('players').select('*').order('created_at'),
          supabase.from('tournament').select('*').eq('id', 'season6').single(),
          supabase.from('matches').select('*').order('round_index').order('match_index'),
        ])
        if (pErr?.message?.includes('placeholder') || pErr?.code === 'PGRST301') {
          setConnError(true)
        } else {
          if (pData) setPlayers(pData)
          if (tData) setTournament(tData)
          if (mData) setMatches(mData)
        }
      } catch (e) {
        setConnError(true)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Realtime subscriptions
  useRealtime('players', ({ eventType, new: newRow, old }) => {
    setPlayers(prev => {
      if (eventType === 'INSERT') return [...prev, newRow]
      if (eventType === 'UPDATE') return prev.map(p => p.id === newRow.id ? newRow : p)
      if (eventType === 'DELETE') return prev.filter(p => p.id !== old.id)
      return prev
    })
  })

  useRealtime('tournament', ({ new: newRow }) => {
    if (newRow?.id === 'season6') setTournament(newRow)
  })

  useRealtime('matches', ({ eventType, new: newRow, old }) => {
    setMatches(prev => {
      if (eventType === 'INSERT') return [...prev, newRow].sort((a,b) => a.round_index-b.round_index || a.match_index-b.match_index)
      if (eventType === 'UPDATE') return prev.map(m => m.id === newRow.id ? newRow : m)
      if (eventType === 'DELETE') return prev.filter(m => m.id !== old.id)
      return prev
    })
  })

  if (loading) return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--charcoal)', flexDirection:'column', gap:20 }}>
      <WBLogo size={80} />
      <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:4, animation:'pulse 1.5s infinite' }}>LOADING…</p>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:'var(--charcoal)', display:'flex', flexDirection:'column' }}>
      {showPin && <PinModal onSuccess={() => { setIsCommissioner(true); setShowPin(false) }} onCancel={() => setShowPin(false)} />}

      {/* Connection error banner */}
      {connError && (
        <div style={{ background:'#7f1d1d', padding:'10px 16px', fontSize:12, color:'#fca5a5', textAlign:'center', fontFamily:'Cinzel', letterSpacing:1 }}>
          ⚠ Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file. Running in preview mode.
        </div>
      )}

      {/* Header */}
      <header style={{ background:'linear-gradient(180deg,#0d0d10,#1a1a1f)', borderBottom:'1px solid var(--border)', padding:'14px 16px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, maxWidth:720, margin:'0 auto' }}>
          <WBLogo size={54} />
          <div style={{ flex:1 }}>
            <h1 style={{ fontFamily:'Cinzel Decorative', color:'var(--gold)', fontSize:15, letterSpacing:1, margin:0, lineHeight:1.2 }}>
              WasherBox Brotherhood
            </h1>
            <p style={{ fontFamily:'Cinzel', color:'var(--gold-dark)', fontSize:9, letterSpacing:3, textTransform:'uppercase', margin:'3px 0 0' }}>
              Intl. Statewide World Championships · Season VI
            </p>
            <p style={{ fontFamily:'IM Fell English', color:'var(--cream-dim)', fontSize:11, fontStyle:'italic', margin:'2px 0 0' }}>
              To each their own, with love and happiness
            </p>
          </div>
          <button onClick={() => isCommissioner ? setIsCommissioner(false) : setShowPin(true)}
            style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${isCommissioner ? 'var(--gold)' : 'var(--border)'}`,
              background: isCommissioner ? 'var(--gold)' : 'transparent',
              color: isCommissioner ? 'var(--charcoal)' : 'var(--cream-dim)',
              fontFamily:'Cinzel', fontSize:10, letterSpacing:2, cursor:'pointer', textTransform:'uppercase', flexShrink:0 }}>
            {isCommissioner ? '🔓 Commish' : '🔒 Lock'}
          </button>
        </div>

        {/* Live indicator */}
        {!connError && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:10 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', animation:'livepulse 2s infinite' }} />
            <span style={{ fontFamily:'Cinzel', color:'#10b981', fontSize:9, letterSpacing:3, textTransform:'uppercase' }}>Live</span>
            <style>{`@keyframes livepulse{0%,100%{opacity:1;box-shadow:0 0 0 0 #10b98166}50%{opacity:0.7;box-shadow:0 0 0 5px #10b98100}}`}</style>
          </div>
        )}
      </header>

      {/* Nav */}
      <nav style={{ background:'var(--charcoal-2)', borderBottom:'1px solid var(--border)', overflowX:'auto', display:'flex', flexShrink:0 }}>
        <div style={{ display:'flex', maxWidth:720, margin:'0 auto', width:'100%' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:'11px 4px', border:'none', background:'none', cursor:'pointer',
                fontFamily:'Cinzel', fontSize:10, letterSpacing:2, textTransform:'uppercase', whiteSpace:'nowrap',
                color: tab===t ? 'var(--gold)' : 'var(--cream-dim)',
                borderBottom: tab===t ? '2px solid var(--gold)' : '2px solid transparent',
                transition:'all 0.15s' }}>
              {t}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main style={{ flex:1, overflowY:'auto', maxWidth:720, width:'100%', margin:'0 auto' }}>
        {tab === 'Players' && <PlayersTab players={players} isCommissioner={isCommissioner} />}
        {tab === 'Rules' && <RulesTab isCommissioner={isCommissioner} />}
        {tab === 'Bracket' && (
          <BracketTab players={players} tournament={tournament} matches={matches}
            isCommissioner={isCommissioner} setActiveMatch={setActiveMatch} setTab={setTab} />
        )}
        {tab === 'Scoreboard' && (
          <ScoreboardTab matches={matches} players={players} tournament={tournament}
            isCommissioner={isCommissioner} activeMatch={activeMatch} setActiveMatch={setActiveMatch} />
        )}
        {tab === 'Export' && <ExportTab matches={matches} players={players} tournament={tournament} />}
      </main>

      {/* Footer */}
      <footer style={{ borderTop:'1px solid var(--border)', padding:'10px 16px', textAlign:'center' }}>
        <p style={{ fontFamily:'Cinzel', color:'var(--charcoal-4)', fontSize:9, letterSpacing:3, textTransform:'uppercase', margin:0 }}>
          WasherBox Brotherhood © Season VI
        </p>
      </footer>
    </div>
  )
}
