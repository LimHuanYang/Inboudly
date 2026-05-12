import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { Sparkles, Zap, BarChart3, Users, Wand2, Globe } from 'lucide-react';

const features = [
  {
    icon: Sparkles,
    title: 'AI that knows each platform',
    body: 'Per-platform algorithm coaching for Instagram, TikTok, and RedNote — built into the composer, not an afterthought.',
  },
  {
    icon: Wand2,
    title: 'Generate text, image, video',
    body: 'Claude Sonnet 4.6 for captions. GPT Image 2.0 + FLUX for visuals. Runway + Kling for video.',
  },
  {
    icon: Zap,
    title: 'Repurpose engine',
    body: 'Upload one video or YouTube URL — get optimized clips for every platform with auto-captions and smart reframing.',
  },
  {
    icon: BarChart3,
    title: 'Pre-publish virality score',
    body: 'See how a post will perform before you publish. Research-backed engagement prediction.',
  },
  {
    icon: Users,
    title: 'Approval workflows',
    body: 'Multi-level review with shareable client links. Lock posts after approval. Built for teams and agencies.',
  },
  {
    icon: Globe,
    title: 'RedNote, natively',
    body: 'The only Western tool with deep RedNote support — including CES score optimization and Chinese content generation.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-7 w-7 rounded-md bg-primary" />
            <span className="text-lg">Inboudly</span>
          </Link>
          <nav className="hidden gap-6 text-sm md:flex">
            <Link href="#features" className="text-muted-foreground hover:text-foreground">
              Features
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
            <Link href="/sign-in" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          </nav>
          <Button asChild>
            <Link href="/sign-up">Get started</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-24 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
          AI-native social media,{' '}
          <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            built for the next decade
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Create, schedule, and optimize content across Instagram, TikTok, RedNote, and more.
          Powered by Claude, GPT Image, and engagement prediction grounded in academic research.
        </p>
        <div className="mt-10 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/sign-up">Start free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="#features">See features</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container py-24">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Everything else is just a scheduler</h2>
          <p className="mt-4 text-muted-foreground">
            Inboudly is the only platform that combines native AI generation, per-platform algorithm
            intelligence, and the deepest RedNote support on the market.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardContent className="pt-6">
                <Icon className="h-8 w-8 text-primary" />
                <CardTitle className="mt-4 text-xl">{title}</CardTitle>
                <CardDescription className="mt-2">{body}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24">
        <Card className="bg-gradient-to-br from-primary to-accent p-12 text-center text-white">
          <h2 className="text-3xl font-bold">Ready to outpost the competition?</h2>
          <p className="mx-auto mt-4 max-w-xl">
            Free Starter plan. No credit card required. Connect your first social account in
            minutes.
          </p>
          <Button size="lg" variant="secondary" className="mt-8" asChild>
            <Link href="/sign-up">Create your workspace</Link>
          </Button>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="container flex h-16 items-center justify-between text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Inboudly. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
