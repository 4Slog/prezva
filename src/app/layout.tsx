import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { BRAND } from '@/lib/brand'
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator'
import { IOSInstallPrompt } from '@/components/pwa/IOSInstallPrompt'
import { ToastProvider } from '@/components/ui/Toast'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: BRAND.name,
    template: `%s — ${BRAND.name}`,
  },
  description: BRAND.tagline,
  metadataBase: new URL(BRAND.url),
  manifest: '/manifest.json',
  themeColor: BRAND.colors.teal,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: BRAND.name,
  },
  openGraph: {
    title: BRAND.name,
    description: BRAND.tagline,
    url: BRAND.url,
    siteName: BRAND.name,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: BRAND.name,
    description: BRAND.tagline,
  },
  icons: {
    apple: '/icons/icon-192.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--pz-bg)] text-[var(--pz-text)]">
        <OfflineIndicator />
        <ToastProvider>{children}</ToastProvider>
        <IOSInstallPrompt />
      </body>
    </html>
  )
}
