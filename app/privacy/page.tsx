import Link from "next/link";
import LandingFooter from "@/components/LandingFooter";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="prose prose-invert mx-auto max-w-3xl px-4 py-16 prose-headings:text-white prose-p:text-gray-400">
        <Link href="/" className="text-sm text-gray-400 no-underline hover:text-accent">
          ← Back
        </Link>
        <h1 className="mt-6">Privacy Policy</h1>
        <p className="text-sm text-gray-500">Last updated: June 2026</p>

        <h2>Overview</h2>
        <p>
          SimoExchange (&quot;we&quot;, &quot;our&quot;) provides real-time speech translation
          services. This policy describes how we handle information when you use our
          platform.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>Session metadata (name, language settings, timestamps)</li>
          <li>Transcript text generated during live sessions</li>
          <li>Audio recordings and translated speech audio stored for session backup</li>
          <li>Technical logs required to operate the service</li>
        </ul>

        <h2>How we use information</h2>
        <p>
          Data is used solely to deliver live translation, generate transcripts,
          and maintain session archives. We do not sell personal data to third
          parties.
        </p>

        <h2>Third-party services</h2>
        <p>
          We use speech recognition, translation, and text-to-speech providers
          (including Deepgram, AIML/OpenAI, and ElevenLabs) to process audio and
          text. Data sent to these providers is limited to what is required for
          translation.
        </p>

        <h2>Data retention</h2>
        <p>
          Session transcripts and recordings are retained until deleted by the
          session host or administrator. You may request deletion by contacting us.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions:{" "}
          <a href="mailto:chris.lau@professor-cat.com">chris.lau@professor-cat.com</a>
        </p>
      </div>
      <LandingFooter />
    </main>
  );
}
