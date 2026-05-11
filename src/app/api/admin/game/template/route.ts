import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const FIXTURES_TEMPLATE_CSV = `round_number,home_team,away_team,match_time,venue
1,Collingwood,Richmond,2026-03-19T19:35,MCG
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

  return new NextResponse(FIXTURES_TEMPLATE_CSV, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="fixtures_template.csv"',
    },
  })
}
