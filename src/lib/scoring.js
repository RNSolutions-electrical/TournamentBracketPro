import { supabase } from './supabase'

// ─── WasherBox bracket advancement ──────────────────────────────────────────
// Shared by ScoreboardTab and the mobile inline scorer so behavior stays identical.

// Find the builder (structure JSON) match id for a given DB match row
export function findBuilderMatchId(dbMatch, bracket) {
  if (dbMatch.freeform_match_id) return dbMatch.freeform_match_id
  const sec = bracket?.sections?.find(s => s.id === dbMatch.bracket_section)
  if (!sec) return null
  const rnd = sec.rounds.find(r => r.id === dbMatch.freeform_round_id)
    || sec.rounds[dbMatch.section_round_index ?? 0]
  if (!rnd) return null
  const bm = rnd.matches?.[dbMatch.match_index ?? 0]
  return bm?.id || null
}

// Locate the DB row for a builder match (by id, then by section+round+index)
export function findDbRowForBuilderMatch(builderMatchId, sec, rnd, mi, matches) {
  return matches.find(m => m.freeform_match_id === builderMatchId)
    || matches.find(m => m.bracket_section === sec.id && m.freeform_round_id === rnd.id && m.match_index === mi)
    || matches.find(m => m.bracket_section === sec.id && m.match_index === mi)
}

export async function advanceWinner(winnerId, loserPlayerId, match, matches, bracket, players) {
  const section = match.bracket_section || 'winners'
  const sri = match.section_round_index ?? match.round_index ?? 0
  const mi = match.match_index ?? 0

  // ── FREEFORM: push winner into any slot linked as "winner of THIS match" ──
  if (bracket?.type === 'freeform' && bracket.sections) {
    const thisBuilderId = findBuilderMatchId(match, bracket)
    if (!thisBuilderId) return
    for (const sec of bracket.sections) {
      for (let ri = 0; ri < sec.rounds.length; ri++) {
        const rnd = sec.rounds[ri]
        for (let mmi = 0; mmi < rnd.matches.length; mmi++) {
          const bm = rnd.matches[mmi]
          const p1Linked = bm.p1?.type === 'winner_of' && bm.p1.matchId === thisBuilderId
          const p2Linked = bm.p2?.type === 'winner_of' && bm.p2.matchId === thisBuilderId
          if (!p1Linked && !p2Linked) continue
          const depRow = findDbRowForBuilderMatch(bm.id, sec, rnd, mmi, matches)
          if (!depRow) continue
          const patch = { updated_at: new Date().toISOString() }
          if (p1Linked) patch.player1_id = winnerId
          if (p2Linked) patch.player2_id = winnerId
          await supabase.from('matches').update(patch).eq('id', depRow.id)
        }
      }
    }
    return
  }

  if (bracket?.type === 'single') {
    const nextSri = sri + 1
    const nextMi = Math.floor(mi / 2)
    const nextMatch = matches.find(m =>
      (m.bracket_section === 'winners' || !m.bracket_section) &&
      (m.section_round_index ?? m.round_index) === nextSri &&
      m.match_index === nextMi
    )
    if (nextMatch) {
      const field = mi % 2 === 0 ? 'player1_id' : 'player2_id'
      await supabase.from('matches').update({ [field]: winnerId, updated_at: new Date().toISOString() }).eq('id', nextMatch.id)
      // Update bracket JSON
      const winnerPlayer = players.find(p => p.id === winnerId)
      const updatedRounds = bracket.rounds.map((r, ri) =>
        ri === nextSri ? { ...r, matches: r.matches.map((m, mm) =>
          mm === nextMi ? { ...m, [mi % 2 === 0 ? 'p1' : 'p2']: winnerPlayer } : m
        )} : r
      )
      await supabase.from('tournament').update({ bracket: { ...bracket, rounds: updatedRounds }, updated_at: new Date().toISOString() }).eq('id','season6')
    }
  } else if (bracket?.type === 'double') {
    if (section === 'winners') {
      // Winner advances in winners bracket
      const nextSri = sri + 1
      const nextMi = Math.floor(mi / 2)
      const nextWMatch = matches.find(m => m.bracket_section === 'winners' && (m.section_round_index ?? m.round_index) === nextSri && m.match_index === nextMi)
      if (nextWMatch) {
        const field = mi % 2 === 0 ? 'player1_id' : 'player2_id'
        await supabase.from('matches').update({ [field]: winnerId, updated_at: new Date().toISOString() }).eq('id', nextWMatch.id)
      }
      // Loser drops to losers bracket — L round = sri*2, slot based on match position
      if (loserPlayerId) {
        const losersRoundIdx = sri * 2 // first losers round for this winners round
        const losersMi = mi
        const lMatch = matches.find(m => m.bracket_section === 'losers' && (m.section_round_index ?? m.round_index) === losersRoundIdx && m.match_index === losersMi)
        if (lMatch) {
          await supabase.from('matches').update({ player1_id: loserPlayerId, updated_at: new Date().toISOString() }).eq('id', lMatch.id)
        }
      }
    } else if (section === 'losers') {
      const totalLRounds = bracket.losers?.length || 1
      const nextSri = sri + 1
      if (nextSri < totalLRounds) {
        const nextMi = Math.floor(mi / 2)
        const nextLMatch = matches.find(m => m.bracket_section === 'losers' && (m.section_round_index ?? m.round_index) === nextSri && m.match_index === nextMi)
        if (nextLMatch) {
          const field = mi % 2 === 0 ? 'player1_id' : 'player2_id'
          await supabase.from('matches').update({ [field]: winnerId, updated_at: new Date().toISOString() }).eq('id', nextLMatch.id)
        }
      } else {
        // Last losers round — advance to grand final p2
        const gfMatch = matches.find(m => m.bracket_section === 'grand_final')
        if (gfMatch) await supabase.from('matches').update({ player2_id: winnerId, updated_at: new Date().toISOString() }).eq('id', gfMatch.id)
      }
    } else if (section === 'grand_final') {
      // Tournament over — no advancement needed
    }
  }
}
