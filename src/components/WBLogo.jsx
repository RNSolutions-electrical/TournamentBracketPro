export function WBLogo({ size = 80, className = '' }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 200 144" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Left ring */}
      <circle cx="72" cy="62" r="54" stroke="#c8a84b" strokeWidth="10" fill="none"/>
      <circle cx="72" cy="62" r="42" stroke="#c8a84b" strokeWidth="2" fill="none" strokeDasharray="4 3"/>
      {/* Right ring */}
      <circle cx="128" cy="62" r="54" stroke="#c8a84b" strokeWidth="10" fill="none"/>
      <circle cx="128" cy="62" r="42" stroke="#c8a84b" strokeWidth="2" fill="none" strokeDasharray="4 3"/>
      {/* Overlap mask left */}
      <path d="M100 18 C88 28 84 44 84 62 C84 80 88 96 100 106 C112 96 116 80 116 62 C116 44 112 28 100 18Z" fill="#1a1a1f"/>
      {/* Overlap ring lines */}
      <path d="M100 18 C88 28 84 44 84 62 C84 80 88 96 100 106" stroke="#c8a84b" strokeWidth="10" fill="none"/>
      <path d="M100 18 C112 28 116 44 116 62 C116 80 112 96 100 106" stroke="#c8a84b" strokeWidth="10" fill="none"/>
      {/* Inner washer hole suggestions */}
      <circle cx="72" cy="62" r="16" stroke="#c8a84b" strokeWidth="3" fill="none" opacity="0.4"/>
      <circle cx="128" cy="62" r="16" stroke="#c8a84b" strokeWidth="3" fill="none" opacity="0.4"/>
      {/* Divider line */}
      <line x1="50" y1="126" x2="150" y2="126" stroke="#c8a84b" strokeWidth="1.5" opacity="0.6"/>
      <circle cx="100" cy="126" r="2.5" fill="#c8a84b" opacity="0.8"/>
    </svg>
  )
}
