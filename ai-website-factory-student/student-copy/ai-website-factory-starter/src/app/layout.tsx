import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { readTheme } from "@/lib/ui-prefs";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO RankPilot",
  description: "Control plane for the SEO RankPilot site network.",
  robots: { index: false, follow: false },
  manifest: "/manifest.json",
  themeColor: [
    // Daylight Indigo — same pale blue-gray under both prefers-color-scheme
    // so the browser chrome matches the portal regardless of OS pref.
    { media: "(prefers-color-scheme: light)", color: "#eef1f7" },
    { media: "(prefers-color-scheme: dark)",  color: "#eef1f7" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SEO RankPilot",
  },
};

/**
 * Root layout.
 *
 * The pre-paint script reads `localStorage.gyl-theme` and applies
 * `data-theme="light|dark"` before first paint, so users don't see a
 * flash when their saved preference differs from the server-rendered
 * cookie default. 'system' resolves to OS preference.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = readTheme();
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var saved = localStorage.getItem('gyl-theme');
                  var mode = saved || 'system';
                  var resolved = mode === 'system'
                    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                    : mode;
                  document.documentElement.setAttribute('data-theme', resolved);
                  document.documentElement.setAttribute('data-theme-pref', mode);
                } catch (e) { /* ignore */ }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg text-text antialiased">{children}</body>
    </html>
  );
}
