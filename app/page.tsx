"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LandingFooter from "@/components/LandingFooter";

const FEATURES = [
  {
    title: "Live Translation",
    desc: "Real-time captions and spoken translation across English, Chinese, Japanese, and Korean.",
    icon: "🌐",
  },
  {
    title: "Multi-Speaker",
    desc: "Automatic speaker detection so audiences always know who is talking.",
    icon: "🎙️",
  },
  {
    title: "Audience QR Link",
    desc: "Listeners scan one QR code to follow along with text and audio on their phones.",
    icon: "📱",
  },
  {
    title: "Professional Transcripts",
    desc: "AI-polished bilingual transcripts with glossary support and Word export.",
    icon: "📄",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "We ran a bilingual investor briefing with 80 attendees. SimoExchange kept everyone aligned without hiring three interpreters.",
    name: "Sarah K.",
    role: "Events Lead, APAC fintech forum",
  },
  {
    quote:
      "The glossary feature nailed our fund terms. Translations sounded like our own compliance team wrote them.",
    name: "David M.",
    role: "Head of IR, cross-border VC",
  },
  {
    quote:
      "Setup took five minutes. Our webinar audience in Shanghai followed the English keynote in Chinese on their phones.",
    name: "Priya N.",
    role: "Programme Director, global accelerator",
  },
];

function LandingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/app";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEnter = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Incorrect password");
      }
      router.push(redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Access denied");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto mb-20 max-w-md">
      <div className="rounded-2xl border border-white/10 bg-card/80 p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <h2 className="text-center text-lg font-semibold text-white">
          Enter access password
        </h2>
        <p className="mt-2 text-center text-sm text-gray-500">
          This service is invite-only. Enter the password to continue.
        </p>
        <form onSubmit={(e) => void handleEnter(e)} className="mt-6 space-y-4">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-center text-white placeholder-gray-600 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <p className="mt-2 text-center text-xs text-gray-500">
              Hint: founder&apos;s English first name — 6 characters
            </p>
          </div>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full rounded-xl bg-accent py-3.5 font-semibold text-black transition-all hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -right-20 bottom-20 h-96 w-96 rounded-full bg-teal-500/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-16">
        <header className="mb-16 text-center">
          <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-accent">
            Live Interpretation Platform
          </p>
          <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
            Simo<span className="text-accent">Exchange</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-400">
            Bridge languages in real time — for conferences, webinars, boardrooms,
            and global teams who cannot afford to lose a single word.
          </p>
        </header>

        <Suspense
          fallback={
            <div className="mx-auto mb-20 h-48 max-w-md animate-pulse rounded-2xl bg-card" />
          }
        >
          <LandingForm />
        </Suspense>

        <section className="mb-20">
          <h2 className="mb-8 text-center text-2xl font-semibold text-white">
            Built for live multilingual events
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-white/10 bg-card/60 p-5 transition-colors hover:border-accent/30"
              >
                <span className="text-2xl">{f.icon}</span>
                <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-sm text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-20">
          <h2 className="mb-8 text-center text-2xl font-semibold text-white">
            Wall of love
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <blockquote
                key={t.name}
                className="rounded-xl border border-white/10 bg-white/5 p-6"
              >
                <p className="text-sm leading-relaxed text-gray-300">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <footer className="mt-4 border-t border-white/10 pt-4">
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}</p>
                </footer>
              </blockquote>
            ))}
          </div>
        </section>

        <p className="mb-8 text-center text-sm text-gray-500">
          Need a demo or trial session?{" "}
          <Link href="/contact" className="text-accent hover:underline">
            Contact us
          </Link>
        </p>
      </div>

      <LandingFooter />
    </main>
  );
}
