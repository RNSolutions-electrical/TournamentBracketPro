// ─── WasherBox Scoring ────────────────────────────────────────────────────────
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

// ─── Utilities ────────────────────────────────────────────────────────────────
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

export const COLORS = [
  '#c8a84b','#8b5cf6','#ef4444','#10b981',
  '#3b82f6','#f97316','#ec4899','#14b8a6',
]

export const COMMISSIONER_PIN = '1977'

// ─── Round name helpers ───────────────────────────────────────────────────────
export function getDefaultRoundName(roundIdx, totalRounds, bracketType = 'winners') {
  const suffix = bracketType === 'losers' ? ' (Losers)' : bracketType === 'grand_final' ? '' : ''
  if (bracketType === 'grand_final') return 'Grand Final'
  if (roundIdx === totalRounds - 1) return 'Championship Final' + suffix
  if (roundIdx === totalRounds - 2) return 'Semifinals' + suffix
  if (roundIdx === totalRounds - 3) return 'Quarterfinals' + suffix
  return `Round ${roundIdx + 1}` + suffix
}

// ─── Single Elimination ───────────────────────────────────────────────────────
// Builds bracket rounds array. Each slot: { id, p1, p2, isBye }
// Byes are explicit null-player slots, auto-advanced on generation.
export function buildSingleElim(seededPlayers, customRoundNames = []) {
  const slots = [...seededPlayers]  // may include null = bye
  const rounds = []
  let current = slots

  while (current.length > 1) {
    const ri = rounds.length
    const matches = []
    for (let i = 0; i < current.length; i += 2) {
      const p1 = current[i] ?? null
      const p2 = current[i + 1] ?? null
      const isBye = (p1 && !p2) || (!p1 && p2)
      matches.push({ id: generateId(), p1, p2, isBye, score1: 0, score2: 0, winner: null })
    }
    const name = customRoundNames[ri] || null  // null = auto-named at display time
    rounds.push({ matches, name, type: 'winners' })
    current = matches.map(m => {
      if (m.isBye) return m.p1 ?? m.p2  // bye → advance the real player immediately
      return null
    })
  }
  return rounds
}

// ─── Double Elimination ───────────────────────────────────────────────────────
// Returns { winners: rounds[], losers: rounds[], grandFinal: round }
// Winners bracket: normal single-elim structure
// Losers bracket: receives losers from winners each round, plays own bracket
// Grand final: winners bracket winner vs losers bracket winner
export function buildDoubleElim(seededPlayers) {
  const size = nextPow2(seededPlayers.length)
  const slots = [...seededPlayers]
  while (slots.length < size) slots.push(null)

  // ── Winners bracket ──
  const winners = []
  let wCurrent = slots
  while (wCurrent.length > 1) {
    const matches = []
    for (let i = 0; i < wCurrent.length; i += 2) {
      const p1 = wCurrent[i] ?? null
      const p2 = wCurrent[i + 1] ?? null
      const isBye = (p1 && !p2) || (!p1 && p2)
      matches.push({ id: generateId(), p1, p2, isBye, score1: 0, score2: 0, winner: null })
    }
    winners.push({ matches, name: null, type: 'winners' })
    wCurrent = matches.map(m => m.isBye ? (m.p1 ?? m.p2) : null)
  }

  // ── Losers bracket ──
  // Standard DE losers structure: 2 losers rounds per winners round (except last)
  // Round L1: losers from W1 play each other
  // Round L2: L1 winners vs losers from W2, etc.
  const totalWRounds = winners.length
  const losers = []
  // We'll build empty losers rounds — filled in during play
  // Structure: alternating "minor" (intra-losers) and "major" (cross-feed) rounds
  const loserRoundCount = (totalWRounds - 1) * 2
  for (let i = 0; i < loserRoundCount; i++) {
    const matchCount = Math.pow(2, Math.floor((loserRoundCount - 1 - i) / 2))
    const matches = Array.from({ length: matchCount }, () => ({
      id: generateId(), p1: null, p2: null, isBye: false, score1: 0, score2: 0, winner: null
    }))
    losers.push({ matches, name: null, type: 'losers' })
  }

  // ── Grand Final ──
  const grandFinal = {
    matches: [{ id: generateId(), p1: null, p2: null, isBye: false, score1: 0, score2: 0, winner: null }],
    name: 'Grand Final',
    type: 'grand_final'
  }

  return { winners, losers, grandFinal }
}

// ─── Flatten double-elim into a DB-friendly round list ────────────────────────
// Each round gets: roundIndex, bracketSection ('winners'|'losers'|'grand_final')
export function flattenDoubleElim(de) {
  const flat = []
  de.winners.forEach((r, i) => flat.push({ ...r, sectionIndex: i, section: 'winners', globalIndex: flat.length }))
  de.losers.forEach((r, i) => flat.push({ ...r, sectionIndex: i, section: 'losers', globalIndex: flat.length }))
  flat.push({ ...de.grandFinal, sectionIndex: 0, section: 'grand_final', globalIndex: flat.length })
  return flat
}

// ─── Seeding helpers ──────────────────────────────────────────────────────────
// Given players + bye slots + mode, produce final seeded array
export function buildSeededSlots(players, byeIndices, mode, manualOrder) {
  // byeIndices: Set of slot positions that are byes
  // mode: 'random' | 'manual' | 'combo'
  let ordered
  if (mode === 'random') {
    ordered = shuffle([...players])
  } else if (mode === 'manual') {
    ordered = [...manualOrder.filter(Boolean)]
    // fill remainder
    const remaining = players.filter(p => !manualOrder.find(m => m?.id === p.id))
    ordered = [...ordered, ...remaining]
  } else {
    // combo: manual picks first, rest random
    const placed = manualOrder.filter(Boolean)
    const rest = shuffle(players.filter(p => !placed.find(x => x?.id === p.id)))
    ordered = [...placed, ...rest]
  }

  const size = nextPow2(ordered.length + byeIndices.size)
  const slots = []
  let playerIdx = 0
  for (let i = 0; i < size; i++) {
    if (byeIndices.has(i)) {
      slots.push(null)
    } else {
      slots.push(ordered[playerIdx] ?? null)
      playerIdx++
    }
  }
  return slots
}

// ─── Normalize bracket shape (v1 array → v2 object) ──────────────────────────
// v1 stored bracket as a raw array of round-objects with { matches, name, type }
// v2 stores { type, rounds[] } or { type, winners[], losers[], grandFinal }
export function normalizeBracket(raw) {
  if (!raw) return null
  // Already v2
  if (raw.type) return raw
  // v1: array of rounds
  if (Array.isArray(raw)) {
    return {
      type: 'single',
      rounds: raw.map((r, i) => ({
        matches: Array.isArray(r) ? r : (r.matches || []),
        name: r.name || null,
        type: 'winners',
      })),
      roundNames: {},
    }
  }
  // Unknown shape — return null so we fall back to builder
  return null
}
