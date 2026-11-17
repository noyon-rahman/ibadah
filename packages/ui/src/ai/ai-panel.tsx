'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';

import { cn } from '@ibadah/shared';
import type { ChatMessage, SystemSurface } from '@ibadah/core';
import { AIMessage } from './ai-message.js';
import { AIComposer, type AIComposerButtonProps } from './ai-composer.js';

/**
 * Shape of the app-owned `useAiChat()` hook. The package cannot import
 * the apps' hooks (they reach into `/api` routes and auth storage), so
 * the host passes the hook itself and the panel calls it.
 */
export interface AiChatHookOptions {
  greeting?: string;
  surface?: SystemSurface;
  buildContext?: () => string | undefined;
  endpoint?: string;
  sessionId?: string | null;
  onSessionCreated?: (sessionId: string) => void;
  onTurnComplete?: () => void;
  persistKey?: string;
}

export interface AiChatHookResult {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  send: (text: string) => void;
  abort: () => void;
}

/** The host app's `useAiChat` hook. */
export type UseAiChatHook = (options?: AiChatHookOptions) => AiChatHookResult;

/** The host app's `Button` primitive (`@/components/ui/button`). */
export type AIButtonComponent = React.ComponentType<AIComposerButtonProps>;

/** Copy shown in the empty transcript, split into the two lines it renders. */
export interface AIPanelEmptyStateContent {
  /** Bold headline. */
  title: string;
  /** Muted explanatory line under the headline. */
  description: string;
}

/**
 * Copy + rendering for the "guest preview" branch. The client shows a
 * sign-up nudge on its marketing landing surface to signed-out visitors;
 * the admin app has no guest mode.
 */
export interface AIPanelGuestMode {
  /** True when the visitor is signed out on the landing surface. */
  isGuest: boolean;
  /** Empty-state copy used while `isGuest` is true. */
  emptyState: AIPanelEmptyStateContent;
  /** Composer hint used while `isGuest` is true. */
  hint: string;
  /** Inline note rendered just above the composer. */
  notice: ReactNode;
  /** Optional call-to-action rendered under the guest empty state. */
  cta?: ReactNode;
}

const DEFAULT_EMPTY_STATE: AIPanelEmptyStateContent = {
  title: 'Ask me anything about Ibadah',
  description: 'Salah scoring, habit tracking, or paste your stats and I’ll visualize them.',
};

interface AIPanelProps {
  greeting?: string;
  surface?: SystemSurface;
  buildContext?: () => string | undefined;
  /** Visible suggestion chips above the composer. */
  suggestions?: string[];
  /** Override the chat endpoint. Defaults to `/api/ai/chat`. */
  endpoint?: string;
  /** Compact spacing for the floating widget. The full-page assistant uses `comfortable`. */
  density?: 'compact' | 'comfortable';
  /** Auto-focus the composer on mount. */
  autoFocus?: boolean;
  className?: string;
  /** Hint shown under the composer (e.g. "Powered by OpenRouter"). */
  hint?: string;
  /** Existing session ID to load messages from, or undefined for new chat */
  sessionId?: string | null;
  /** Callback when a new session is created */
  onSessionCreated?: (sessionId: string) => void;
  /** Fired after each completed turn so callers can refresh history. */
  onTurnComplete?: () => void;
  /** sessionStorage key to persist the conversation across reloads. */
  persistKey?: string;
  /** The host app's `useAiChat` hook. */
  useChat: UseAiChatHook;
  /** The host app's `Button` primitive. */
  ButtonComponent: AIButtonComponent;
  /** Copy for the non-guest empty transcript. */
  emptyState?: AIPanelEmptyStateContent;
  /** Hint used when no explicit `hint` is passed and we're not a guest. */
  defaultHint?: string;
  /** Guest-preview behaviour (client marketing landing only). */
  guestMode?: AIPanelGuestMode;
}

/**
 * The chat surface. Used both inside the floating widget sheet and on
 * the dedicated `/assistant` page. Keeping the panel headless means
 * both call-sites get the same scrolling, suggestions, and accessibility
 * behavior for free.
 */
