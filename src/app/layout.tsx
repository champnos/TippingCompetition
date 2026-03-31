import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mancini Tipping',
  description: 'AFL Tipping Competition',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="top-nav">
          <a href="/dashboard" className="top-nav-brand">🏉 Mancini Tipping</a>
          <div className="top-nav-actions">
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="btn btn-ghost btn-sm">Log Out</button>
            </form>
          </div>
        </nav>
        {children}
      </body>
    </html>
  )
}