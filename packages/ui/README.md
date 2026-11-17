# @ibadah/ui

Shared UI primitives, and the shared AI chat suite, for the Ibadah
monorepo.

## Two kinds of component

The package holds components under two rules.

**1. Primitives — the byte-identical rule.**

A `ui/` primitive lives here **only if its source is byte-identical** in
both `apps/client/src/components/ui/` and `apps/admin/src/components/ui/`.

This rule is deliberate. The client and admin apps maintain their own
copies of most shadcn-style primitives, and those copies have drifted
(different padding, radii, colors, props, or behavior). Pulling a
divergent component into a shared package would silently change how one
app looks or behaves. So:

- **Identical in both apps** → move it here, import from `@ibadah/ui`.
- **Diverged, or only exists in one app** → keep it app-local and let the
  two copies evolve independently.

When you copy a primitive here, do not "clean it up" on the way in — keep
the code, the `'use client'` directives, and the `cn(...)` class strings
exactly as they appear in the apps.

**2. The AI suite — the parity rule.**

The `ai/` components are shared even though the two apps' copies have
diverged. They are unified behind props instead of being forked, so there
is exactly one implementation. The rule is:

> **With the client's props a shared component must render what the
> client renders today; with the admin's props, what admin renders
> today.** Any difference between the apps becomes a prop, never a
> hardcoded branch, and the default of every divergent prop is the
> **client's** current value.

Where only one app's copy had a class value (a one-className drift), the
**client's** value won and the admin's is not reachable — see
[Known parity gaps](#known-parity-gaps).

## Contents

Byte-identical primitives shared from here:

| Component | File |
| --- | --- |
| Dropdown menu | `src/ui/dropdown-menu.tsx` |
| Input | `src/ui/input.tsx` |
| Label | `src/ui/label.tsx` |
| Password input | `src/ui/password-input.tsx` |
| Select | `src/ui/select.tsx` |
| Tabs | `src/ui/tabs.tsx` |

AI chat suite:

| Component | File | Notes |
| --- | --- | --- |
| `AIChartRenderer` | `src/ai/ai-chart-renderer.tsx` | Byte-identical in both apps; Recharts |
| `MarkdownLite` | `src/ai/markdown-lite.tsx` | `react-markdown` + `remark-gfm` |
| `AIMessage` | `src/ai/ai-message.tsx` | One transcript row |
| `AIComposer` | `src/ai/ai-composer.tsx` | Input bar |
| `AIPanel` | `src/ai/ai-panel.tsx` | Chat surface; parameterized |
| `AIWidget` | `src/ai/ai-widget.tsx` | Floating launcher; parameterized |
| `ChatHistorySidebar` | `src/ai/chat-history-sidebar.tsx` | Session list |

The three app-specific wrappers stay app-local and import the shared
pieces: `dashboard-ai-widget.tsx` and `public-ai-widget.tsx` in the
client, `admin-ai-widget.tsx` in admin.

Intentionally **not** here (the copies differ between apps, or the
component only exists in one app):

- Differ between client and admin: `avatar`, `badge`, `button`,
  `calendar`, `card`, `date-picker`, `popover`, `tooltip`
- Client only: `dialog`, `sheet`, `textarea`
- Admin only: `separator`, `slider`, `sonner`, `switch`

## The AI suite

These components are presentational. They do **not** fetch, stream, or
own sessions — the host app supplies the behaviour through props. That is
what makes one implementation usable by both apps, whose chat hooks hit
different endpoints and whose auth differs.

Three things the old app-local copies imported from the app are now
**required props**. The package can never reach into an app:

| App-local thing | Replaced by |
| --- | --- |
| `@/hooks/use-ai-chat` (`useAiChat`) | `useChat` — pass the hook itself |
| `@/components/ui/button` (`Button`) | `ButtonComponent` — pass the app's primitive |
| `@/lib/ai/chat-session-api` (`ChatSession`) | `ChatSessionSummary` — structural type, declared in this package |

The AI wire types (`ChartSpec`, `ChatMessage`, `ToolActivity`,
`SystemSurface`) and `parseChartsFromText` come from **`@ibadah/core`**,
not from the apps.

### `AIPanel`

The chat surface, used inside the floating widget and on the dedicated
`/assistant` page.

```ts
interface AIPanelProps {
  // Behaviour (unchanged from the app-local version)
  greeting?: string;                  // default: client's dashboard greeting
  surface?: SystemSurface;            // default: 'dashboard'
  buildContext?: () => string | undefined;
  suggestions?: string[];
  endpoint?: string;
  density?: 'compact' | 'comfortable'; // default: 'comfortable'
  autoFocus?: boolean;                 // default: false
  className?: string;
  hint?: string;
  sessionId?: string | null;
  onSessionCreated?: (sessionId: string) => void;
  onTurnComplete?: () => void;
  persistKey?: string;

  // Required host wiring
  useChat: (options?: AiChatHookOptions) => AiChatHookResult;
  ButtonComponent: React.ComponentType<AIComposerButtonProps>;

  // Parameterization (defaults reproduce the admin's plain panel)
  emptyState?: { title: string; description: string };
  defaultHint?: string;                // default: 'Press Enter to send · Shift+Enter for newline'
  guestMode?: AIPanelGuestMode;
}

interface AIPanelGuestMode {
  isGuest: boolean;
  emptyState: { title: string; description: string };
  hint: string;
  notice: React.ReactNode;   // rendered above the composer
  cta?: React.ReactNode;     // rendered under the guest empty state
}
```

The `guestMode` prop exists only because the client shows a sign-up nudge
to signed-out visitors on its marketing landing surface. The admin app
passes nothing. `guestMode.isGuest` is the host's check (the client uses
`surface === 'landing' && !authStorage.hasSession()`); the package has no
access to auth.

