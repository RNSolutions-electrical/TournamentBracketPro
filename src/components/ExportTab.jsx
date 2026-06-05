import { useState } from 'react'
import { Avatar } from './Avatar'
import { getDefaultRoundName } from '../lib/game'
const getRoundName = (ri, total) => getDefaultRoundName(ri, total, 'winners')

export function ExportTab({ matches, players, tournament }) {
  const [exporting, setExporting] = useState(false)
  const bracket = tournament?.bracket

  const getPlayer = id => players.find(p => p.id === id)

  const getPlacements = () => {
    if (!bracket || !matches.length) return []
    const final = matches.find(m => m.round_index === bracket.length - 1 && m.match_index === 0)
    if (!final?.winner_id) return []
    const champ = getPlayer(final.winner_id)
    const runner = getPlayer(final.player1_id === final.winner_id ? final.player2_id : final.player1_id)

    const semis = matches.filter(m => m.round_index === bracket.length - 2)
    const semifinalLosers = semis
      .map(m => m.winner_id ? getPlayer(m.player1_id === m.winner_id ? m.player2_id : m.player1_id) : null)
      .filter(Boolean)

    return [
      { place: 1, player: champ, label: '1st Place', subtitle: 'Season 6 Champion', medal: '🥇', accentColor: '#c8a84b', bgGrad: 'linear-gradient(135deg,#2a1f00,#1a1a1f)' },
      { place: 2, player: runner, label: '2nd Place', subtitle: 'Season 6 Runner-Up', medal: '🥈', accentColor: '#9ca3af', bgGrad: 'linear-gradient(135deg,#1a1a24,#1a1a1f)' },
      ...(semifinalLosers[0] ? [{ place: 3, player: semifinalLosers[0], label: '3rd Place', subtitle: 'Season 6 Semi-Finalist', medal: '🥉', accentColor: '#b45309', bgGrad: 'linear-gradient(135deg,#1a0f00,#1a1a1f)' }] : []),
      ...(semifinalLosers[1] ? [{ place: 4, player: semifinalLosers[1], label: '4th Place', subtitle: 'Season 6 Semi-Finalist', medal: '🏅', accentColor: '#6366f1', bgGrad: 'linear-gradient(135deg,#0f0a24,#1a1a1f)' }] : []),
    ]
  }

  const placements = getPlacements()

  const exportPDF = () => {
    setExporting(true)
    const w = window.open('', '_blank')
    w.document.write(buildPrintHTML(bracket, matches, players, placements))
    w.document.close()
    setTimeout(() => { w.print(); setExporting(false) }, 600)
  }

  return (
    <div style={{ padding:'24px 20px', maxWidth:580, margin:'0 auto' }}>
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:13, letterSpacing:5, textTransform:'uppercase', marginBottom:4 }}>Export</h2>
        <p style={{ color:'var(--cream-dim)', fontSize:13 }}>Bracket results & championship certificates</p>
      </div>

      {!bracket && (
        <div style={{ background:'var(--charcoal-2)', borderRadius:10, padding:14, color:'#f59e0b', border:'1px solid #f59e0b44', fontSize:13 }}>
          ⚠ Generate a bracket first.
        </div>
      )}

      {bracket && (
        <>
          {/* Standings */}
          <div style={{ background:'var(--charcoal-2)', borderRadius:14, padding:18, marginBottom:20, border:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <div style={{ height:1, flex:1, background:'var(--border)' }} />
              <p style={{ fontFamily:'Cinzel', color:'var(--gold)', fontSize:10, letterSpacing:3, textTransform:'uppercase', whiteSpace:'nowrap', margin:0 }}>Final Standings</p>
              <div style={{ height:1, flex:1, background:'var(--border)' }} />
            </div>
            {placements.length === 0 && (
              <p style={{ color:'var(--cream-dim)', fontSize:13, fontFamily:'IM Fell English', fontStyle:'italic' }}>Tournament not yet completed.</p>
            )}
            {placements.map(({ place, player, label, medal, accentColor }) => (
              <div key={place} style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
                <span style={{ fontSize:28, width:36 }}>{medal}</span>
                <Avatar player={player} size={44} ring />
                <div>
                  <p style={{ color:'var(--cream)', fontFamily:'Cinzel', fontWeight:700, fontSize:14, margin:0 }}>{player?.name || 'TBD'}</p>
                  <p style={{ color: accentColor, fontFamily:'IM Fell English', fontStyle:'italic', fontSize:12, margin:0 }}>{label}</p>
                </div>
              </div>
            ))}
          </div>

          <button onClick={exportPDF} disabled={exporting}
            style={{ width:'100%', padding:'14px 0', borderRadius:12, border:'1px solid var(--gold)',
              background: exporting ? 'var(--charcoal-3)' : 'var(--gold)',
              color: exporting ? 'var(--gold)' : 'var(--charcoal)',
              fontFamily:'Cinzel Decorative', fontWeight:700, fontSize:14, letterSpacing:1,
              cursor: exporting ? 'not-allowed' : 'pointer', transition:'all 0.2s' }}>
            {exporting ? 'Preparing…' : '📜 Export Bracket + Certificates'}
          </button>
          <p style={{ color:'var(--cream-dim)', fontSize:11, textAlign:'center', marginTop:8, fontFamily:'IM Fell English', fontStyle:'italic' }}>
            Opens a print window — save as PDF from there
          </p>
        </>
      )}
    </div>
  )
}

