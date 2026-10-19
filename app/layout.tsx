import type { Metadata, Viewport } from "next";
import { Onest, Source_Serif_4 } from "next/font/google";
import { Providers } from "@/components/Providers";
import { STORAGE_KEY } from "@/lib/constants";
import "./globals.css";

const display = Source_Serif_4({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  axes: ["opsz"],
  display: "swap",
});

const ui = Onest({
  variable: "--font-ui",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "B2 Sprint", template: "%s · B2 Sprint" },
  description: "Seven calm days from B1 to B2: tenses, verb patterns, collocations — and speaking.",
  applicationName: "B2 Sprint",
  appleWebApp: { capable: true, title: "B2 Sprint", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2129" },
  ],
};

// Applies the saved theme before first paint, so a dark-mode learner never sees a white flash.
const themeScript = `try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"null");var t=s&&s.settings&&s.settings.theme;if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${ui.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
