import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "OAuth Runway", template: "%s · OAuth Runway" },
  description: "How long until your users can connect an app with your own OAuth app, and what's in the way.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <header className="border-b print:hidden">
          <nav className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="flex h-5 items-end gap-0.5">
                {[2, 3, 4, 5].map((h, i) => (
                  <span key={i} className="w-1 rounded-sm bg-foreground" style={{ height: `${h * 4}px`, opacity: 0.4 + i * 0.2 }} />
                ))}
              </span>
              OAuth Runway
            </Link>
            <div className="ml-auto flex gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">Directory</Link>
              <Link href="/verification" className="hover:text-foreground">Verification</Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
