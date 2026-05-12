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
} from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/dashboard/composer', label: 'Composer', icon: Sparkles },
  { href: '/dashboard/repurpose', label: 'Repurpose', icon: Wand2 },
  { href: '/dashboard/calendar', label: 'Calendar', icon: Calendar },
  { href: '/dashboard/media', label: 'Media', icon: ImageIcon },
  { href: '/dashboard/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
