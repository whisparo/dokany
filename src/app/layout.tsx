import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap", // ✅ تمنع حظر الرندر وتسرع FCP/LCP
  preload: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap", // ✅ تمنع حظر الرندر
  preload: true,
});

export const metadata: Metadata = {
  title: "Moda Store",
  description: "متجر موضة إلكتروني سريّع وفاخر",
};

// ✅ تحسين الـ Viewport لمنع انزياح الشاشة على الموبايل
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground selection:bg-slate-800 selection:text-white">
        {children}
      </body>
    </html>
  );
}