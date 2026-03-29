import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  const formData = await req.formData()

  const { error } = await supabase
    .from('bank_details')
    .upsert({
      profile_id: user.id,
      account_name: formData.get('account_name') as string,
      bsb: formData.get('bsb') as string,
      account_number: formData.get('account_number') as string,
      notes: formData.get('notes') as string,
    }, { onConflict: 'profile_id' })

  if (error) return NextResponse.redirect(new URL('/payments?error=1', req.url))
  return NextResponse.redirect(new URL('/payments?saved=1', req.url))
}
