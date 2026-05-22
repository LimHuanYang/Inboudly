import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
  xl: 'h-16 w-16 border-4',
};

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block animate-spin rounded-full border-primary border-t-transparent',
        SIZE[size],
        className,
      )}
    />
  );
}

interface PageLoaderProps {
  label?: string;
  hint?: string;
}

export function PageLoader({ label = 'Loading…', hint }: PageLoaderProps) {
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
      <Spinner size="xl" />
      <p className="text-sm font-medium text-foreground">{label}</p>
      {hint && <p className="max-w-sm text-center text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface FullScreenLoaderProps {
  label?: string;
  hint?: string;
}

export function FullScreenLoader({
  label = 'Loading Inboudly…',
  hint = 'First page load can take a few seconds while we compile.',
}: FullScreenLoaderProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
      <Spinner size="xl" />
      <p className="text-base font-medium">{label}</p>
      {hint && <p className="max-w-md px-4 text-center text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
