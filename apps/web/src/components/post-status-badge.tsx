import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusVariant = 'secondary' | 'info' | 'success' | 'warning' | 'danger';

interface StatusMeta {
  label: string;
  variant: StatusVariant;
  Icon: LucideIcon;
  spin?: boolean;
  /** Tailwind bg-* for the status dot / accent (literal so JIT keeps it). */
  dotClass: string;
  /** Tailwind border-* for the left accent on calendar chips. */
  borderClass: string;
  /** Tailwind faint bg tint for calendar chips. */
  tintClass: string;
}

/**
 * Single source of truth for how a PostStatus is shown across the app.
 * Mirrors the Prisma `PostStatus` enum (incl. PARTIALLY_PUBLISHED).
 * Every status pairs an icon + label with colour — never colour alone (color-not-only).
 */
const STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: 'Draft', variant: 'secondary', Icon: FileText, dotClass: 'bg-slate-400', borderClass: 'border-slate-400', tintClass: 'bg-slate-400/10' },
  PENDING_APPROVAL: { label: 'Pending approval', variant: 'warning', Icon: Clock, dotClass: 'bg-amber-500', borderClass: 'border-amber-500', tintClass: 'bg-amber-500/10' },
  APPROVED: { label: 'Approved', variant: 'info', Icon: Check, dotClass: 'bg-blue-500', borderClass: 'border-blue-500', tintClass: 'bg-blue-500/10' },
  SCHEDULED: { label: 'Scheduled', variant: 'info', Icon: CalendarClock, dotClass: 'bg-blue-500', borderClass: 'border-blue-500', tintClass: 'bg-blue-500/10' },
  PUBLISHING: { label: 'Publishing…', variant: 'info', Icon: Loader2, spin: true, dotClass: 'bg-blue-500', borderClass: 'border-blue-500', tintClass: 'bg-blue-500/10' },
  PUBLISHED: { label: 'Published', variant: 'success', Icon: CheckCircle2, dotClass: 'bg-emerald-500', borderClass: 'border-emerald-500', tintClass: 'bg-emerald-500/10' },
  PARTIALLY_PUBLISHED: { label: 'Partly published', variant: 'warning', Icon: AlertTriangle, dotClass: 'bg-amber-500', borderClass: 'border-amber-500', tintClass: 'bg-amber-500/10' },
  FAILED: { label: 'Failed', variant: 'danger', Icon: XCircle, dotClass: 'bg-red-500', borderClass: 'border-red-500', tintClass: 'bg-red-500/10' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary', Icon: Ban, dotClass: 'bg-slate-400', borderClass: 'border-slate-400', tintClass: 'bg-slate-400/10' },
};

function humanize(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function getStatusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: humanize(status),
      variant: 'secondary',
      Icon: FileText,
      dotClass: 'bg-slate-400',
      borderClass: 'border-slate-400',
      tintClass: 'bg-slate-400/10',
    }
  );
}

/** Full pill: icon + label + semantic colour. */
export function PostStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = getStatusMeta(status);
  const { Icon } = meta;
  return (
    <Badge variant={meta.variant} className={cn('gap-1 whitespace-nowrap', className)}>
      <Icon className={cn('h-3 w-3', meta.spin && 'animate-spin')} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

/** Compact colour dot for dense surfaces (e.g. calendar cells); label exposed to SR/tooltip. */
export function PostStatusDot({ status, className }: { status: string; className?: string }) {
  const meta = getStatusMeta(status);
  return (
    <span
      role="img"
      aria-label={meta.label}
      title={meta.label}
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        meta.dotClass,
        status === 'PUBLISHING' && 'animate-pulse',
        className,
      )}
    />
  );
}
