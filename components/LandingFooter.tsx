import Link from "next/link";

export default function LandingFooter() {
  return (
    <footer className="border-t border-white/10 bg-black/20">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-white">SimoExchange</p>
          <p className="mt-1 text-sm text-gray-500">
            Real-time multilingual interpretation for live events
          </p>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm text-gray-400">
          <Link href="/contact" className="hover:text-accent">
            Contact
          </Link>
          <Link href="/privacy" className="hover:text-accent">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-accent">
            Terms of Use
          </Link>
        </nav>
      </div>
      <p className="pb-6 text-center text-xs text-gray-600">
        © {new Date().getFullYear()} SimoExchange. All rights reserved.
      </p>
    </footer>
  );
}
