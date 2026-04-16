import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import BloomPage from "@/pages/bloom";
import BranchPage from "@/pages/branch";
import NowPage from "@/pages/now";
import { createContext, useContext, useState } from "react";
import { Flower2, Zap, GitBranch } from "lucide-react";

// ── Energy context ────────────────────────────────────────────────────────
type EnergyMode = "fried" | "okay" | "wired";
const EnergyContext = createContext<{ energy: EnergyMode; setEnergy: (e: EnergyMode) => void }>({
  energy: "okay",
  setEnergy: () => {},
});
export const useEnergy = () => useContext(EnergyContext);

const ENERGY_OPTIONS: { value: EnergyMode; label: string; emoji: string; desc: string }[] = [
  { value: "fried", label: "Fried",  emoji: "🧠💤", desc: "Low energy, need easy wins" },
  { value: "okay",  label: "Okay",   emoji: "⚡",   desc: "Moderate, normal capacity" },
  { value: "wired", label: "Wired",  emoji: "🔥",   desc: "High energy, ready to go" },
];

function EnergyBar() {
  const { energy, setEnergy } = useEnergy();
  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-xl">
      {ENERGY_OPTIONS.map(o => (
        <button
          key={o.value}
          data-testid={`energy-${o.value}`}
          onClick={() => setEnergy(o.value)}
          title={o.desc}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
            energy === o.value
              ? `energy-${o.value} shadow-sm scale-105`
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <span>{o.emoji}</span>
          <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

function Nav() {
  const [location] = useLocation();
  const navItems = [
    { href: "/",      label: "Bloom", icon: Flower2,   tip: "Capture anything" },
    { href: "/now",   label: "Now",   icon: Zap,       tip: "What to do right now" },
  ];

  return (
    <header className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 mr-2">
          <svg viewBox="0 0 36 36" fill="none" className="w-8 h-8" aria-label="Brain Bloom logo">
            <circle cx="18" cy="18" r="17" fill="hsl(270 85% 68% / 0.15)" stroke="hsl(270 85% 68%)" strokeWidth="1.5"/>
            <circle cx="18" cy="13" r="4" fill="hsl(270 85% 68%)"/>
            <circle cx="11" cy="20" r="3" fill="hsl(185 90% 48%)"/>
            <circle cx="25" cy="20" r="3" fill="hsl(20 95% 62%)"/>
            <circle cx="14" cy="26" r="2.5" fill="hsl(142 68% 50%)"/>
            <circle cx="22" cy="26" r="2.5" fill="hsl(45 95% 55%)"/>
            <line x1="18" y1="17" x2="11" y2="20" stroke="hsl(270 85% 68% / 0.5)" strokeWidth="1.5"/>
            <line x1="18" y1="17" x2="25" y2="20" stroke="hsl(270 85% 68% / 0.5)" strokeWidth="1.5"/>
            <line x1="11" y1="23" x2="14" y2="26" stroke="hsl(185 90% 48% / 0.5)" strokeWidth="1.5"/>
            <line x1="25" y1="23" x2="22" y2="26" stroke="hsl(20 95% 62% / 0.5)" strokeWidth="1.5"/>
          </svg>
          <span className="font-bold text-base text-foreground hidden sm:block" style={{ fontFamily: 'Chillax, sans-serif' }}>
            Brain<span className="gradient-text">Bloom</span>
          </span>
        </Link>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? location === "/" : location.startsWith(href);
            return (
              <Link key={href} href={href} data-testid={`nav-${label.toLowerCase()}`}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}>
                  <Icon size={15} />
                  <span>{label}</span>
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto">
          <EnergyBar />
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [energy, setEnergy] = useState<EnergyMode>("okay");

  return (
    <QueryClientProvider client={queryClient}>
      <EnergyContext.Provider value={{ energy, setEnergy }}>
        <Router hook={useHashLocation}>
          <Nav />
          <main className="pt-14 min-h-dvh">
            <Switch>
              <Route path="/"            component={BloomPage} />
              <Route path="/branch/:id"  component={BranchPage} />
              <Route path="/now"         component={NowPage} />
              <Route component={() => (
                <div className="flex items-center justify-center h-[60vh] text-muted-foreground text-sm">
                  Page not found
                </div>
              )} />
            </Switch>
          </main>
        </Router>
      </EnergyContext.Provider>
      <Toaster />
    </QueryClientProvider>
  );
}
