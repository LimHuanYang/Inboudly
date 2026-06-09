'use client';

import { Home, Bell, Cpu, SlidersHorizontal, CreditCard } from 'lucide-react';

export type SectionId = 'workspace' | 'social' | 'providers' | 'defaults' | 'billing';

interface NavItem {
  id: SectionId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'workspace', label: 'Workspace', icon: Home },
  { id: 'social', label: 'Social accounts', icon: Bell },
  { id: 'providers', label: 'AI providers', icon: Cpu },
  { id: 'defaults', label: 'AI defaults', icon: SlidersHorizontal },
  { id: 'billing', label: 'Billing & currency', icon: CreditCard },
];

interface SettingsNavProps {
  active: SectionId;
  onSelect: (s: SectionId) => void;
  attentionCount: number;
}

export function SettingsNav({ active, onSelect, attentionCount }: SettingsNavProps) {
  return (
    <nav aria-label="Settings sections">
      {/* lg: vertical rail heading */}
      <p className="hidden lg:block px-2.5 pb-2 text-sm font-bold text-foreground">Settings</p>

      {/* lg: flex-col rail | below lg: horizontal scrollable row */}
      <div className="flex overflow-x-auto lg:flex-col gap-0.5 pb-1 lg:pb-0">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          const showBadge = id === 'social' && attentionCount > 0;

          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={
                showBadge
                  ? `${label}, ${attentionCount} account(s) need attention`
                  : label
              }
              className={[
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left whitespace-nowrap',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground font-normal',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <Icon
                className={[
                  'h-[15px] w-[15px] flex-none',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                ].join(' ')}
              />
              <span className="text-[13px] flex-1 min-w-0">{label}</span>
              {showBadge && (
                <span
                  role="status"
                  aria-label={`${attentionCount} account(s) need attention`}
                  className="flex-none inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-amber-500 text-white text-[10.5px] font-extrabold leading-none"
                >
                  {attentionCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
