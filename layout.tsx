import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ViralCut — Turn any YouTube video into viral-ready shorts",
  description:
    "Paste any YouTube link (any duration) or upload a video. AI finds the best moments, scores viral potential, reframes with face tracking and burns karaoke captions. Free, unlimited, phone-friendly.",
  keywords: ["shorts", "clips", "youtube shorts", "viral clips", "auto captions", "reframe", "ai video"],
  authors: [{ name: "ViralCut" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "ViralCut — Long video in. Viral shorts out.",
    description: "AI clipping studio: best-moment detection, virality score, smart reframing, auto captions.",
    siteName: "ViralCut",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ViralCut — Long video in. Viral shorts out.",
    description: "AI clipping studio: best-moment detection, virality score, smart reframing, auto captions.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
