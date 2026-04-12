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
  const full_name = String(formData.get('full_name') ?? '').trim()
  const short_name = String(formData.get('short_name') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()
  const is_admin = formData.get('is_admin') === 'on'

  if (!full_name || !email || !password) {
    return NextResponse.redirect(new URL('/admin/users?error=create_failed', req.url))
  }

  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  })

  if (error || !data.user) {
    return NextResponse.redirect(new URL('/admin/users?error=create_failed', req.url))
  }

  const { error: upsertError } = await adminClient
    .from('profiles')
    .upsert({ id: data.user.id, full_name, short_name, is_admin })

  if (upsertError) {
    return NextResponse.redirect(new URL('/admin/users?error=create_failed', req.url))
  }

  return NextResponse.redirect(new URL('/admin/users?created=1', req.url))
}
