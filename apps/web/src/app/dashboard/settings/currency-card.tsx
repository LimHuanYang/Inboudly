'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Coins } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CURRENCIES, getCurrency, formatCurrency } from '@/lib/currencies';

export function CurrencyCard({
  workspaceId,
  currentCurrency,
}: {
  workspaceId: string;
  currentCurrency: string | null | undefined;
}) {
  const qc = useQueryClient();
  const saved = currentCurrency ?? 'USD';
  const [selected, setSelected] = useState(saved);

  // Keep the dropdown in sync if the workspace currency loads/changes upstream.
  useEffect(() => setSelected(saved), [saved]);

  const update = useMutation({
    mutationFn: () => api.patch(`/workspaces/${workspaceId}`, { currency: selected }),
    onSuccess: () => {
      toast.success(`Currency set to ${selected}`);
      // Refresh /auth/me so the new workspace currency propagates everywhere.
      qc.invalidateQueries({ queryKey: ['me'] });
      // Niche analyses are currency-stamped; bust their cache so the next
      // view re-formats / re-analyses in the new currency.
      qc.invalidateQueries({ queryKey: ['niches', workspaceId] });
    },
    onError: (err: any) => toast.error(err.message ?? 'Failed to update currency'),
  });

  const dirty = selected !== saved;
  const sample = getCurrency(selected);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-4 w-4" /> Currency
        </CardTitle>
        <CardDescription>
          Workspace currency for money displays. Niche Intelligence estimates RPM
          natively in this currency (no conversion) — change it and re-analyse to
          see figures in your market.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-medium">Currency</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => update.mutate()} disabled={!dirty || update.isPending}>
            {update.isPending ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving</>
            ) : (
              'Save'
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Preview: <span className="font-mono">{formatCurrency(1234.5, selected)}</span>
          {' · '}<span className="font-mono">{sample.symbol}</span> {sample.name}
        </p>
      </CardContent>
    </Card>
  );
}
