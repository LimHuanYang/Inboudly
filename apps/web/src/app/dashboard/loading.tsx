import { PageLoader } from '@/components/ui/spinner';

// Wraps the dashboard area so the sidebar stays visible while a sub-route
// loads. Next.js streams this in automatically — no manual wiring needed.
export default function DashboardLoading() {
  return (
    <div className="container py-8">
      <PageLoader
        label="Preparing your workspace…"
        hint="First visit to each section compiles in a few seconds. After that it's instant."
      />
    </div>
  );
}
