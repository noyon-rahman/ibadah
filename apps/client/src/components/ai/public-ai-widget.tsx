'use client';

import { useSyncExternalStore } from 'react';
import { usePathname } from '@/i18n/routing';
import { AIWidget } from '@ibadah/ui';

import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';
import { useAiChat } from '@/hooks/use-ai-chat';
import { authStorage } from '@/lib/auth/auth-storage';

/**
 * Guest-preview copy for the landing surface. Kept module-level so the
 * panel receives stable references across renders.
 */
const GUEST_MODE = {
  emptyState: {
    title: 'Ask me about Ibadah',
    description:
      'Features, scoring rules, privacy \u2014 or how to get started with a free account.',
  },
  hint: 'Ask about features, scoring, or how to get started',
  notice: (
    <p className="mb-2 text-center text-[11px] text-muted-foreground">
      {'Guest preview \u2014'}{' '}
      <Link
        href="/register"
        className="font-medium text-primary underline-offset-2 hover:underline"
      >
        sign up free
      </Link>{' '}
      for your full assistant with personal stats and history.
    </p>
  ),
  cta: (
    <Button asChild size="sm" className="mt-4 rounded-full">
      <Link href="/register">Create free account</Link>
    </Button>
  ),
};

const subscribe = () => () => {};
const getSnapshot = () => !authStorage.hasSession();
const getServerSnapshot = () => true;

/**
 * Public-facing floating AI widget wrapper.
 * Renders on all public pages (Home, About, Features, FAQ, Releases, Privacy, Terms, AI Showcase)
 * and automatically suppresses itself on authenticated dashboard or auth routes.
 */
export function PublicAIWidget() {
  const pathname = usePathname();

  // `authStorage` is localStorage-backed, so reading it during render
  // would desync SSR and hydration. `useSyncExternalStore` gives us the
  // browser value after mount and a guest-safe default on the server.
  const isGuest = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Exclude dashboard, assistant, and auth pages (which handle their own widget or full page)
  const isExcluded = /^\/(dashboard|salah|quran|hadith|dhikr|habits|checklist|settings|assistant|login|register)(\/|$)/.test(
    pathname,
  );

  if (isExcluded) {
    return null;
  }

  return (
    <AIWidget
      surface="landing"
      liftAboveBottomNav={false}
      greeting={'Assalamu alaikum. I\u2019m the Ibadah assistant \u2014 happy to answer questions about the app, the scoring rules, or how it might fit into your day.'}
      suggestions={[
        'What can I do with Ibadah?',
        'How does the Salah scoring work?',
        'Is my worship log private?',
      ]}
      guestMode={{ isGuest, ...GUEST_MODE }}
      useChat={useAiChat}
      ButtonComponent={Button}
    />
  );
}
