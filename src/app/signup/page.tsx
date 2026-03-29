'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    })
    if (error) { setError(error.message) } else { setMessage('Check your email for a confirmation link!') }
    setLoading(false)
  }

  return (
    <main style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h1>Mancini Tipping</h1>
      <h2>Sign Up</h2>
      {message ? <p style={{ color: 'green' }}>{message}</p> : (
        <form onSubmit={handleSignup}>
          <div style={{ marginBottom: 12 }}>
            <label>Full Name<br />
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Email<br />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Password<br />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Confirm Password<br />
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={{ width: '100%', padding: 8, marginTop: 4 }} />
            </label>
          </div>
          {error && <p style={{ color: 'red' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: 10 }}>
            {loading ? 'Creating account...' : 'Sign Up'}
          </button>
        </form>
      )}
      <p style={{ marginTop: 16 }}>Already have an account? <a href="/login">Log in</a></p>
    </main>
  )
}