function buildPrintHTML(bracket, matches, players, placements) {
  const getPlayer = id => players.find(p => p.id === id)

  const bracketHtml = bracket ? bracket.map((round, ri) => {
    const roundName = getRoundName(ri, bracket.length)
    const matchesHtml = round.map((bm, mi) => {
      const dbm = matches.find(m => m.round_index === ri && m.match_index === mi)
      const p1 = getPlayer(dbm?.player1_id) || bm.p1
      const p2 = getPlayer(dbm?.player2_id) || bm.p2
      const s1 = dbm?.total_net1 || 0
      const s2 = dbm?.total_net2 || 0
      const winnerId = dbm?.winner_id
      return `<div style="border:1px solid #c8a84b55;border-radius:8px;padding:10px 12px;margin-bottom:8px;background:#222228;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="color:${winnerId===p1?.id?'#c8a84b':'#e8e0cc'};font-weight:${winnerId===p1?.id?700:400}">${p1?.name||'TBD'}</span>
          <strong style="color:${winnerId===p1?.id?'#c8a84b':'#e8e0cc'}">${s1}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:${winnerId===p2?.id?'#c8a84b':'#e8e0cc'};font-weight:${winnerId===p2?.id?700:400}">${p2?.name||'BYE'}</span>
          <strong style="color:${winnerId===p2?.id?'#c8a84b':'#e8e0cc'}">${s2}</strong>
        </div>
        ${winnerId ? `<div style="font-size:10px;color:#8a6f28;margin-top:4px;letter-spacing:2px;font-family:'Cinzel'">WINNER: ${getPlayer(winnerId)?.name||''}</div>` : ''}
      </div>`
    }).join('')
    return `<div style="flex:1;min-width:150px;padding:0 6px">
      <h4 style="text-align:center;color:#c8a84b;font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-bottom:10px">${roundName}</h4>
      ${matchesHtml}
    </div>`
  }).join('') : ''

  const certPages = placements.map(({ place, player, label, subtitle, medal, accentColor }) => {
    const imageHtml = player?.image_url
      ? `<div style="width:90px;height:90px;border-radius:50%;overflow:hidden;border:4px solid ${accentColor};margin:0 auto 16px;box-shadow:0 0 24px ${accentColor}55">
           <img src="${player.image_url}" style="width:100%;height:100%;object-fit:cover"/>
         </div>`
      : `<div style="width:90px;height:90px;border-radius:50%;background:${accentColor};display:flex;align-items:center;justify-content:center;margin:0 auto 16px;border:4px solid ${accentColor};font-size:36px;font-family:'Cinzel',serif;color:#1a1a1f;font-weight:700">${player?.name?.[0]||'?'}</div>`

    return `<div style="page-break-before:always;min-height:100vh;background:linear-gradient(160deg,#1a1200,#1a1a1f,#0a0a14);display:flex;align-items:center;justify-content:center;padding:40px">
      <div style="text-align:center;max-width:600px;width:100%;position:relative">
        <!-- Outer decorative border -->
        <div style="border:3px solid ${accentColor};border-radius:4px;padding:60px 70px;position:relative;background:rgba(0,0,0,0.4)">
          <div style="border:1px solid ${accentColor}55;border-radius:2px;padding:40px 50px">

            <!-- Washer rings decoration -->
            <div style="font-size:11px;letter-spacing:6px;color:${accentColor}88;font-family:'Cinzel',serif;text-transform:uppercase;margin-bottom:24px">
              Washer Box Brotherhood
            </div>

            <div style="width:60px;height:1px;background:${accentColor};margin:0 auto 8px"></div>
            <div style="font-size:9px;letter-spacing:5px;color:${accentColor}66;font-family:'Cinzel',serif;margin-bottom:28px">
              INTERNATIONAL STATEWIDE WORLD CHAMPIONSHIPS
            </div>

            <!-- Medal -->
            <div style="font-size:56px;margin-bottom:16px">${medal}</div>

            <!-- Player photo -->
            ${imageHtml}

            <!-- Certificate text -->
            <div style="font-size:11px;letter-spacing:4px;color:#b8b09c;font-family:'Cinzel',serif;margin-bottom:12px;text-transform:uppercase">
              Certificate of Achievement
            </div>

            <div style="font-size:13px;color:#b8b09c;font-family:'Cinzel',serif;margin-bottom:8px">
              This certificate is proudly awarded to
            </div>

            <div style="font-size:38px;font-weight:900;color:${accentColor};font-family:'Cinzel Decorative',serif;letter-spacing:2px;margin-bottom:6px;text-shadow:0 0 20px ${accentColor}44">
              ${player?.name||'TBD'}
            </div>

            ${player?.nickname ? `<div style="font-size:16px;color:#b8b09c;font-family:'IM Fell English',serif;font-style:italic;margin-bottom:16px">"${player.nickname}"</div>` : '<div style="margin-bottom:16px"></div>'}

            <div style="width:80px;height:2px;background:${accentColor};margin:0 auto 16px"></div>

            <div style="font-size:22px;font-weight:700;color:${accentColor};font-family:'Cinzel',serif;letter-spacing:3px;margin-bottom:6px;text-transform:uppercase">
              ${label}
            </div>
            <div style="font-size:13px;color:#8a8070;font-family:'Cinzel',serif;letter-spacing:2px;margin-bottom:24px">
              ${subtitle} · Season VI · ${new Date().getFullYear()}
            </div>

            <div style="font-size:10px;color:#555;font-family:'Cinzel',serif;letter-spacing:3px;border-top:1px solid ${accentColor}33;padding-top:16px">
              TO EACH THEIR OWN · WITH LOVE AND HAPPINESS
            </div>
          </div>
        </div>
      </div>
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>WBB Season 6 Export</title>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#1a1a1f;color:#e8e0cc;font-family:'Cinzel',serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    @media print{.no-print{display:none}}
  </style>
</head>
<body>
  <!-- Bracket page -->
  <div style="padding:40px;page-break-after:always">
    <div style="text-align:center;margin-bottom:8px">
      <h1 style="font-family:'Cinzel Decorative',serif;color:#c8a84b;font-size:22px;letter-spacing:2px">WasherBox Brotherhood</h1>
      <p style="font-size:10px;letter-spacing:4px;color:#8a6f28;text-transform:uppercase">International Statewide World Championships · Season VI</p>
    </div>
    <div style="width:80px;height:1px;background:#c8a84b;margin:12px auto 28px"></div>
    <div style="display:flex;gap:8px;align-items:flex-start;overflow:hidden">${bracketHtml}</div>
  </div>
  ${certPages}
</body>
</html>`
}
