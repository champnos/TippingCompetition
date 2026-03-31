import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Fraction of entrants to eliminate per week
const ELIMINATE_FRACTION: Record<number, number> = {
  1: 1 / 4,
  2: 1 / 3,
  3: 1 / 2,
  4: 1, // all except winner
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.redirect(new URL('/dashboard', req.url))

  const formData = await req.formData()
  const competition_id = Number(formData.get('competition_id'))
  const finals_week = Number(formData.get('finals_week'))
  const winner_team_id = Number(formData.get('winner_team_id'))
  const actual_margin = Number(formData.get('actual_margin'))

  if (!competition_id || !finals_week || !winner_team_id || isNaN(actual_margin) || actual_margin < 0) {
    return NextResponse.redirect(new URL('/admin/finals?error=missing_fields', req.url))
  }

  // Get all active entries for this competition (count at START of this week)
  const { data: entriesData } = await supabase
    .from('finals_entries')
    .select('id, user_id')
    .eq('competition_id', competition_id)
    .eq('is_active', true)

  const entries = entriesData ?? []

  if (entries.length === 0) {
    return NextResponse.redirect(new URL('/admin/finals?info=no_active_entries', req.url))
  }

  const entryIds = entries.map((e) => e.id)

  // Get all tips submitted for this week for active entries
  const { data: tipsData } = await supabase
    .from('finals_tips')
    .select('id, entry_id, team_id, margin')
    .eq('finals_week', finals_week)
    .in('entry_id', entryIds)

  const tips = tipsData ?? []
  const tippedEntryIds = new Set(tips.map((t) => t.entry_id))

  // Build scored list: one entry per active entrant
  type ScoredEntry = {
    entry_id: number
    tip_id: number | null
    error_score: number
    correct_team: boolean
  }

  const scored: ScoredEntry[] = []

  for (const entry of entries) {
    const tip = tips.find((t) => t.entry_id === entry.id)

    if (!tip || tip.team_id === null || tip.margin === null) {
      // No tip submitted — assign worst score
      scored.push({ entry_id: entry.id, tip_id: tip?.id ?? null, error_score: 9999, correct_team: false })
    } else {
      const correct_team = tip.team_id === winner_team_id
      const error_score = correct_team
        ? Math.abs(actual_margin - tip.margin)
        : actual_margin + tip.margin
      scored.push({ entry_id: entry.id, tip_id: tip.id, error_score, correct_team })
    }
  }

  // Update tips with results
  for (const s of scored) {
    if (s.tip_id) {
      await supabase
        .from('finals_tips')
        .update({
          actual_margin,
          correct_team: s.correct_team,
          error_score: s.error_score,
        })
        .eq('id', s.tip_id)
    } else {
      // Insert a no-tip placeholder
      const entry = entries.find((e) => e.id === s.entry_id)
      if (entry) {
        await supabase
          .from('finals_tips')
          .upsert(
            {
              entry_id: s.entry_id,
              finals_week,
              team_id: null,
              margin: null,
              actual_margin,
              correct_team: false,
              error_score: 9999,
            },
            { onConflict: 'entry_id,finals_week' }
          )
      }
    }
  }

  const totalEntrants = scored.length

  // Sort by error_score descending (worst first)
  scored.sort((a, b) => b.error_score - a.error_score)

  let toEliminate: number[] // entry_ids

  if (finals_week === 4) {
    // Grand Final: lowest error wins; all others eliminated; ties at the top split the pot
    const bestScore = scored[scored.length - 1].error_score
    // Eliminate everyone except those tied for the lowest error
    toEliminate = scored
      .filter((s) => s.error_score !== bestScore)
      .map((s) => s.entry_id)
  } else {
    const fraction = ELIMINATE_FRACTION[finals_week]
    // Number to eliminate (floor — we get at least this many)
    const targetEliminate = Math.floor(totalEntrants * fraction)
    if (targetEliminate === 0) {
      // Nothing to eliminate this week
      return NextResponse.redirect(new URL('/admin/finals?processed=1', req.url))
    }

    // The score at the elimination boundary (the targetEliminate-th worst score)
    const boundaryScore = scored[targetEliminate - 1].error_score

    // Eliminate ALL entries at or above the boundary score (ties all eliminated)
    toEliminate = scored
      .filter((s) => s.error_score >= boundaryScore)
      .map((s) => s.entry_id)
  }

  // Mark eliminated entries
  if (toEliminate.length > 0) {
    await supabase
      .from('finals_entries')
      .update({ is_active: false, eliminated_week: finals_week })
      .in('id', toEliminate)
  }

  // Lock this week automatically after processing
  await supabase
    .from('finals_weeks')
    .upsert(
      { competition_id, finals_week, locked: true },
      { onConflict: 'competition_id,finals_week' }
    )

  return NextResponse.redirect(new URL('/admin/finals?processed=1', req.url))
}
