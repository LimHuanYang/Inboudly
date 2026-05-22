import { PageLoader } from '@/components/ui/spinner';

export default function ComposerLoading() {
  return (
    <div className="container py-8">
      <PageLoader
        label="Loading composer…"
        hint="Wiring up Claude/Gemini, virality model, and per-platform algorithm coaches."
      />
    </div>
  );
}
