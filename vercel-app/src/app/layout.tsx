import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Speed E2E Dashboard',
  description: 'Trigger and monitor Speed Wallet E2E tests',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 antialiased">{children}</body>
    </html>
  )
}
