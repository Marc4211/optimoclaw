import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AppStateProvider from "@/components/AppStateProvider";
import { GatewayProvider } from "@/contexts/GatewayContext";
import { RatesProvider } from "@/contexts/RatesContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BroadClaw",
  description: "Performance and optimization tool for OpenClaw deployments",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body suppressHydrationWarning className="flex h-full bg-background text-foreground">
        <GatewayProvider>
          <RatesProvider>
            <AppStateProvider />
            <Sidebar />
            <main className="flex-1 overflow-y-auto">{children}</main>
          </RatesProvider>
        </GatewayProvider>
      </body>
    </html>
  );
}
