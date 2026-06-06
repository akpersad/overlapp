import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

// Display face — reserved for headings, hero, and big numbers-of-emphasis.
// Variable, with the optical-size axis so large display copy gets the right
// cut (DESIGN-BRIEF.md "Type").
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

// Body / UI face — also carries the time gutter via `font-variant-numeric:
// tabular-nums` (no separate mono font needed).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

// Absolute base so per-page Open Graph image paths resolve to real URLs in
// link previews (iMessage, WhatsApp, Slack…). Falls back to localhost in dev.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Overlapp",
  description:
    "A persistent shared group calendar — know when everyone's free before anyone asks.",
  applicationName: "Overlapp",
  // Installed-PWA hints: standalone display + status-bar style on iOS.
  appleWebApp: {
    capable: true,
    title: "Overlapp",
    statusBarStyle: "default",
  },
  // favicon.ico (root app/) is auto-linked by Next's file convention; the SVG is
  // preferred by modern browsers for a crisp tab icon at any DPI.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  // Default link-preview card; per-page metadata (e.g. invites) overrides this.
  openGraph: {
    type: "website",
    siteName: "Overlapp",
    title: "Overlapp",
    description:
      "A persistent shared group calendar — know when everyone's free before anyone asks.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Overlapp — a shared group calendar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Overlapp",
    description:
      "A persistent shared group calendar — know when everyone's free before anyone asks.",
    images: ["/og-image.png"],
  },
};

// theme-color drives the OS chrome around the installed app. Honey brand on the
// light/cream theme; warm charcoal surface for the dark theme.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efa94a" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1915" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
