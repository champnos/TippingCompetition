import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
  const csv = String(formData.get('csv') ?? '').trim()

  if (!csv) {
    return NextResponse.redirect(new URL('/admin/users?bulk_created=0&bulk_failed=0', req.url))
  }

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const lines = csv.split('\n').map((l) => l.trim()).filter(Boolean)
  // Skip header row
  const dataLines = lines.slice(1)

  let successCount = 0
  let failCount = 0

  for (const line of dataLines) {
    const [full_name, short_name, email, password, is_admin_raw] = line.split(',').map((v) => v.trim())

    if (!full_name || !email || !password) {
      failCount++
      continue
    }

    const is_admin = is_admin_raw === 'true' || is_admin_raw === '1' || is_admin_raw === 'yes'

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })

    if (error || !data.user) {
      failCount++
      continue
    }

    const { error: upsertError } = await adminClient
      .from('profiles')
      .upsert({ id: data.user.id, full_name, short_name: short_name || null, is_admin })

    if (upsertError) {
      failCount++
      continue
    }

    successCount++
  }

  return NextResponse.redirect(
    new URL(`/admin/users?bulk_created=${successCount}&bulk_failed=${failCount}`, req.url)
  )
}
