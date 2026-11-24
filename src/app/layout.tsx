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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
  themeColor: '#0B1020',
  colorScheme: 'dark light' as const,
}

export const metadata: Metadata = {
  title: "AZIMARA MESH — The Governed Operating Fabric for Autonomous AI",
  description: "Enterprise AI Agent Fleet Operating System. Every Agent. One Governed System.",
  keywords: ["AI agents", "agent fleet", "governance", "orchestration", "enterprise AI", "AZIMARA MESH"],
  authors: [{ name: "AI AZIMARA" }],
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AZIMARA MESH — Every agent. One governed system." }],
    title: "AZIMARA MESH",
    description: "Every Agent. One Governed System.",
    siteName: "AZIMARA MESH",
    type: "website",
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
