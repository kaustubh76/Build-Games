import type { Metadata } from "next";
import "./globals.css";
import {ReactNode} from "react";
import {Providers} from "./providers";
import Header from "../components/Header";
import Footer from "@/components/Footer";
import WarriorAssistant from "@/components/WarriorAssistant";
import { WarriorMessageProvider } from "@/contexts/WarriorMessageContext";
import { TestModeProvider } from "@/contexts/TestModeContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { GamificationProvider } from "@/contexts/GamificationContext";
import { ToastContainer } from "@/components/gamification/ToastContainer";
import { GamificationOverlay } from "@/components/gamification/GamificationOverlay";
import { validateEnvironmentOrThrow } from "@/lib/validateEnv";

// Validate environment variables on server startup (runtime only, not during build)
// Skip validation during Next.js build phase to allow CI builds without full env
if (typeof window === 'undefined' && process.env.NEXT_PHASE !== 'phase-production-build') {
  validateEnvironmentOrThrow({ checkSensitive: false });
}

export const metadata: Metadata = {
  title: "WarriorsAI-rena | AI Battle Arena on Avalanche",
  description: "AI-powered blockchain battle arena with prediction markets on Avalanche. Mint warrior NFTs, compete in AI battles, trade prediction markets, and earn CRwN tokens.",
  keywords: "AI battle arena, prediction markets, Avalanche blockchain, NFT warriors, DeFi, CRwN token, 0G Compute",
  openGraph: {
    title: "WarriorsAI-rena | AI Battle Arena on Avalanche",
    description: "Mint warrior NFTs, compete in AI-powered battles, and trade prediction markets on Avalanche blockchain.",
    url: "https://warriors-ai-rena.vercel.app",
    siteName: "WarriorsAI-rena",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/Arena_landing.png",
        width: 1200,
        height: 630,
        alt: "WarriorsAI-rena Battle Arena",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WarriorsAI-rena | AI Battle Arena on Avalanche",
    description: "Mint warrior NFTs, compete in AI battles, and trade prediction markets on Avalanche.",
    images: ["/Arena_landing.png"],
  },
};

export default function RootLayout(props: {children: ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/warrior/Warrior_Idle_1.png" type="image/png" />
      </head>
      <body suppressHydrationWarning>
        <Providers>
          <TestModeProvider>
            <NotificationProvider>
              <GamificationProvider>
                <WarriorMessageProvider>
                  <Header />
                  {props.children}
                  <Footer />
                  <WarriorAssistant />
                  <ToastContainer />
                  <GamificationOverlay />
                </WarriorMessageProvider>
              </GamificationProvider>
            </NotificationProvider>
          </TestModeProvider>
        </Providers>
      </body>
    </html>
  );
}
