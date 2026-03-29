import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mancini Tipping',
  description: 'AFL Tipping Competition',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}