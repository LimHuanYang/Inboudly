'use client';

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SocialAccount {
  id: string;
  platform: string;
  handle: string;
  status: string;
  tokenExpiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORMS = [
  'INSTAGRAM',
  'TIKTOK',
  'REDNOTE',
  'YOUTUBE',
  'FACEBOOK',
  'LINKEDIN',
  'PINTEREST',
] as const;

type Platform = (typeof PLATFORMS)[number];

const PLATFORM_LABEL: Record<Platform, string> = {
  INSTAGRAM: 'Instagram',
  TIKTOK: 'TikTok',
  REDNOTE: 'RedNote',
  YOUTUBE: 'YouTube',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  PINTEREST: 'Pinterest',
};

// ---------------------------------------------------------------------------
// Brand icon chips — all 7 platforms use their official brand-mark PNG.
// ---------------------------------------------------------------------------

const OFFICIAL_PNG: Record<Platform, string> = {
  YOUTUBE: '/brand/yt_icon_red.png',
  FACEBOOK: '/brand/facebook_icon.png',
  INSTAGRAM: '/brand/instagram_icon.png',
  TIKTOK: '/brand/tiktok_icon.png',
  LINKEDIN: '/brand/linkedin_icon.png',
  PINTEREST: '/brand/pinterest_icon.png',
  REDNOTE: '/brand/rednote_icon.png',
};

/** 38×38 official brand mark. Each PNG ships its own brand-correct shape. */
function PlatformChip({ platform }: { platform: Platform }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={OFFICIAL_PNG[platform]}
      alt=""
      aria-hidden="true"
      className="h-[38px] w-[38px] flex-none select-none object-contain"
    />
  );
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

interface ConnectedRowProps {
  platform: Platform;
  account: SocialAccount;
  onDisconnect: (id: string) => void;
  disconnecting: boolean;
}

function ConnectedRow({ platform, account, onDisconnect, disconnecting }: ConnectedRowProps) {
  const label = PLATFORM_LABEL[platform];
  return (
    <li className="flex items-center gap-3 rounded-[11px] border border-border px-[13px] py-[11px] bg-card">
      <PlatformChip platform={platform} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold leading-tight">
          {account.handle}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
      </div>
      {/* Status: icon + text + colour — never colour alone */}
      <span
        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400"
        aria-label="Connected"
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Connected
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="min-h-[40px] flex-none border border-border"
        aria-label={`Disconnect ${label}`}
        disabled={disconnecting}
        onClick={() => {
          if (window.confirm(`Disconnect ${label}?`)) {
            onDisconnect(account.id);
          }
        }}
      >
        Disconnect
      </Button>
    </li>
  );
}

interface NeedsAttentionRowProps {
  platform: Platform;
  account: SocialAccount;
  onReconnect: (platform: string) => void;
}

function NeedsAttentionRow({ platform, account, onReconnect }: NeedsAttentionRowProps) {
  const label = PLATFORM_LABEL[platform];
  return (
    <li
      role="alert"
      className="flex items-center gap-3 rounded-[11px] border border-amber-300 bg-amber-50 px-[13px] py-[11px] dark:border-amber-700/60 dark:bg-amber-950/30"
    >
      <PlatformChip platform={platform} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold leading-tight">
          {account.handle}
          {/* Status: icon + text + colour — never colour alone */}
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
            aria-label="Reconnect needed"
          >
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Reconnect needed
          </span>
        </div>
        <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
          {label} · access expired
        </div>
      </div>
      <Button
        size="sm"
        className="min-h-[40px] flex-none bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400"
        aria-label={`Reconnect ${label}`}
        onClick={() => onReconnect(platform)}
      >
        ↻ Reconnect
      </Button>
    </li>
  );
}

interface AvailableRowProps {
  platform: Platform;
  onConnect: (platform: string) => void;
}

function AvailableRow({ platform, onConnect }: AvailableRowProps) {
  const label = PLATFORM_LABEL[platform];
  return (
    <li className="flex items-center gap-3 rounded-[11px] border border-border px-[13px] py-[11px] bg-card">
      <PlatformChip platform={platform} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">{label}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">Not connected</div>
      </div>
      <Button
        size="sm"
        className="min-h-[40px] flex-none"
        aria-label={`Connect ${label}`}
        onClick={() => onConnect(platform)}
      >
        Connect
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Group label
// ---------------------------------------------------------------------------

function GroupLabel({ text, count }: { text: string; count: number }) {
  return (
    <li
      className="mt-4 first:mt-0 text-[11px] font-bold uppercase tracking-[0.05em] text-muted-foreground"
      aria-label={`${text} — ${count} platform${count !== 1 ? 's' : ''}`}
    >
      {text} · {count}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function RowSkeleton() {
  return (
    <li className="flex items-center gap-3 rounded-[11px] border border-border px-[13px] py-[11px]">
      <div className="h-[38px] w-[38px] flex-none rounded-[10px] animate-pulse bg-muted" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
        <div className="h-2.5 w-20 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-[38px] w-20 animate-pulse rounded-lg bg-muted" />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SocialAccountsSection({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['social-accounts', workspaceId],
    queryFn: () => api.get<SocialAccount[]>(`/social-accounts?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  // Listen for postMessage from the OAuth popup callback so the row
  // updates the moment the user finishes consent, without a manual refresh.
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { type?: string; platform?: string; message?: string } | null;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'inboudly:oauth:success') {
        qc.invalidateQueries({ queryKey: ['social-accounts', workspaceId] });
        toast.success(`${d.platform ?? 'Account'} connected`);
      } else if (d.type === 'inboudly:oauth:error') {
        toast.error(`Couldn't connect ${d.platform ?? 'account'}: ${d.message ?? 'unknown error'}`);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [qc, workspaceId]);

  const disconnect = useMutation({
    mutationFn: (id: string) => api.delete(`/social-accounts/${id}`),
    onSuccess: () => {
      toast.success('Disconnected');
      qc.invalidateQueries({ queryKey: ['social-accounts', workspaceId] });
    },
    onError: (e: Error) => {
      toast.error(`Failed to disconnect: ${e.message}`);
    },
  });

  // Open the popup synchronously (inside the click handler) so the browser
  // doesn't block it, then navigate it to the consent URL once we have it.
  // We MUST fetch /start through the authed api client — it's behind the
  // Supabase guard, so a bare window.open (no Bearer header) gets a 401.
  const startConnect = async (platform: string) => {
    if (!workspaceId) return;
    const slug = platform.toLowerCase();
    const popup = window.open('about:blank', 'inboudly_oauth', 'width=600,height=700');
    try {
      const { url } = await api.get<{ url: string; state: string }>(
        `/oauth/${slug}/start?workspaceId=${workspaceId}`,
      );
      if (popup) popup.location.href = url;
      else window.location.href = url; // popup blocked → full-page redirect
    } catch (e) {
      popup?.close();
      toast.error(`Couldn't start ${platform} connection: ${(e as Error).message}`);
    }
  };

  // ---------------------------------------------------------------------------
  // If no workspaceId yet — render a compact skeleton
  // ---------------------------------------------------------------------------

  if (!workspaceId || isLoading) {
    return (
      <ul className="flex flex-col gap-2" aria-label="Social accounts loading">
        {[0, 1, 2].map((i) => (
          <RowSkeleton key={i} />
        ))}
      </ul>
    );
  }

  // ---------------------------------------------------------------------------
  // Partition platforms into three groups
  // ---------------------------------------------------------------------------

  const connected: Platform[] = [];
  const needsAttention: Platform[] = [];
  const available: Platform[] = [];

  const accountByPlatform = new Map<string, SocialAccount>();
  for (const acct of accounts ?? []) {
    accountByPlatform.set(acct.platform, acct);
  }

  for (const platform of PLATFORMS) {
    const acct = accountByPlatform.get(platform);
    if (!acct || acct.status === 'DISCONNECTED') {
      available.push(platform);
    } else if (acct.status === 'ACTIVE') {
      connected.push(platform);
    } else if (acct.status === 'PENDING_REAUTH') {
      needsAttention.push(platform);
    } else {
      // Unknown status — treat as available so there's always an action
      available.push(platform);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <ul className="flex flex-col gap-2" aria-label="Social accounts">
      {/* ── Connected ─────────────────────────────── */}
      {connected.length > 0 && (
        <>
          <GroupLabel text="Connected" count={connected.length} />
          {connected.map((platform) => {
            const acct = accountByPlatform.get(platform)!;
            return (
              <ConnectedRow
                key={platform}
                platform={platform}
                account={acct}
                onDisconnect={(id) => disconnect.mutate(id)}
                disconnecting={disconnect.isPending}
              />
            );
          })}
        </>
      )}

      {/* ── Needs attention ───────────────────────── */}
      {needsAttention.length > 0 && (
        <>
          <GroupLabel text="Needs attention" count={needsAttention.length} />
          {needsAttention.map((platform) => {
            const acct = accountByPlatform.get(platform)!;
            return (
              <NeedsAttentionRow
                key={platform}
                platform={platform}
                account={acct}
                onReconnect={startConnect}
              />
            );
          })}
        </>
      )}

      {/* ── Available ─────────────────────────────── */}
      {available.length > 0 && (
        <>
          <GroupLabel text="Available" count={available.length} />
          {available.map((platform) => (
            <AvailableRow key={platform} platform={platform} onConnect={startConnect} />
          ))}
        </>
      )}

      {/* Edge case: all data loaded, zero rows from any group */}
      {connected.length === 0 && needsAttention.length === 0 && available.length === 0 && (
        <li className="py-3 text-sm text-muted-foreground">No platforms available.</li>
      )}
    </ul>
  );
}
