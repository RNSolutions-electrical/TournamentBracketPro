import { useState } from 'react'
import { COMMISSIONER_PIN } from '../lib/game'

export function PinModal({ onSuccess, onCancel }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)
  const [err, setErr] = useState(false)

  const handleDigit = (d) => {
    if (pin.length >= 4) return
    const next = pin + d
    setPin(next)
    if (next.length === 4) {
      if (next === COMMISSIONER_PIN) {
        onSuccess()
      } else {
        setShake(true)
        setErr(true)
        setTimeout(() => { setShake(false); setPin(''); setErr(false) }, 700)
      }
    }
  }

  const del = () => setPin(p => p.slice(0, -1))

  const KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)' }}>
      <div style={{ background:'var(--charcoal-2)', border:'1px solid var(--border-bright)', borderRadius:16, padding:'32px 28px', maxWidth:320, width:'100%', textAlign:'center',
        animation: shake ? 'shake 0.4s ease' : 'none' }}>
        <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
        <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:4, marginBottom:8, textTransform:'uppercase' }}>Commissioner Access</p>
        <h2 style={{ fontFamily:'Cinzel Decorative', color:'var(--cream)', fontSize:18, marginBottom:24 }}>Enter PIN</h2>

        {/* Dots */}
        <div style={{ display:'flex', justifyContent:'center', gap:14, marginBottom:28 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ width:14, height:14, borderRadius:'50%', border:`2px solid ${err ? '#ef4444' : 'var(--gold)'}`,
              background: i < pin.length ? (err ? '#ef4444' : 'var(--gold)') : 'transparent',
              transition:'all 0.15s' }} />
          ))}
        </div>

        {/* Keypad */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
          {KEYS.map((k, i) => (
            <button key={i} onClick={() => k === '⌫' ? del() : k ? handleDigit(k) : null}
              disabled={!k}
              style={{ padding:'14px 0', borderRadius:10, border:`1px solid ${k ? 'var(--border-bright)' : 'transparent'}`,
                background: k ? 'var(--charcoal-3)' : 'transparent',
                color: k === '⌫' ? '#ef4444' : 'var(--cream)',
                fontSize: k === '⌫' ? 18 : 22, fontFamily:'Cinzel', fontWeight:600,
                cursor: k ? 'pointer' : 'default',
                transition:'background 0.1s' }} >
              {k}
            </button>
          ))}
        </div>

        <button onClick={onCancel} style={{ background:'none', border:'none', color:'var(--cream-dim)', fontSize:13, cursor:'pointer', fontFamily:'Oswald', letterSpacing:1 }}>
          CANCEL
        </button>
      </div>
    </div>
  )
}
