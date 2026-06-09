# Settings Redesign Implementation Plan

> superpowers:subagent-driven-development. Frontend-only. Visual spec = `docs/settings-redesign-ui-design.html` (open it). Branch: `feat/settings-redesign`.

**Goal:** Rebuild `dashboard/settings` as a two-pane layout (section rail + focused pane): Workspace · Social accounts · AI providers · AI defaults · Billing. Unify the connect UI (one row per platform), collapse AI-provider key forms, keep all existing data + actions.

**Stack:** Next.js 15 + Tailwind + shadcn/ui + lucide + TanStack Query v5 + sonner. Use the app's `api` client (`@/lib/api-client`) for all calls.

**Current files:** `apps/web/src/app/dashboard/settings/page.tsx` (me + accounts queries, inline connect UI, renders AiProvidersCard/AiDefaultsCard/CurrencyCard) · `ai-providers-card.tsx` · `ai-defaults-card.tsx` · `currency-card.tsx`.

**Target architecture:**
- `page.tsx` — shell: owns section state + `me`/`accounts` queries; renders `<SettingsNav>` + the active section. The Workspace/Billing section is inline here (workspace name/plan rows + reuse `<CurrencyCard>`).
- `settings-nav.tsx` (new) — the rail/tabs.
- `social-accounts-section.tsx` (new) — unified connect list (R1).
- `ai-providers-card.tsx` — refactor internals to collapsible rows (R2); keep `export function AiProvidersCard({ workspaceId })`.
- `ai-defaults-card.tsx`, `currency-card.tsx` — reused unchanged.

---

## R1: SocialAccountsSection (new component)
**File:** Create `apps/web/src/app/dashboard/settings/social-accounts-section.tsx`
- [ ] `export function SocialAccountsSection({ workspaceId }: { workspaceId: string })`.
- Query `api.get<SocialAccount[]>('/social-accounts?workspaceId=' + workspaceId)` (key `['social-accounts', workspaceId]`). `SocialAccount = { id, platform, handle, status, tokenExpiresAt }`.
- The 7 platforms: `INSTAGRAM, TIKTOK, REDNOTE, YOUTUBE, FACEBOOK, LINKEDIN, PINTEREST`. Build a unified list: for each platform, find its account (if any). Render ONE row per platform, grouped into **Connected** (status ACTIVE), **Needs attention** (status PENDING_REAUTH), **Available** (no account / DISCONNECTED). Show a group label with count per the mockup; omit empty groups.
- Row = brand-icon chip (lucide where available: `Youtube`, `Facebook`, `Linkedin`; Instagram/TikTok/RedNote/Pinterest use a lettered/colored chip or lucide fallback) + name + sub + action:
  - ACTIVE → green "Connected" (Check icon) + handle + **Disconnect** (ghost button, confirm() before calling `api.delete('/social-accounts/' + account.id)`, then invalidate the query + toast).
  - PENDING_REAUTH → amber "Reconnect needed · access expired" (AlertTriangle) + **Reconnect** (amber) → `startConnect(platform)`.
  - none → "Not connected" + **Connect** (primary) → `startConnect(platform)`.
- `startConnect(platform)`: reuse the authed-fetch + popup pattern (it already exists in page.tsx — copy it): open `about:blank` popup → `api.get<{url:string}>('/oauth/' + slug + '/start?workspaceId=' + workspaceId)` → `popup.location.href = url` (fallback `window.location`) → catch → close popup + `toast.error`. Slug map: lowercase platform.
- Use brand colors on the icon chip only; status uses icon+text+color; all buttons have `aria-label`; ≥40px touch targets. Match the mockup rows.
- [ ] `pnpm --filter @inboudly/web type-check` clean. **No commit.**

## R2: AiProvidersCard → collapsible rows
**File:** Modify `apps/web/src/app/dashboard/settings/ai-providers-card.tsx`
- [ ] Keep ALL existing logic (queries, saveKey/saveModelOnly/deleteKey/testKey mutations, PROVIDERS meta). Only change the per-provider rendering to a **collapsible row**:
  - Collapsed (default) summary = a category tag (Text/Image/Voice/Video — derive: anthropic/gemini=Text, openai=Image, elevenLabs=Voice, pollinations=Video) + provider name + status (`✓ Configured · ····last4` green / `Not configured` muted) + a chevron. Clicking toggles expansion (local `useState<Record<ProviderId, boolean>>`); default-expanded any provider that is NOT configured so first-time setup is visible, collapse configured ones.
  - Expanded body = the EXISTING key input + model select + Save + Test/Clear + get-key link (unchanged markup/handlers), shown under the summary.
- Keep the resolver-order description in the CardHeader. Selects must not overlap their arrow (the mockup uses `appearance-none` + a chevron + right padding — apply the same to the model `<select>`).
- [ ] type-check clean. **No commit.**

## R3: Shell + nav + Workspace/Billing (integration)
**Files:** Rewrite `apps/web/src/app/dashboard/settings/page.tsx`; Create `settings-nav.tsx`
- [ ] `settings-nav.tsx`: `export function SettingsNav({ active, onSelect, attentionCount }: { active: string; onSelect: (s: string) => void; attentionCount: number })`. Sections: `workspace` (Home), `social` (Bell), `providers` (Cpu/Sparkles), `defaults` (SlidersHorizontal), `billing` (CreditCard) — lucide icons. Compact rows (per the mockup: ~13px label, 15px icon, tight padding, active = indigo tint + `text-primary`). On `social`, if `attentionCount > 0` show a compact amber count badge (aria-label `${attentionCount} account(s) need attention`). Desktop (`lg:`) = vertical rail in a left column; below `lg` = horizontal scrollable tab strip. Buttons (not links) calling `onSelect`; `aria-current` on active.
- [ ] `page.tsx`: `'use client'`. Keep the `me` query (workspace id/name/currency) + an `accounts` query (for the attention badge count = accounts with status `PENDING_REAUTH`). Local `useState` for active section (default `'social'`); optionally sync to `location.hash` for deep-linking. Layout: `grid lg:grid-cols-[220px_1fr] gap-6`, left = `<SettingsNav>`, right = the active section:
  - `workspace` → a card with workspace **Name** + **Plan** rows (read-only from `me`) + `<CurrencyCard workspaceId currentCurrency={currency} />`.
  - `social` → `<SocialAccountsSection workspaceId />`.
  - `providers` → `<AiProvidersCard workspaceId />`.
  - `defaults` → `<AiDefaultsCard workspaceId />`.
  - `billing` → `<CurrencyCard ... />` (or merge billing into workspace — keep `billing` as currency for now).
  Each section gets a title + one-line description (per the mockup panes). Remove the old inline connect list + connect-buttons row (now in SocialAccountsSection). Keep the "create workspace" guard if present.
- [ ] type-check clean. **No commit.**

## R4: Validation
- [ ] Stop dev servers; `pnpm --filter @inboudly/web type-check` + `pnpm --filter @inboudly/web build` green. (API unchanged.) Then final review + merge.

## Self-Review
Covers: shell+nav (R3) ✓, unified social list (R1) ✓, collapsible providers (R2) ✓, workspace/billing + defaults reused (R3) ✓. Contracts: `SocialAccountsSection({workspaceId})`, `AiProvidersCard({workspaceId})` (unchanged), `SettingsNav({active,onSelect,attentionCount})`. All data/actions preserved; only structure + the connect UX change. `startConnect` uses the authed-fetch popup (the just-merged fix) — don't regress to raw window.open.
