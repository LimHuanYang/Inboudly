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
// Brand icon chips
// ---------------------------------------------------------------------------

// Official brand-mark PNGs (each provides its own brand-correct background shape).
// Rendered standalone at 38×38 with object-contain — no chip wrapper.
const OFFICIAL_PNG: Partial<Record<Platform, string>> = {
  YOUTUBE: '/brand/yt_icon_red.png',
  REDNOTE: '/brand/rednote_icon.png',
  PINTEREST: '/brand/pinterest_icon.png',
  FACEBOOK: '/brand/facebook_icon.png',
};

// Inline SVG paths from simple-icons (CC0). Rendered in white on the brand-colored chip.
// We keep these as raw paths (not a runtime dep) so there's no bundle overhead.
const BRAND_GLYPH: Record<Exclude<Platform, 'YOUTUBE' | 'REDNOTE'>, string> = {
  INSTAGRAM:
    'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z',
  TIKTOK:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  FACEBOOK:
    'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  LINKEDIN:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  PINTEREST:
    'M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.748-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z',
};

const BRAND_BG: Record<Exclude<Platform, 'YOUTUBE'>, string> = {
  INSTAGRAM: 'linear-gradient(45deg, #f09433, #dc2743, #bc1888)',
  TIKTOK: '#000',
  FACEBOOK: '#1877F2',
  LINKEDIN: '#0A66C2',
  PINTEREST: '#E60023',
  REDNOTE: '#FF2442',
};

/** Returns a 38×38 chip with the platform brand colour + icon. */
function PlatformChip({ platform }: { platform: Platform }) {
  // YouTube / RedNote / Pinterest ship their full brand mark as a PNG.
  // Render standalone (no chip wrapper) since the PNG provides its own
  // brand-correct shape + background.
  const pngSrc = OFFICIAL_PNG[platform];
  if (pngSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pngSrc}
        alt=""
        aria-hidden="true"
        className="h-[38px] w-[38px] flex-none select-none object-contain"
      />
    );
  }

  // The remaining 4 (Instagram, TikTok, Facebook, LinkedIn) use a brand-color
  // chip + white glyph (simple-icons SVG paths).
  const chipCls =
    'flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[10px] text-white select-none';
  const bg = BRAND_BG[platform as Exclude<Platform, 'YOUTUBE'>];
  const glyph = BRAND_GLYPH[platform as Exclude<Platform, 'YOUTUBE' | 'REDNOTE'>];
  return (
    <span className={chipCls} style={{ background: bg }} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="white">
        <path d={glyph} />
      </svg>
    </span>
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
