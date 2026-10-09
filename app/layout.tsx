import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Toaster from "@/components/Toaster";
import PreviewRibbon from "@/components/PreviewRibbon";
import { previewRibbonInfo } from "@/lib/deploy-env";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-fraunces",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  title: "Vidya Yati",
  description: "School & kindergarten management, built for the Indian market.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Preview deployments only (see lib/deploy-env.ts); null on the live site.
  const preview = previewRibbonInfo();
  return (
    <html lang="en" className={`${fraunces.variable} ${jakarta.variable} ${plexMono.variable}${preview ? " is-preview" : ""}`}>
      <body>
        {preview && <PreviewRibbon info={preview} />}
        {children}
        <Toaster />
      </body>
    </html>
  );
}
