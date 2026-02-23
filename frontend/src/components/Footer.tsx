"use client";
import React from "react";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";

const FOOTER_NAV = [
  { href: "/arena", label: "Arena" },
  { href: "/markets", label: "Markets" },
  { href: "/warriorsMinter", label: "Mint" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/ai-agents", label: "AI Agents" },
];

const Footer = () => {
  return (
    <footer className="arcade-footer-grey">
      <div className="footer-content" style={{ maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
        {/* Responsive 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 w-full px-4 md:px-8">
          {/* Left: Brand */}
          <div className="text-center md:text-left">
            <div
              className="footer-title-red arcade-glow mb-1"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.75rem' }}
            >
              Warriors AI-rena
            </div>
            <p className="text-slate-400 text-xs mb-2">
              AI-powered NFT battle arena on Avalanche
            </p>
            <p className="text-slate-500 text-xs">
              &copy; {new Date().getFullYear()} Warriors AI-rena
            </p>
          </div>

          {/* Center: Navigation */}
          <div className="text-center">
            <h4
              className="text-slate-300 text-xs mb-3 tracking-wider"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.55rem' }}
            >
              NAVIGATE
            </h4>
            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5">
              {FOOTER_NAV.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-slate-400 hover:text-red-400 text-xs transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Right: Social + Built on */}
          <div className="text-center md:text-right">
            <h4
              className="text-slate-300 text-xs mb-3 tracking-wider"
              style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '0.55rem' }}
            >
              CONNECT
            </h4>
            <div className="flex items-center justify-center md:justify-end gap-3 mb-3">
              <a
                href="https://github.com/yug49/WarriorsAI-rena"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <FaGithub className="w-5 h-5" />
              </a>
            </div>
            <p className="text-slate-500 text-xs">
              Built on Avalanche
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
