import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'
import { COLORS } from '../lib/game'

export function PlayersTab({ players, isCommissioner }) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  const handleFile = e => {
    const f = e.target.files[0]
    if (!f) return
    setImageFile(f)
    const r = new FileReader()
    r.onload = ev => setImagePreview(ev.target.result)
    r.readAsDataURL(f)
  }

  const addPlayer = async () => {
    if (!name.trim()) return
    setSaving(true)
    let image_url = imagePreview // store as base64 for simplicity (Supabase Storage optional upgrade)
    const colorIdx = players.length % COLORS.length
    await supabase.from('players').insert({
      name: name.trim(),
      nickname: nickname.trim() || null,
      image_url,
      color: COLORS[colorIdx],
    })
    setName(''); setNickname(''); setImagePreview(null); setImageFile(null)
    if (fileRef.current) fileRef.current.value = ''
    setSaving(false)
  }

  const removePlayer = async (id) => {
    await supabase.from('players').delete().eq('id', id)
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 580, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:13, letterSpacing:5, textTransform:'uppercase', marginBottom:4 }}>Season 6 Roster</h2>
        <p style={{ color:'var(--cream-dim)', fontSize:13 }}>
          {players.length} {players.length === 1 ? 'competitor' : 'competitors'} registered
        </p>
      </div>

      {isCommissioner && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:14, padding:20, marginBottom:24, border:'1px solid var(--border)' }}>
          <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:11, letterSpacing:3, marginBottom:16, textTransform:'uppercase' }}>Register Competitor</p>

          <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:14 }}>
            {/* Photo upload */}
            <div onClick={() => fileRef.current.click()}
              style={{ width:64, height:64, borderRadius:'50%', border:'2px dashed var(--gold-dark)',
                background:'var(--charcoal-3)', cursor:'pointer', overflow:'hidden', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
              {imagePreview
                ? <img src={imagePreview} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : <span style={{ color:'var(--gold-dark)', fontSize:24, fontWeight:300 }}>+</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />

            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
              <input value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPlayer()}
                placeholder="Full name"
                style={{ padding:'9px 13px', borderRadius:8, border:'1px solid var(--border-bright)',
                  background:'var(--charcoal-3)', color:'var(--cream)', fontSize:14, outline:'none',
                  fontFamily:'Oswald', letterSpacing:0.5 }} />
              <input value={nickname} onChange={e => setNickname(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addPlayer()}
                placeholder="Nickname / callsign (optional)"
                style={{ padding:'9px 13px', borderRadius:8, border:'1px solid var(--border)',
                  background:'var(--charcoal-3)', color:'var(--cream-dim)', fontSize:13, outline:'none', fontFamily:'Oswald' }} />
            </div>
          </div>

          <button onClick={addPlayer} disabled={saving || !name.trim()}
            style={{ width:'100%', padding:'11px 0', borderRadius:8, border:'1px solid var(--gold)',
              background: name.trim() ? 'var(--gold)' : 'transparent',
              color: name.trim() ? 'var(--charcoal)' : 'var(--gold-dark)',
              fontFamily:'Cinzel', fontWeight:700, fontSize:13, letterSpacing:2, cursor: name.trim() ? 'pointer' : 'not-allowed',
              textTransform:'uppercase', transition:'all 0.2s' }}>
            {saving ? 'Registering…' : 'Register'}
          </button>
        </div>
      )}

      {/* Player list */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {players.map((p, i) => (
          <div key={p.id} style={{ display:'flex', alignItems:'center', gap:14,
            background:'var(--charcoal-2)', borderRadius:12, padding:'12px 16px',
            border:'1px solid var(--border)' }}>
            <span style={{ color:'var(--gold-dark)', fontFamily:'Cinzel', fontSize:12, width:22, textAlign:'center' }}>{i+1}</span>
            <Avatar player={p} size={48} />
            <div style={{ flex:1 }}>
              <p style={{ color:'var(--cream)', fontWeight:600, fontSize:15, fontFamily:'Cinzel', margin:0 }}>{p.name}</p>
              {p.nickname && <p style={{ color:'var(--gold)', fontSize:12, margin:0, fontStyle:'italic', fontFamily:'IM Fell English' }}>"{p.nickname}"</p>}
            </div>
            {isCommissioner && (
              <button onClick={() => removePlayer(p.id)}
                style={{ background:'none', border:'none', color:'var(--red-accent)', cursor:'pointer', fontSize:20, padding:'0 4px', lineHeight:1 }}>×</button>
            )}
          </div>
        ))}
        {players.length === 0 && (
          <div style={{ textAlign:'center', padding:'40px 0', color:'var(--cream-dim)', fontSize:14 }}>
            <p style={{ fontFamily:'IM Fell English', fontSize:16, fontStyle:'italic', marginBottom:8 }}>No competitors yet.</p>
            <p style={{ fontSize:12, color:'var(--gold-dark)' }}>Commissioner must register players to begin.</p>
          </div>
        )}
      </div>
    </div>
  )
}
