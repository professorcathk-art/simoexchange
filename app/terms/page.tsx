import Link from "next/link";
import LandingFooter from "@/components/LandingFooter";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="prose prose-invert mx-auto max-w-3xl px-4 py-16 prose-headings:text-white prose-p:text-gray-400">
        <Link href="/" className="text-sm text-gray-400 no-underline hover:text-accent">
          ← Back
        </Link>
        <h1 className="mt-6">Terms of Use</h1>
        <p className="text-sm text-gray-500">Last updated: June 2026</p>

        <h2>Acceptance</h2>
        <p>
          By accessing SimoExchange you agree to these terms. If you do not agree,
          do not use the service.
        </p>

        <h2>Service description</h2>
        <p>
          SimoExchange provides real-time multilingual speech translation for live
          events. Translation quality depends on audio clarity, network conditions,
          and third-party AI services. We do not guarantee word-perfect accuracy
          for legal, medical, or safety-critical use without human review.
        </p>

        <h2>Acceptable use</h2>
        <ul>
          <li>Use the platform only for lawful purposes</li>
          <li>Do not attempt to bypass access controls or abuse API resources</li>
          <li>Obtain consent from speakers and audiences where recording laws apply</li>
        </ul>

        <h2>Intellectual property</h2>
        <p>
          You retain ownership of your session content. We retain rights to the
          SimoExchange platform, branding, and underlying technology.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          SimoExchange is provided &quot;as is&quot;. We are not liable for indirect,
          incidental, or consequential damages arising from use of the service.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:chris.lau@professor-cat.com">chris.lau@professor-cat.com</a>
        </p>
      </div>
      <LandingFooter />
    </main>
  );
}
