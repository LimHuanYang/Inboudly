'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { SettingsNav, type SectionId } from './settings-nav';
import { SocialAccountsSection } from './social-accounts-section';
import { AiProvidersCard } from './ai-providers-card';
import { AiDefaultsCard } from './ai-defaults-card';
import { CurrencyCard } from './currency-card';

// ── helpers ──────────────────────────────────────────────────────────────────

const SECTION_IDS: SectionId[] = ['workspace', 'social', 'providers', 'defaults', 'billing'];

function isSectionId(v: string): v is SectionId {
  return (SECTION_IDS as string[]).includes(v);
}

function readHashSection(): SectionId {
  if (typeof window === 'undefined') return 'social';
  const hash = window.location.hash.replace('#', '');
  return isSectionId(hash) ? hash : 'social';
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>('social');

  // Initialise from hash on mount and keep hash in sync
  useEffect(() => {
    setSection(readHashSection());
  }, []);

  const handleSelect = (s: SectionId) => {
    setSection(s);
    window.history.replaceState(null, '', `#${s}`);
  };

  // ── workspace / user data ────────────────────────────────────────────────
  const me = useQuery({ queryKey: ['me'], queryFn: () => api.get<any>('/auth/me') });

  const workspaceId: string | undefined = me.data?.memberships?.[0]?.workspace?.id;
  const workspaceName: string | undefined = me.data?.memberships?.[0]?.workspace?.name;
  const workspaceCurrency: string | undefined =
    me.data?.memberships?.[0]?.workspace?.currency;

  // ── social accounts — only to compute attentionCount ────────────────────
  // SocialAccountsSection queries the same key; TanStack deduplicates the request.
  const accounts = useQuery({
    queryKey: ['social-accounts', workspaceId],
    queryFn: () => api.get<{ status: string }[]>(`/social-accounts?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });

  const attentionCount =
    accounts.data?.filter((a) => a.status === 'PENDING_REAUTH').length ?? 0;

  // ── no workspace yet guard ───────────────────────────────────────────────
  if (me.data && !workspaceId) {
    return (
      <div className="container max-w-3xl py-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          You don&apos;t have a workspace yet. Create one to continue.
        </p>
      </div>
    );
  }

  // ── layout ───────────────────────────────────────────────────────────────
  return (
    <div className="container max-w-5xl py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        {workspaceName && (
          <p className="text-sm text-muted-foreground">{workspaceName}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* ── left: nav rail ─────────────────────────────────────────────── */}
        <SettingsNav
          active={section}
          onSelect={handleSelect}
          attentionCount={attentionCount}
        />

        {/* ── right: active section pane ─────────────────────────────────── */}
        <div>
          {section === 'workspace' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Workspace</h2>
                <p className="text-sm text-muted-foreground">
                  Identity and money formatting for this workspace.
                </p>
              </div>
              <Card>
                <CardContent className="pt-6 space-y-0">
                  <div className="flex justify-between border-b py-3 text-sm">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-semibold">{workspaceName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between border-b py-3 text-sm">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-semibold">{me.data?.email ?? '—'}</span>
                  </div>
                  <div className="flex justify-between py-3 text-sm">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-semibold">
                      {me.data?.memberships?.[0]?.workspace?.tenant?.plan ?? 'Free'}
                    </span>
                  </div>
                  <div className="pt-4">
                    <Button variant="outline" asChild>
                      <Link href="/sign-in">Sign out</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
              {workspaceId && (
                <CurrencyCard
                  workspaceId={workspaceId}
                  currentCurrency={workspaceCurrency}
                />
              )}
            </div>
          )}

          {section === 'social' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Social accounts</h2>
                <p className="text-sm text-muted-foreground">
                  Connect the platforms you publish to. Each platform appears once — connect,
                  reconnect, or disconnect inline.
                </p>
              </div>
              {workspaceId && <SocialAccountsSection workspaceId={workspaceId} />}
            </div>
          )}

          {section === 'providers' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">AI providers</h2>
                <p className="text-sm text-muted-foreground">
                  Bring your own keys — encrypted at rest, you pay each provider directly.
                </p>
              </div>
              {workspaceId && <AiProvidersCard workspaceId={workspaceId} />}
            </div>
          )}

          {section === 'defaults' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">AI defaults</h2>
                <p className="text-sm text-muted-foreground">
                  Which engine runs each task. Only providers you have a key for are selectable.
                </p>
              </div>
              {workspaceId && <AiDefaultsCard workspaceId={workspaceId} />}
            </div>
          )}

          {section === 'billing' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Billing &amp; currency</h2>
                <p className="text-sm text-muted-foreground">
                  Workspace currency used for RPM estimates and money display.
                </p>
              </div>
              {workspaceId && (
                <CurrencyCard
                  workspaceId={workspaceId}
                  currentCurrency={workspaceCurrency}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
