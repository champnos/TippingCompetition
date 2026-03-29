import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) { redirect('/login') }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Dashboard</h1>
        <form action="/api/auth/signout" method="post">
          <button type="submit">Log Out</button>
        </form>
      </div>
      <p>Welcome, {user.email}!</p>
      <nav style={{ marginTop: 24 }}>
        <ul>
          <li><a href="/tips">Submit Tips</a></li>
          <li><a href="/leaderboard">Leaderboard</a></li>
        </ul>
      </nav>
    </main>
  )
}