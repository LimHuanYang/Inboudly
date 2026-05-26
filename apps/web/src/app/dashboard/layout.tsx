import Link from 'next/link';
import {
  LayoutDashboard,
  Sparkles,
  Calendar,
  Image as ImageIcon,
  MessageSquare,
  BarChart3,
  Settings,
  Wand2,
  CheckCircle2,
  Users,
  Target,
  Radar,
  Compass,
  Clapperboard,
} from 'lucide-react';
import { WorkspaceGuard } from '@/components/providers/workspace-guard';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/composer', label: 'Composer', icon: Sparkles },
  { href: '/dashboard/repurpose', label: 'Repurpose', icon: Wand2 },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/approvals', label: 'Approvals', icon: CheckCircle2 },
  { href: '/dashboard/kol', label: 'KOL Discovery', icon: Users },
  { href: '/dashboard/competitors', label: 'Competitors', icon: Target }, // Phase 2A.2
  { href: '/dashboard/trends', label: 'Trend Radar', icon: Radar }, // Phase 2A.3
  { href: '/dashboard/niches', label: 'Niche Intelligence', icon: Compass }, // Phase 2A.4
  { href: '/dashboard/videos', label: 'Faceless Videos', icon: Clapperboard }, // Phase 2B
  { href: '/dashboard/media', label: 'Media', icon: ImageIcon },
  { href: '/dashboard/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceGuard>
      <div className="flex min-h-screen">
        <aside className="w-60 border-r bg-secondary/20 p-4">
          <Link href="/dashboard" className="mb-8 flex items-center gap-2 px-2 font-semibold">
            <span className="inline-block h-7 w-7 rounded-md bg-primary" />
            <span>Inboudly</span>
          </Link>
          <nav className="space-y-1">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </WorkspaceGuard>
  );
}
