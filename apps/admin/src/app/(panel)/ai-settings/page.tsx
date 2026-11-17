'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { 
  Bot, 
  Key, 
  Settings, 
  Activity, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  Database,
  Gauge,
  Server,
  Eye,
  EyeOff,
  Copy,
  Check,
  ListFilter
} from 'lucide-react';

import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import {
  Input,
  Label,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ibadah/ui';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@ibadah/shared';
import { useToast } from '@/hooks/use-toast';
import {
  getProviders,
  getProviderKey,
  getProviderModels,
  getAISettings,
  getUsageStats,
  updateProvider,
  updateAISettings,
  testProvider,
  type DiscoveredModel,
} from '@/lib/ai/ai-config-api';

// Tab triggers styled to mirror the admin sidebar nav buttons: rounded-xl
// shape, muted idle state, soft primary gradient + primary-tinted icon when
// active. Scoped here so the shared Tabs component (analytics, moderation)
// keeps its pill style.
const tabTriggerClass = cn(
  'justify-start rounded-xl px-3 py-2 text-muted-foreground transition-all',
  'hover:bg-muted/60 hover:text-foreground',
  'data-[state=active]:bg-transparent data-[state=active]:bg-gradient-to-r',
  'data-[state=active]:from-primary/15 data-[state=active]:via-primary/8 data-[state=active]:to-transparent',
  'data-[state=active]:text-foreground data-[state=active]:shadow-sm',
  'data-[state=active]:[&_svg]:text-primary',
);

interface ProviderConfig {
  name: string;
  displayName: string;
  enabled: boolean;
  apiKey?: string;
  apiKeyLastFour?: string;
  baseUrl?: string;
  defaultModel: string;
  availableModels: string[];
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  maxTokens: number;
  rateLimitTier: 'free' | 'standard' | 'premium';
}

interface AISettings {
  activeProvider: string;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  features: {
    enableStreaming: boolean;
    enableFunctionCalling: boolean;
    enablePdfGeneration: boolean;
    enableChatSessions: boolean;
    enableAdminTools: boolean;
  };
}

interface UsageStats {
  totalRequests: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  byProvider: Record<string, { requests: number; tokens: number; errors: number }>;
  averageLatency: number;
  errorRate: number;
}

export default function AISettingsPage() {
  const t = useTranslations('AISettings');
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('providers');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  
  // Data states
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [settings, setSettings] = useState<AISettings>({
    // Empty until the server reports the real active provider. Hardcoding a
    // default here made the UI claim OpenRouter whenever the response shape
    // changed, hiding the bug instead of surfacing it.
    activeProvider: '',
    defaultModel: '',
    maxTokens: 1024,
    temperature: 0.4,
    features: {
      enableStreaming: true,
      enableFunctionCalling: true,
      enablePdfGeneration: true,
      enableChatSessions: true,
      enableAdminTools: true,
    },
  });
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);

  // Form states
  const [selectedProvider, setSelectedProvider] = useState<string>('');
  /** True once a provider has been chosen, so refetches keep the admin's choice. */
  const selectionInitialised = useRef(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [isRevealingKey, setIsRevealingKey] = useState(false);
  /** Name of the provider currently being activated, so only that row spins. */
  const [activatingProvider, setActivatingProvider] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latency?: number } | null>(null);

  // Model discovery for the picker. Free-text entry always remains possible.
  const [providerModels, setProviderModels] = useState<DiscoveredModel[]>([]);
  const [modelsSource, setModelsSource] = useState<'provider' | 'configured' | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const modelsRequestSeq = useRef(0);

  const currentProvider = providers.find(p => p.name === selectedProvider);
  // Depend on the draft endpoint/key so the list refreshes as they're edited.
  const draftBaseUrl = selectedProvider === 'custom' ? (currentProvider?.baseUrl ?? '') : '';

  const filteredModels = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return providerModels;
    return providerModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q),
    );
  }, [providerModels, modelFilter]);

  const pickModel = (id: string) => {
    setProviders(prev =>
      prev.map(p => (p.name === selectedProvider ? { ...p, defaultModel: id } : p)),
    );
    setModelPickerOpen(false);
    setModelFilter('');
  };

  const refreshModels = async () => {
    if (!selectedProvider) return;
    // Guards against an older (slower) request overwriting a newer result.
    const requestId = ++modelsRequestSeq.current;
    setModelsLoading(true);
    setModelsError(null);
    try {
      const result = await getProviderModels(selectedProvider, {
        apiKey: apiKeyInput || undefined,
        baseUrl: draftBaseUrl || undefined,
      });
      if (requestId !== modelsRequestSeq.current) return;
      setProviderModels(result.models ?? []);
      setModelsSource(result.source);
    } catch (error) {
      if (requestId !== modelsRequestSeq.current) return;
      setProviderModels([]);
      setModelsSource(null);
      setModelsError((error as Error).message || 'Could not load models');
    } finally {
      if (requestId === modelsRequestSeq.current) setModelsLoading(false);
    }
  };

  // Reset the per-provider form state when switching providers so one
  // provider's key, model list and errors never show under another's form.
  useEffect(() => {
    setApiKeyInput('');
    setShowApiKey(false);
    setProviderModels([]);
    setModelsSource(null);
    setModelsError(null);
    setTestResult(null);
    setModelFilter('');
    setModelPickerOpen(false);
  }, [selectedProvider]);

  // Debounced refetch when the provider, key, or draft endpoint changes.
  useEffect(() => {
    if (!selectedProvider) return;
    const timer = setTimeout(() => {
      void refreshModels();
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, apiKeyInput, draftBaseUrl]);

  // Returns the key to act on: whatever the admin typed, or the stored key
  // fetched on demand (the stored key is never sent on initial load).
  const resolveApiKey = async (): Promise<string> => {
    if (apiKeyInput) return apiKeyInput;
    const provider = providers.find(p => p.name === selectedProvider);
    if (!provider?.apiKeyLastFour) return '';
    setIsRevealingKey(true);
    try {
      const key = await getProviderKey(selectedProvider);
      setApiKeyInput(key);
      return key;
    } finally {
      setIsRevealingKey(false);
    }
  };

  const handleToggleApiKey = async () => {
    if (showApiKey) {
      setShowApiKey(false);
      return;
    }
    try {
      await resolveApiKey();
      setShowApiKey(true);
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to reveal API key',
        variant: 'destructive',
      });
    }
  };

  const handleCopyApiKey = async () => {
    try {
      const value = await resolveApiKey();
      if (!value) return;
      await navigator.clipboard.writeText(value);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 1500);
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to copy API key',
        variant: 'destructive',
      });
    }
  };

  // Fetch initial data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [providersData, settingsData, usageData] = await Promise.all([
        getProviders().catch(() => [] as ProviderConfig[]),
        getAISettings().catch(() => null),
        getUsageStats(30).catch(() => null),
      ]);

      setProviders(providersData || []);

      if (settingsData) {
        setSettings(prev => ({ ...prev, ...settingsData }));
      }

      // Only pick a default on the *first* load. Re-fetching after a save or an
      // activation must never steal the selection out of the form the admin is
      // working in — that was why choosing a provider appeared to "snap back".
      if (!selectionInitialised.current && providersData && providersData.length > 0) {
        selectionInitialised.current = true;
        const preferred = settingsData?.activeProvider;
        setSelectedProvider(
          preferred && providersData.some(p => p.name === preferred)
            ? preferred
            : providersData[0].name,
        );
      }

      if (usageData) {
        setUsageStats(usageData);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load AI settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Make a provider the one the app actually uses, and show it in the form so
   * the admin can immediately see what is now live. Its own saved key, endpoint
   * and model are kept; every other provider's settings stay saved and can be
   * switched back to at any time.
   */
  const handleActivateProvider = async (name: string) => {
    // Ignore repeated clicks while any activation is in flight.
    if (name === settings.activeProvider || activatingProvider) return;
    setActivatingProvider(name);
    try {
      const updated = await updateAISettings({ activeProvider: name });
      if (updated) setSettings(prev => ({ ...prev, ...updated }));
      // Reflect the switch immediately, before the refetch lands.
      setSettings(prev => ({ ...prev, activeProvider: name }));
      setSelectedProvider(name);
      toast({
        title: 'Provider activated',
        description: `${providers.find(p => p.name === name)?.displayName ?? name} is now handling AI requests.`,
      });
      await fetchData();
    } catch (error) {
      toast({
        title: 'Could not activate provider',
        description: (error as Error).message || 'Failed to activate provider',
        variant: 'destructive',
      });
    } finally {
      setActivatingProvider(null);
    }
  };

  const handleSaveProvider = async () => {
    const provider = providers.find(p => p.name === selectedProvider);
    // Bail *before* flipping into the saving state, or the button stays spinning.
    if (!provider) return;
    setIsSaving(true);
    try {

      const updateData: Partial<ProviderConfig> = {
        enabled: provider.enabled,
        defaultModel: provider.defaultModel,
        maxTokens: provider.maxTokens,
        rateLimitTier: provider.rateLimitTier,
      };

      // Custom OpenAI-compatible endpoints carry their own API root.
      if (selectedProvider === 'custom') {
        updateData.baseUrl = provider.baseUrl?.trim() || undefined;
      }

      // Persist the discovered catalog so the saved list stays useful as a
      // fallback when /models is unavailable. The current pick goes first.
      if (providerModels.length > 0) {
        const ids = providerModels.map(m => m.id);
        updateData.availableModels = ids.includes(provider.defaultModel)
          ? [provider.defaultModel, ...ids.filter(id => id !== provider.defaultModel)]
          : [provider.defaultModel, ...ids];
      }

      // Only include API key if it was changed (not masked)
      if (apiKeyInput && !apiKeyInput.includes('*')) {
        updateData.apiKey = apiKeyInput;
      }

      await updateProvider(selectedProvider, updateData);

      toast({
        title: 'Success',
        description: 'Provider settings saved successfully',
      });
      setApiKeyInput('');
      // Await the refresh so the form settles on server data before the admin
      // can touch it again (an un-awaited refetch raced with model discovery).
      await fetchData();
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message || 'Failed to save provider settings',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestProvider = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const provider = providers.find(p => p.name === selectedProvider);
      if (!provider) return;

      const apiKey = apiKeyInput && !apiKeyInput.includes('*') 
        ? apiKeyInput 
        : undefined;

      // If no new API key provided, we can't test without the stored key
      if (!apiKey && !provider.apiKeyLastFour) {
        throw new Error('Enter an API key to test this provider — none is saved yet.');
      }

      // Send no key when none was typed: the server falls back to the saved
      // key. (Sending a placeholder string made it hit the upstream as a real
      // key, so every test after a reload failed with 401 Invalid API key.)
      const data = await testProvider(
        selectedProvider,
        apiKey,
        provider.defaultModel,
        selectedProvider === 'custom' ? provider.baseUrl : undefined,
      );
      setTestResult({
        success: data.success,
        message: data.message,
        latency: data.data?.latency,
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: (error as Error).message,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveGeneralSettings = async () => {
    setIsSaving(true);
    try {
      await updateAISettings(settings);
      toast({
        title: 'Success',
        description: 'General settings saved successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="AI Configuration"
        description="Manage AI providers, API credentials, and system-wide AI settings"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 gap-1 rounded-xl border-border/60 bg-card/40 p-1.5 lg:w-auto">
          <TabsTrigger value="providers" className={tabTriggerClass}>
            <Server className="mr-2 h-4 w-4" />
            Providers
          </TabsTrigger>
          <TabsTrigger value="settings" className={tabTriggerClass}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="usage" className={tabTriggerClass}>
            <Activity className="mr-2 h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="tools" className={tabTriggerClass}>
            <Bot className="mr-2 h-4 w-4" />
            Tools
          </TabsTrigger>
        </TabsList>

        {/* Providers Tab */}
        <TabsContent value="providers" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Provider Configuration</CardTitle>
              <CardDescription>
                Configure AI providers and their API credentials. At least one provider must be active.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Provider list — each row shows its saved state and whether it's live */}
              <div className="space-y-2">
                <Label>AI Providers</Label>
                <p className="text-xs text-muted-foreground">
                  Each provider keeps its own API key, endpoint and model. Selecting one only
                  edits it — use <span className="font-medium">Use this provider</span> to make it
                  handle requests.
                </p>
                <div className="space-y-2">
                  {providers.map((p) => {
                    const isActive = p.name === settings.activeProvider;
                    const isSelected = p.name === selectedProvider;
                    const hasKey = Boolean(p.apiKeyLastFour);
                    return (
                      <div
                        key={p.name}
                        className={cn(
                          'flex flex-col gap-3 rounded-xl border p-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
                          isActive
                            ? 'border-primary/40 bg-primary/5'
                            : isSelected
                              ? 'border-border bg-muted/40'
                              : 'border-border/60',
                          // The row being edited is always visibly outlined, even
                          // when it is also the active provider.
                          isSelected && 'ring-2 ring-primary/40',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedProvider(p.name)}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate font-medium">{p.displayName}</span>
                              {isActive ? (
                                <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20">
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Active
                                </Badge>
                              ) : hasKey ? (
                                <Badge variant="secondary">Saved</Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-500/10 text-gray-600">
                                  Not configured
                                </Badge>
                              )}
                              {isSelected && (
                                <Badge variant="outline" className="border-primary/40 text-primary">
                                  editing
                                </Badge>
                              )}
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {p.defaultModel || 'no model'}
                              {hasKey ? ` · ****${p.apiKeyLastFour}` : ' · no key'}
                              {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                            </p>
                          </div>
                        </button>
                        <div className="flex shrink-0 items-center gap-2">
                          {isActive ? (
                            <span className="text-xs font-medium text-green-600">In use</span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant={hasKey ? 'default' : 'outline'}
                              // Only block activation while *this* provider is
                              // switching; other rows stay idle, not spinning.
                              disabled={(activatingProvider !== null && activatingProvider !== p.name) || !hasKey}
                              title={hasKey ? 'Make this the active provider' : 'Save an API key first'}
                              onClick={() => handleActivateProvider(p.name)}
                            >
                              {activatingProvider === p.name ? (
                                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : null}
                              Use this provider
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedProvider(p.name)}
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedProvider && (
                <>
                  <Separator />

                  {/* Name the provider being edited so the form is never ambiguous. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">
                      {providers.find(p => p.name === selectedProvider)?.displayName ?? selectedProvider}
                    </h3>
                    {selectedProvider === settings.activeProvider ? (
                      <Badge className="bg-green-500/10 text-green-600">Active — in use</Badge>
                    ) : (
                      <Badge variant="secondary">Saved — not in use</Badge>
                    )}
                  </div>

                  {/* Provider Settings */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* API Key */}
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="apiKey">
                        API Key
                        {providers.find(p => p.name === selectedProvider)?.apiKeyLastFour && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (Current: ****{providers.find(p => p.name === selectedProvider)?.apiKeyLastFour})
                          </span>
                        )}
                      </Label>
                      <div className="relative">
                        <Input
                          id="apiKey"
                          type={showApiKey ? 'text' : 'password'}
                          placeholder="Enter API key"
                          autoComplete="off"
                          className="pr-20"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                        />
                        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={handleToggleApiKey}
                            disabled={isRevealingKey || (!apiKeyInput && !providers.find(p => p.name === selectedProvider)?.apiKeyLastFour)}
                            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                            title={showApiKey ? 'Hide API key' : 'Show API key'}
                            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            {isRevealingKey ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : showApiKey ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyApiKey}
                            disabled={isRevealingKey || (!apiKeyInput && !providers.find(p => p.name === selectedProvider)?.apiKeyLastFour)}
                            aria-label="Copy API key"
                            title="Copy API key"
                            className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                          >
                            {apiKeyCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Leave empty to keep the current key. Use the eye icon to reveal the saved
                        key or the copy icon to copy it.
                      </p>
                    </div>

                    {/* Base URL — only meaningful for user-supplied OpenAI-compatible endpoints */}
                    {selectedProvider === 'custom' && (
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="baseUrl">Base URL</Label>
                        <Input
                          id="baseUrl"
                          type="url"
                          placeholder="https://api.river.ai/v1"
                          autoComplete="off"
                          value={providers.find(p => p.name === selectedProvider)?.baseUrl || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setProviders(prev => prev.map(p =>
                              p.name === selectedProvider ? { ...p, baseUrl: value } : p
                            ));
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          OpenAI-compatible API root, including the version segment (usually ends
                          in <code>/v1</code>). Chat requests go to <code>{'{baseUrl}'}/chat/completions</code>.
                        </p>
                      </div>
                    )}

                    {/* Default Model — free text, with a fetched model picker */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="model">Default Model</Label>
                        <span className="text-xs text-muted-foreground">
                          {modelsLoading
                            ? 'Fetching models…'
                            : modelsSource === 'provider'
                              ? `${providerModels.length} available`
                              : modelsSource === 'configured'
                                ? 'Saved list'
                                : null}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="model"
                          placeholder="Type a model id or browse"
                          autoComplete="off"
                          value={providers.find(p => p.name === selectedProvider)?.defaultModel || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            setProviders(prev => prev.map(p =>
                              p.name === selectedProvider ? { ...p, defaultModel: value } : p
                            ));
                          }}
                        />
                        <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className="shrink-0"
                              disabled={modelsLoading}
                              aria-label="Browse available models"
                            >
                              {modelsLoading ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <ListFilter className="h-4 w-4" />
                              )}
                              <span className="ml-2 hidden sm:inline">Browse</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-[min(28rem,90vw)] p-2">
                            <Input
                              autoFocus
                              placeholder="Filter models…"
                              value={modelFilter}
                              onChange={(e) => setModelFilter(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const first = filteredModels[0];
                                  if (first) {
                                    pickModel(first.id);
                                    e.preventDefault();
                                  }
                                }
                              }}
                              className="mb-2"
                            />
                            <div className="max-h-72 space-y-0.5 overflow-y-auto">
                              {filteredModels.length === 0 ? (
                                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                  {modelsLoading
                                    ? 'Loading models…'
                                    : modelsError
                                      ? modelsError
                                      : providerModels.length === 0
                                        ? 'No models found. Type the id manually.'
                                        : 'No matches.'}
                                </p>
                              ) : (
                                filteredModels.map((model) => {
                                  const isCurrent =
                                    model.id === providers.find(p => p.name === selectedProvider)?.defaultModel;
                                  return (
                                    <button
                                      key={model.id}
                                      type="button"
                                      onClick={() => pickModel(model.id)}
                                      className={cn(
                                        'flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                                        'hover:bg-muted/70',
                                        isCurrent && 'bg-primary/10 text-foreground',
                                      )}
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate font-medium">{model.id}</span>
                                        {model.displayName && (
                                          <span className="block truncate text-xs text-muted-foreground">
                                            {model.displayName}
                                          </span>
                                        )}
                                      </span>
                                      {isCurrent && <Check className="h-4 w-4 shrink-0 text-primary" />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t pt-2">
                              <span className="text-xs text-muted-foreground">
                                {modelsSource === 'configured'
                                  ? 'Showing the saved list'
                                  : 'Fetched from the provider'}
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => refreshModels()}
                                disabled={modelsLoading}
                              >
                                <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', modelsLoading && 'animate-spin')} />
                                Refresh
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Pick from the list or type any model id. You can always enter a model
                        that isn&apos;t listed.
                      </p>
                    </div>

                    {/* Max Tokens */}
                    <div className="space-y-2">
                      <Label htmlFor="maxTokens">Max Tokens ({providers.find(p => p.name === selectedProvider)?.maxTokens})</Label>
                      <Slider
                        id="maxTokens"
                        min={256}
                        max={4096}
                        step={256}
                        value={[providers.find(p => p.name === selectedProvider)?.maxTokens || 1024]}
                        onValueChange={([value]) => {
                          setProviders(prev => prev.map(p => 
                            p.name === selectedProvider ? { ...p, maxTokens: value } : p
                          ));
                        }}
                      />
                    </div>

                    {/* Rate Limit Tier */}
                    <div className="space-y-2">
                      <Label htmlFor="tier">Rate Limit Tier</Label>
                      <Select 
                        value={providers.find(p => p.name === selectedProvider)?.rateLimitTier} 
                        onValueChange={(value: 'free' | 'standard' | 'premium') => {
                          setProviders(prev => prev.map(p => 
                            p.name === selectedProvider ? { ...p, rateLimitTier: value } : p
                          ));
                        }}
                      >
                        <SelectTrigger id="tier">
                          <SelectValue placeholder="Select tier" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="standard">Standard</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Enabled Toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="enabled">Provider Enabled</Label>
                        <p className="text-sm text-muted-foreground">
                          Enable or disable this provider for AI requests
                        </p>
                      </div>
                      <Switch
                        id="enabled"
                        checked={providers.find(p => p.name === selectedProvider)?.enabled}
                        onCheckedChange={(checked) => {
                          setProviders(prev => prev.map(p => 
                            p.name === selectedProvider ? { ...p, enabled: checked } : p
                          ));
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleTestProvider}
                  disabled={isTesting || !selectedProvider}
                >
                  {isTesting ? (
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="mr-2 h-4 w-4" />
                  )}
                  Test Connection
                </Button>
              </div>
              <Button 
                onClick={handleSaveProvider}
                disabled={isSaving || !selectedProvider}
              >
                {isSaving ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Provider
              </Button>
            </CardFooter>
          </Card>

          {/* Test Result */}
          {testResult && (
            <Card className={testResult.success ? 'border-green-500/50' : 'border-red-500/50'}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  {testResult.success ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <XCircle className="h-6 w-6 text-red-500" />
                  )}
                  <div className="flex-1">
                    <h4 className="font-medium">
                      {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                    </h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      {testResult.message}
                    </p>
                    {testResult.latency && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Latency: {testResult.latency}ms
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General AI Settings</CardTitle>
              <CardDescription>
                Configure system-wide AI behavior and features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Temperature */}
                <div className="space-y-2">
                  <Label>Temperature ({settings.temperature})</Label>
                  <Slider
                    min={0}
                    max={2}
                    step={0.1}
                    value={[settings.temperature]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, temperature: value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Lower values make output more deterministic
                  </p>
                </div>

                {/* Max Tokens */}
                <div className="space-y-2">
                  <Label>Max Tokens ({settings.maxTokens})</Label>
                  <Slider
                    min={256}
                    max={4096}
                    step={256}
                    value={[settings.maxTokens]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, maxTokens: value }))}
                  />
                </div>
              </div>

              <Separator />

              {/* Feature Toggles */}
              <div className="space-y-4">
                <Label>Features</Label>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    { key: 'enableStreaming', label: 'Streaming', desc: 'Stream responses in real-time' },
                    { key: 'enableFunctionCalling', label: 'Function Calling', desc: 'Enable AI tool usage' },
                    { key: 'enablePdfGeneration', label: 'PDF Generation', desc: 'Generate PDF reports' },
                    { key: 'enableChatSessions', label: 'Chat Sessions', desc: 'Persistent chat history' },
                    { key: 'enableAdminTools', label: 'Admin Tools', desc: 'Extended admin capabilities' },
                  ].map((feature) => (
                    <div
                      key={feature.key}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="space-y-0.5">
                        <Label htmlFor={feature.key}>{feature.label}</Label>
                        <p className="text-sm text-muted-foreground">{feature.desc}</p>
                      </div>
                      <Switch
                        id={feature.key}
                        checked={settings.features[feature.key as keyof typeof settings.features]}
                        onCheckedChange={(checked) =>
                          setSettings(prev => ({
                            ...prev,
                            features: { ...prev.features, [feature.key]: checked },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSaveGeneralSettings} disabled={isSaving}>
                {isSaving ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usageStats?.totalRequests?.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground">Last 30 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usageStats?.totalTokens?.total?.toLocaleString() || '0'}
                </div>
                <p className="text-xs text-muted-foreground">
                  In: {usageStats?.totalTokens?.input?.toLocaleString() || 0} / 
                  Out: {usageStats?.totalTokens?.output?.toLocaleString() || 0}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
                <Gauge className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {usageStats?.averageLatency || 0}ms
                </div>
                <p className="text-xs text-muted-foreground">
                  {usageStats && usageStats.averageLatency < 500 ? 'Good' : usageStats && usageStats.averageLatency < 1000 ? 'Fair' : 'Poor'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {((usageStats?.errorRate || 0) * 100).toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {usageStats && usageStats.errorRate < 0.01 ? 'Excellent' : usageStats && usageStats.errorRate < 0.05 ? 'Good' : 'Needs Attention'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Provider Usage Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Usage Breakdown</CardTitle>
              <CardDescription>Usage statistics by AI provider</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usageStats?.byProvider && Object.entries(usageStats.byProvider).map(([provider, stats]) => (
                  <div key={provider} className="flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Server className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium capitalize">{provider}</p>
                        <p className="text-sm text-muted-foreground">
                          {stats.requests.toLocaleString()} requests • {stats.errors} errors
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{stats.tokens.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">tokens</p>
                    </div>
                  </div>
                ))}
                {(!usageStats?.byProvider || Object.keys(usageStats.byProvider).length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No usage data available yet
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Tools Configuration</CardTitle>
              <CardDescription>
                Manage AI tool capabilities and permissions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Client Tools */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Client Tools</CardTitle>
                    <CardDescription>Available to regular users</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {[
                        'getUserStats - View worship statistics',
                        'getSalahHistory - Prayer tracking history',
                        'getQuranProgress - Quran reading progress',
                        'getDhikrHistory - Dhikr tracking',
                        'getHabitsProgress - Habit completion',
                        'calculatePoints - Calculate potential points',
                      ].map((tool) => (
                        <li key={tool} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          {tool}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Admin Tools */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Admin Tools</CardTitle>
                    <CardDescription>Available to administrators only</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {[
                        'listUsers - List and search users',
                        'getUserDetails - View user details',
                        'suspendUser - Suspend/unsuspend users',
                        'getPlatformAnalytics - Platform-wide analytics',
                        'getModerationQueue - View moderation queue',
                        'moderateContent - Approve/reject content',
                        'getSystemHealth - System health status',
                        'getRecentAuditLogs - View audit logs',
                      ].map((tool) => (
                        <li key={tool} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-blue-500" />
                          {tool}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
