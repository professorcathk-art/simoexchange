import LandingPage from "@/components/LandingPage";

// Never statically cache the landing page — avoids stale dashboard HTML on CDN
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HomePage() {
  return <LandingPage />;
}
