import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
    return NextResponse.redirect(new URL('/admin/teams?error=no_file', req.url))
  }

  const text = await file.text()
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return NextResponse.redirect(new URL('/admin/teams?error=empty_csv', req.url))
  }

  // Parse header row to determine column positions
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const nameIdx = headers.indexOf('name')
  const shortNameIdx = headers.indexOf('short_name')
  const abbreviationIdx = headers.indexOf('abbreviation')
  const stateIdx = headers.indexOf('state')

  if (nameIdx === -1) {
    return NextResponse.redirect(new URL('/admin/teams?error=missing_name_column', req.url))
  }

  const rows = lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim())
    return {
      name: cols[nameIdx] ?? '',
      short_name: shortNameIdx >= 0 ? (cols[shortNameIdx] || null) : null,
      abbreviation: abbreviationIdx >= 0 ? (cols[abbreviationIdx] || null) : null,
      state: stateIdx >= 0 ? (cols[stateIdx] || null) : null,
    }
  }).filter((r) => r.name)

  if (rows.length === 0) {
    return NextResponse.redirect(new URL('/admin/teams?error=no_valid_rows', req.url))
  }

  const { error } = await supabase
    .from('teams')
    .upsert(rows, { onConflict: 'name' })

  if (error) {
    console.error('Teams import error:', error)
    return NextResponse.redirect(new URL('/admin/teams?error=import_failed', req.url))
  }

  return NextResponse.redirect(new URL(`/admin/teams?imported=${rows.length}`, req.url))
}
