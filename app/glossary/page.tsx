import Link from "next/link";
import GlossaryManager from "@/components/GlossaryManager";

export default function GlossaryPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <Link href="/" className="text-sm text-gray-400 hover:text-accent">
          ← Home
        </Link>
        <div className="mt-4">
          <GlossaryManager />
        </div>
      </div>
    </main>
  );
}
