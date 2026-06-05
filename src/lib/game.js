// WasherBox scoring rules
// Box = 1pt, Cup = 3pts, 4 washers per player per round
// Cancellation: only NET points recorded after both players throw

export function calcRoundScore(p1Box, p1Cup, p2Box, p2Cup) {
  const gross1 = p1Box * 1 + p1Cup * 3
  const gross2 = p2Box * 1 + p2Cup * 3
  const net1 = Math.max(0, gross1 - gross2)
  const net2 = Math.max(0, gross2 - gross1)
  return { gross1, gross2, net1, net2 }
}

export function calcMatchTotals(rounds) {
  return rounds
    .filter(r => r.confirmed)
    .reduce((acc, r) => ({
      total1: acc.total1 + (r.net1 || 0),
      total2: acc.total2 + (r.net2 || 0),
    }), { total1: 0, total2: 0 })
}

export function generateId() {
  return Math.random().toString(36).slice(2, 9)
}

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function nextPow2(n) {
  let p = 1
  while (p < n) p <<= 1
  return p
}

export function buildBracket(players) {
  const size = nextPow2(players.length)
  const seeded = [...players]
  while (seeded.length < size) seeded.push(null)
  const rounds = []
  let current = seeded
  while (current.length > 1) {
    const matches = []
    for (let i = 0; i < current.length; i += 2) {
      matches.push({
        id: generateId(),
        p1: current[i],
        p2: current[i + 1],
        score1: 0,
        score2: 0,
        winner: null,
      })
    }
    rounds.push(matches)
    current = matches.map(() => null)
  }
  return rounds
}

export const COLORS = [
  '#c8a84b','#8b5cf6','#ef4444','#10b981',
  '#3b82f6','#f97316','#ec4899','#14b8a6',
]

export const COMMISSIONER_PIN = '1977'

export function getRoundName(roundIdx, totalRounds) {
  if (roundIdx === totalRounds - 1) return 'Championship Final'
  if (roundIdx === totalRounds - 2) return 'Semifinals'
  if (roundIdx === totalRounds - 3) return 'Quarterfinals'
  return `Round ${roundIdx + 1}`
}
