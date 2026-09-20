import type { Metadata } from "next";
// TEMP DIAGNOSTIC: next/font/google swapped out for plain CSS variables to
// test whether Google Fonts loading is related to the production
// redirect-loop investigation (see memory.md). Revert once resolved.
import "./globals.css";

export const metadata: Metadata = {
  title: "Vidya Yati",
  description: "School & kindergarten management, built for the Indian market.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  console.log("[layout-debug] rendering root layout");
  return (
    <html
      lang="en"
      style={{
        "--font-fraunces": "Georgia, serif",
        "--font-jakarta": "system-ui, sans-serif",
        "--font-plex-mono": "monospace",
      } as React.CSSProperties}
    >
      <body>{children}</body>
    </html>
  );
}
