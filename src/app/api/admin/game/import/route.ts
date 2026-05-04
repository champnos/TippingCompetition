import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Window for detecting a rescheduled game (14 days in ms)
const RESCHEDULE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000

/** Quote-aware CSV line parser that handles fields containing commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current.trim())
  return fields
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
  const file = formData.get('csv_file') as File | null
  let seasonId = formData.get('season_id') ? Number(formData.get('season_id')) : null

  if (!file || file.size === 0) {
    return NextResponse.redirect(new URL('/admin?error=no_file', req.url))
  }

  // If no season_id provided, fall back to the active competition's season
  if (!seasonId) {
    const { data: activeComp } = await supabase
      .from('competitions')
      .select('season_id')
      .eq('is_active', true)
      .single()
    seasonId = activeComp?.season_id ?? null
  }

  if (!seasonId) {
    return NextResponse.redirect(new URL('/admin?error=no_season', req.url))
  }

  const text = await file.text()
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return NextResponse.redirect(new URL('/admin?error=empty_csv', req.url))
  }

  // Parse and validate header row
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
  const requiredCols = ['round_number', 'home_team', 'away_team', 'match_time']
  for (const col of requiredCols) {
    if (!header.includes(col)) {
      return NextResponse.redirect(new URL(`/admin?error=missing_col_${col}`, req.url))
    }
  }

  const colIdx = {
    round_number: header.indexOf('round_number'),
    home_team: header.indexOf('home_team'),
    away_team: header.indexOf('away_team'),
    match_time: header.indexOf('match_time'),
    venue: header.indexOf('venue'),
  }

  const dataLines = lines.slice(1)

  // Fetch teams and rounds for the given season
  const [{ data: teams }, { data: rounds }] = await Promise.all([
    supabase.from('teams').select('id, name, short_name'),
    supabase.from('rounds').select('id, round_number').eq('season_id', seasonId),
  ])

  const teamList = teams ?? []

  // Build round_number → round_id lookup for this season
  const roundByNumber = new Map<number, number>()
  for (const r of rounds ?? []) {
    roundByNumber.set(r.round_number, r.id)
  }
  const seasonRoundIds = (rounds ?? []).map((r) => r.id)

  // Fetch existing games for this season to power upsert logic
  type ExistingGame = { id: number; round_id: number; home_team_id: number; away_team_id: number; match_time: string }
  const existingGames: ExistingGame[] = seasonRoundIds.length > 0
    ? ((await supabase
        .from('games')
        .select('id, round_id, home_team_id, away_team_id, match_time')
        .in('round_id', seasonRoundIds)).data ?? []) as ExistingGame[]
    : []

  let imported = 0
  let updated = 0
  const skipReasons: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const parts = parseCsvLine(dataLines[i])
    const rowNum = i + 2

    const round_number_str = parts[colIdx.round_number]?.trim() ?? ''
    const home_team_str = parts[colIdx.home_team]?.trim() ?? ''
    const away_team_str = parts[colIdx.away_team]?.trim() ?? ''
    const match_time_str = parts[colIdx.match_time]?.trim() ?? ''
    const venue_str = colIdx.venue >= 0 ? (parts[colIdx.venue]?.trim() ?? '') : ''

    // Validate round_number
    const round_number = Number(round_number_str)
    if (!round_number_str || isNaN(round_number) || !Number.isInteger(round_number) || round_number < 1) {
      skipReasons.push(`Row ${rowNum}: invalid round_number "${round_number_str}"`)
      continue
    }
    const round_id = roundByNumber.get(round_number)
    if (!round_id) {
      skipReasons.push(`Row ${rowNum}: round ${round_number} not found in season`)
      continue
    }

    // Validate teams
    const homeTeam = teamList.find(
      (t) =>
        t.name.toLowerCase() === home_team_str.toLowerCase() ||
        (t.short_name && t.short_name.toLowerCase() === home_team_str.toLowerCase()),
    )
    if (!homeTeam) {
      skipReasons.push(`Row ${rowNum}: home team "${home_team_str}" not found`)
      continue
    }
    const awayTeam = teamList.find(
      (t) =>
        t.name.toLowerCase() === away_team_str.toLowerCase() ||
        (t.short_name && t.short_name.toLowerCase() === away_team_str.toLowerCase()),
    )
    if (!awayTeam) {
      skipReasons.push(`Row ${rowNum}: away team "${away_team_str}" not found`)
      continue
    }

    // Validate match_time
    if (!match_time_str) {
      skipReasons.push(`Row ${rowNum}: missing match_time`)
      continue
    }
    const matchTimeDate = new Date(match_time_str)
    if (isNaN(matchTimeDate.getTime())) {
      skipReasons.push(`Row ${rowNum}: invalid match_time "${match_time_str}"`)
      continue
    }

    const venue = venue_str || null

    // Upsert logic
    // 1. Exact match: same round + home_team + away_team → update match_time & venue
    const exactMatch = existingGames.find(
      (g) => g.round_id === round_id && g.home_team_id === homeTeam.id && g.away_team_id === awayTeam.id,
    )
    if (exactMatch) {
      const { error } = await supabase
        .from('games')
        .update({ match_time: match_time_str, venue })
        .eq('id', exactMatch.id)
      if (error) {
        skipReasons.push(`Row ${rowNum}: update failed — ${error.message}`)
      } else {
        exactMatch.match_time = match_time_str
        updated++
      }
      continue
    }

    // 2. Reschedule: same home/away in the season, match_time within 14-day window → update round + time + venue
    const rescheduleMatch = existingGames.find((g) => {
      if (g.home_team_id !== homeTeam.id || g.away_team_id !== awayTeam.id) return false
      const diff = Math.abs(new Date(g.match_time).getTime() - matchTimeDate.getTime())
      return diff <= RESCHEDULE_WINDOW_MS
    })
    if (rescheduleMatch) {
      const { error } = await supabase
        .from('games')
        .update({ round_id, match_time: match_time_str, venue })
        .eq('id', rescheduleMatch.id)
      if (error) {
        skipReasons.push(`Row ${rowNum}: reschedule update failed — ${error.message}`)
      } else {
        rescheduleMatch.round_id = round_id
        rescheduleMatch.match_time = match_time_str
        updated++
      }
      continue
    }

    // 3. Insert new game
    const { error } = await supabase.from('games').insert({
      round_id,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      match_time: match_time_str,
      venue,
    })
    if (error) {
      skipReasons.push(`Row ${rowNum}: insert failed — ${error.message}`)
    } else {
      // Track in memory to prevent duplicate inserts within the same CSV
      existingGames.push({ id: -1, round_id, home_team_id: homeTeam.id, away_team_id: awayTeam.id, match_time: match_time_str })
      imported++
    }
  }

  const skipped = skipReasons.length
  const params = new URLSearchParams({
    imported: String(imported),
    updated: String(updated),
    skipped: String(skipped),
  })
  if (skipped > 0) {
    // Limit reasons to first 5 to keep URL length manageable
    params.set('skip_reasons', skipReasons.slice(0, 5).join(' | '))
  }

  return NextResponse.redirect(new URL(`/admin?${params.toString()}`, req.url))
}
