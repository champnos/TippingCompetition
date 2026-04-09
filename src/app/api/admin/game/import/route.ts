import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const TEMPLATE_CSV = `round_id,home_team,away_team,match_time,venue
1,Richmond Tigers,Collingwood,2026-04-12T14:35,MCG
2,Carlton,Essendon,2026-04-13T16:20,MCG
`

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) return NextResponse.redirect(new URL('/dashboard', req.url))

  return new NextResponse(TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="fixtures_template.csv"',
    },
  })
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

  if (!file || file.size === 0) {
    return NextResponse.redirect(new URL('/admin?error=no_file', req.url))
  }

  const text = await file.text()
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return NextResponse.redirect(new URL('/admin?error=empty_csv', req.url))
  }

  // Skip header row
  const dataLines = lines.slice(1)

  // Fetch all teams and rounds for lookup
  const [{ data: teams }, { data: rounds }] = await Promise.all([
    supabase.from('teams').select('id, name, short_name'),
    supabase.from('rounds').select('id'),
  ])

  const teamList = teams ?? []
  const roundIds = new Set((rounds ?? []).map((r) => r.id))

  const toInsert: {
    round_id: number
    home_team_id: number
    away_team_id: number
    match_time: string
    venue: string | null
  }[] = []

  const skipReasons: string[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i]
    const parts = line.split(',')

    if (parts.length < 4) {
      skipReasons.push(`Row ${i + 2}: not enough columns`)
      continue
    }

    const round_id = Number(parts[0].trim())
    const home_team_str = parts[1].trim()
    const away_team_str = parts[2].trim()
    const match_time = parts[3].trim()
    const venue = parts.slice(4).join(',').trim() || null

    if (!round_id || isNaN(round_id)) {
      skipReasons.push(`Row ${i + 2}: invalid round_id "${parts[0].trim()}"`)
      continue
    }

    if (!roundIds.has(round_id)) {
      skipReasons.push(`Row ${i + 2}: round_id ${round_id} not found`)
      continue
    }

    const homeTeam = teamList.find(
      (t) =>
        t.name.toLowerCase() === home_team_str.toLowerCase() ||
        (t.short_name && t.short_name.toLowerCase() === home_team_str.toLowerCase()),
    )
    if (!homeTeam) {
      skipReasons.push(`Row ${i + 2}: home team "${home_team_str}" not found`)
      continue
    }

    const awayTeam = teamList.find(
      (t) =>
        t.name.toLowerCase() === away_team_str.toLowerCase() ||
        (t.short_name && t.short_name.toLowerCase() === away_team_str.toLowerCase()),
    )
    if (!awayTeam) {
      skipReasons.push(`Row ${i + 2}: away team "${away_team_str}" not found`)
      continue
    }

    if (!match_time) {
      skipReasons.push(`Row ${i + 2}: missing match_time`)
      continue
    }

    toInsert.push({
      round_id,
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      match_time,
      venue,
    })
  }

  let imported = 0
  if (toInsert.length > 0) {
    const { error } = await supabase.from('games').insert(toInsert)
    if (!error) {
      imported = toInsert.length
    } else {
      for (let i = 0; i < toInsert.length; i++) {
        skipReasons.push(`Valid row #${i + 1}: insert failed — ${error.message}`)
      }
    }
  }

  const skipped = skipReasons.length
  const params = new URLSearchParams({
    imported: String(imported),
    skipped: String(skipped),
  })
  if (skipped > 0) {
    params.set('skip_reasons', skipReasons.join(' | '))
  }

  return NextResponse.redirect(new URL(`/admin?${params.toString()}`, req.url))
}
