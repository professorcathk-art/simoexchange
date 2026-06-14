import Link from "next/link";
import LandingFooter from "@/components/LandingFooter";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Link href="/" className="text-sm text-gray-400 hover:text-accent">
          ← Back
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-white">Contact</h1>
        <p className="mt-4 text-gray-400">
          Questions, demo requests, or trial session bookings — we&apos;d love to hear
          from you.
        </p>

        <div className="mt-10 rounded-xl border border-white/10 bg-card p-8">
          <p className="text-sm text-gray-500">Email</p>
          <a
            href="mailto:chris.lau@professor-cat.com"
            className="mt-2 block text-xl font-medium text-accent hover:underline"
          >
            chris.lau@professor-cat.com
          </a>
          <p className="mt-6 text-sm text-gray-400">
            Typical response within 1–2 business days. Include your event date,
            languages needed, and expected audience size for the fastest quote.
          </p>
        </div>
      </div>
      <LandingFooter />
    </main>
  );
}