### `AIWidget`

The floating launcher and expanding panel.

```ts
interface AIWidgetProps {
  surface?: SystemSurface;            // default: 'dashboard'
  buildContext?: () => string | undefined;
  suggestions?: string[];
  endpoint?: string;
  greeting?: string;
  hint?: string;
  liftAboveBottomNav?: boolean;       // default: true
  hidden?: boolean;

  // Copy (defaults are the client's)
  title?: string;                     // default: 'Ibadah assistant'
  subtitle?: string;                  // default: 'Always here, in shā Allāh'

  // Persistence — only the client passes this
  persistKey?: string;

  // Placement (defaults are the client's offsets)
  layout?: AIWidgetLayoutConfig;

  // Required host wiring
  useChat: (options?: AiChatHookOptions) => AiChatHookResult;
  ButtonComponent: React.ComponentType<AIComposerButtonProps>;
}

interface AIWidgetLayoutConfig {
  lifted: { button: string; panel: string };   // while clearing a bottom nav
  floating: { button: string; panel: string }; // when there is none
}
```

`liftAboveBottomNav` selects `lifted` or `floating`. The defaults for both
are the client's current Tailwind offsets; the admin passes its own.

### `ChatHistorySidebar`

```ts
interface ChatHistorySidebarProps {
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  isLoading?: boolean;
  isCreating?: boolean;
  isDeleting?: boolean;
  error?: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameSession: (sessionId: string, title: string) => void;
  className?: string;
  ButtonComponent: React.ComponentType<AIComposerButtonProps>;  // required
}
```

### `AIComposer`

```ts
interface AIComposerProps {
  onSubmit: (text: string) => void;
  onAbort?: () => void;
  isStreaming?: boolean;
  placeholder?: string;               // default: 'Ask anything…'
  className?: string;
  autoFocus?: boolean;
  hint?: string;
  ButtonComponent: React.ComponentType<AIComposerButtonProps>;  // required
}
```

`AIComposerButtonProps` is a superset of the shared parts of both apps'
`Button` props (`variant`, `size`, `type`, click handlers, `asChild`,
`aria-label`, …), so either app's primitive is a drop-in
`ButtonComponent`.

## Known parity gaps

- `AIComposer` textarea and `AIMessage` assistant bubble: the admin copies
  had one drifted class each (`text-foreground` and
  `bg-muted/40 … border-border/40`). The client's values (`text-foreground`,
  `bg-muted … border-border/60`) are used, so **admin gets these two
  class strings from the client**. Visual only; no structural or
  behavioural change. `MarkdownLite` likewise uses the client's
  `text-foreground`.
- `ChatHistorySidebar` copy uses the client's wording (only a code
  comment differed, not rendered text).

## Usage

```ts
import { Input, Label, Select, SelectTrigger, SelectValue } from '@ibadah/ui';
```

AI suite, from a client component:

```ts
'use client';

import { AIWidget } from '@ibadah/ui';
import { Button } from '@/components/ui/button';
import { useAiChat } from '@/hooks/use-ai-chat';

export function MyWidget(...) {
  return (
    <AIWidget
      surface="dashboard"
      liftAboveBottomNav
      persistKey="ibadah-chat-dashboard"
      useChat={useAiChat}
      ButtonComponent={Button}
    />
  );
}
```

Styling relies on the host app's Tailwind setup (the design-token classes
such as `bg-background`, `border-input`, `ring-ring`). This package ships
no CSS. Charts render through this package's `recharts` dependency and
inherit the host's theme via CSS variables (`var(--primary)` etc.).

## Scripts

```bash
pnpm build      # tsc -> dist/
pnpm dev        # tsc --watch
pnpm typecheck  # tsc --noEmit
pnpm lint       # eslint .
pnpm clean      # remove dist/ and .turbo/
```