export function AIPanel({
  greeting = "Assalamu alaikum. I'm your Ibadah assistant — ask me about Salah scoring, tracking habits, or share your week and I can chart it for you.",
  surface = 'dashboard',
  buildContext,
  suggestions,
  endpoint,
  density = 'comfortable',
  autoFocus = false,
  className,
  hint,
  sessionId,
  onSessionCreated,
  onTurnComplete,
  persistKey,
  useChat,
  ButtonComponent,
  emptyState,
  defaultHint = 'Press Enter to send · Shift+Enter for newline',
  guestMode,
}: AIPanelProps) {
  const chat = useChat({ greeting, surface, buildContext, endpoint, sessionId, onSessionCreated, onTurnComplete, persistKey });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isGuestLanding = guestMode?.isGuest ?? false;

  // Auto-scroll to the newest message whenever messages change. Use a
  // MutationObserver-style effect: depend on the *length* and on the
  // last message's content so streaming deltas keep us pinned at the
  // bottom only if the user hasn't scrolled away.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (distanceFromBottom < 120) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [chat.messages]);

  const lastMessageId = chat.messages[chat.messages.length - 1]?.id;

  // Render the assistant placeholder differently while it's streaming.
  const tagged = useMemo(
    () =>
      chat.messages.map((m) => ({
        ...m,
        // Mark the most recent assistant message as streaming if the
        // hook says so AND it's currently empty / mid-stream.
        _streaming: chat.isStreaming && m.id === lastMessageId && m.role === 'assistant',
      })),
    [chat.messages, chat.isStreaming, lastMessageId],
  );

  const padding = density === 'compact' ? 'px-3 py-3' : 'px-4 py-4 sm:px-6';
  const gap = density === 'compact' ? 'space-y-3' : 'space-y-4';

  const visibleSuggestions = suggestions && chat.messages.length <= 1 ? suggestions : [];

  const activeEmptyState = isGuestLanding && guestMode
    ? guestMode.emptyState
    : (emptyState ?? DEFAULT_EMPTY_STATE);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div ref={scrollerRef} className={cn('flex-1 overflow-y-auto overscroll-contain', padding, gap)}>
        {chat.messages.length === 0 ? (
          <EmptyState
            content={activeEmptyState}
            cta={isGuestLanding ? guestMode?.cta : undefined}
          />
        ) : (
          tagged.map((m) => (
            <AIMessage key={m.id} message={m} isStreaming={m._streaming} />
          ))
        )}
        {chat.error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {chat.error}
          </p>
        )}
      </div>

      {visibleSuggestions.length > 0 && (
        <div className={cn('flex flex-wrap gap-2 px-3 pb-2 sm:px-6')}>
          {visibleSuggestions.map((s) => (
            <ButtonComponent
              key={s}
              variant="outline"
              size="sm"
              type="button"
              onClick={() => chat.send(s)}
              disabled={chat.isStreaming}
              className="h-7 rounded-full bg-card/60 px-3 text-xs font-normal"
            >
              {s}
            </ButtonComponent>
          ))}
        </div>
      )}

      <div className={cn('border-t border-border/40 bg-background/60 px-3 py-3 backdrop-blur sm:px-4')}>
        {guestMode && isGuestLanding && guestMode.notice}
        <AIComposer
          onSubmit={chat.send}
          onAbort={chat.abort}
          isStreaming={chat.isStreaming}
          autoFocus={autoFocus}
          hint={hint ?? (isGuestLanding && guestMode ? guestMode.hint : defaultHint)}
          ButtonComponent={ButtonComponent}
        />
      </div>
    </div>
  );
}

function EmptyState({ content, cta }: { content: AIPanelEmptyStateContent; cta?: ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-6 py-12 text-center">
      <div>
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/15 to-accent/15 text-primary">
          <Sparkles className="size-6" />
        </div>
        <p className="text-sm font-medium">{content.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{content.description}</p>
        {cta}
      </div>
    </div>
  );
}
