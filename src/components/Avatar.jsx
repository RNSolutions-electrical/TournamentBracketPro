export function Avatar({ player, size = 44, ring = false, onClick }) {
  const color = player?.color || '#c8a84b'
  const initials = player?.name ? player.name[0].toUpperCase() : '?'

  return (
    <div onClick={onClick}
      style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, cursor: onClick ? 'pointer' : 'default',
        border: ring ? `2px solid ${color}` : '2px solid rgba(200,168,75,0.3)',
        boxShadow: ring ? `0 0 14px ${color}66, 0 0 28px ${color}33` : 'none',
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s' }}
      onMouseEnter={e => onClick && (e.currentTarget.style.transform = 'scale(1.08)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
      {player?.image_url
        ? <img src={player.image_url} alt={player.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        : <span style={{ color:'#1a1a1f', fontWeight:800, fontSize: size * 0.4, fontFamily:'Cinzel' }}>{initials}</span>}
    </div>
  )
}
