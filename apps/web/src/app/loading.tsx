import { FullScreenLoader } from '@/components/ui/spinner';

// Shown automatically by Next.js whenever a route segment is being compiled
// or its data is being fetched. Sits underneath your page, so the layout
// stays put while the page content swaps in.
export default function RootLoading() {
  return <FullScreenLoader />;
}
