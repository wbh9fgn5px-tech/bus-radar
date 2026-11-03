"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Brand, ThemeButton } from "@/components/radar/TopBar";

export function LandingHeader() {
  return (
    <TooltipProvider>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/75 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <div className="hidden sm:block">
            <Brand />
          </div>
          <div className="sm:hidden">
            <Brand compact />
          </div>
          <nav className="hidden items-center gap-6 text-sm text-fg-muted md:flex">
            <a href="#concept" className="hover:text-fg">Concept</a>
            <a href="#donnees" className="hover:text-fg">Données</a>
            <a href="#fonctionnement" className="hover:text-fg">Fonctionnement</a>
            <a href="#couverture" className="hover:text-fg">Couverture</a>
          </nav>
          <div className="flex-1" />
          <ThemeButton />
          <Link
            href="/carte"
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl bg-electric px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-electric/90"
          >
            <span className="hidden sm:inline">Ouvrir la carte</span>
            <span className="sm:hidden">La carte</span>
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>
    </TooltipProvider>
  );
}
