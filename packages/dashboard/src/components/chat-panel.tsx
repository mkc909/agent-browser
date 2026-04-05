"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useAtomValue } from "jotai/react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Streamdown } from "streamdown";
import { getChatApiUrl, chatModelAtom, availableModelsAtom } from "@/store/chat";
import { activeSessionNameAtom } from "@/store/sessions";
import { ModelSelector } from "@/components/model-selector";
import { shikiTheme } from "@/lib/shiki-theme";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowUp, Trash2, ChevronRight } from "lucide-react";

const chatComponents = {
  h1: ({ node: _node, ...props }: any) => <p className="font-bold" {...props} />,
  h2: ({ node: _node, ...props }: any) => <p className="font-bold" {...props} />,
  h3: ({ node: _node, ...props }: any) => <p className="font-bold" {...props} />,
  h4: ({ node: _node, ...props }: any) => <p className="font-bold" {...props} />,
  h5: ({ node: _node, ...props }: any) => <p className="font-bold" {...props} />,
  h6: ({ node: _node, ...props }: any) => <p className="font-bold" {...props} />,
  a: ({ node: _node, href, children, ...props }: any) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
      {...props}
    >
      {children}
    </a>
  ),
  pre: ({ node: _node, ...props }: any) => (
    <pre
      className="text-[11px] bg-background border border-border rounded-md p-2 my-1.5 whitespace-pre-wrap break-all"
      {...props}
    />
  ),
  code: ({ className, children, node: _node, ...props }: any) => {
    if (className?.includes("language-")) {
      return <code className={className} {...props}>{children}</code>;
    }
    return (
      <span
        className="text-[11px] bg-secondary/60 px-1 py-0.5 rounded text-foreground font-mono break-all"
        {...props}
      >
        {children}
      </span>
    );
  },
};

const STORAGE_PREFIX = "dashboard-chat-";

const SUGGESTIONS = [
  "Go to google.com",
  "Take a screenshot",
  "What's on the page?",
  "Click the first link",
];

interface ToolInvocationPart {
  type: string;
  toolCallId: string;
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
}

function isToolPart(part: { type: string }): part is ToolInvocationPart {
  return part.type.startsWith("tool-");
}

function truncateOutput(text: string, maxLines = 30): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + `\n... (${lines.length - maxLines} more lines)`;
}

function formatOutput(raw: unknown): string | null {
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return JSON.stringify(parsed, null, 2);
      }
    } catch {
      // not JSON
    }
    return raw;
  }
  if (typeof raw === "object" && raw !== null) {
    return JSON.stringify(raw, null, 2);
  }
  return null;
}

function ToolCallBlock({ part }: { part: ToolInvocationPart }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = part.type.split("-").slice(1).join("-");
  const command = (part.input as { command?: string })?.command ?? toolName;
  const isDone = part.state === "output-available";
  const isRunning = !isDone;
  const output = isDone ? formatOutput(part.output) : null;
  const hasOutput = !!output;

  return (
    <div>
      <button
        onClick={() => hasOutput && !isRunning && setExpanded(!expanded)}
        className={cn(
          "group flex items-center gap-1 text-[11px] min-w-0 w-full text-left transition-colors font-mono",
          isRunning
            ? "text-muted-foreground"
            : "text-muted-foreground/60 hover:text-muted-foreground",
          (!hasOutput || isRunning) && "cursor-default",
        )}
      >
        <span
          className={cn(
            "flex items-center gap-1 min-w-0",
            isRunning && "shimmer-text",
            !isRunning && "opacity-70",
          )}
        >
          <span className="font-medium shrink-0">
            {isRunning ? "Running" : "Ran"}
          </span>
          <span className="truncate">{command}</span>
        </span>
        {hasOutput && !isRunning && (
          <span
            className={cn(
              "shrink-0 transition-opacity",
              expanded ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            <ChevronRight
              className={cn(
                "h-2.5 w-2.5 transition-transform duration-200",
                expanded && "rotate-90",
              )}
            />
          </span>
        )}
      </button>
      {expanded && hasOutput && (
        <div className="mt-1 rounded-md text-[10px] font-mono overflow-hidden border border-border bg-background">
          <div className="px-2 py-1 border-b border-border flex items-center gap-2 bg-secondary/30">
            <span className="text-primary/60 select-none">$</span>
            <span className="text-foreground/80 truncate">{command}</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <pre className="px-2 py-1.5 text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
              {truncateOutput(output)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_CONTEXT_WINDOW = 128000;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function ContextMeter({ used, total }: { used: number; total: number }) {
  const ratio = Math.min(used / total, 1);
  const size = 24;
  const strokeWidth = 2.5;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - ratio);
  const color =
    ratio > 0.9 ? "text-destructive" : ratio > 0.7 ? "text-yellow-500" : "text-muted-foreground/50";

  return (
    <div
      className="relative shrink-0"
      title={`${formatTokenCount(used)} / ${formatTokenCount(total)} tokens`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted-foreground/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(color, "transition-[stroke-dashoffset] duration-300")}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
    </div>
  );
}

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";

export function ChatPanel() {
  const [input, setInput] = useState("");
  const [errorDismissed, setErrorDismissed] = useState(false);
  const defaultModel = useAtomValue(chatModelAtom);
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel || DEFAULT_MODEL);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionName = useAtomValue(activeSessionNameAtom);
  const chatId = sessionName || "default";
  const storageKey = `${STORAGE_PREFIX}${chatId}`;
  const sessionRef = useRef(chatId);
  sessionRef.current = chatId;
  const modelRef = useRef(selectedModel);
  modelRef.current = selectedModel;

  useEffect(() => {
    if (defaultModel) setSelectedModel(defaultModel);
  }, [defaultModel]);

  const transport = useRef(
    new DefaultChatTransport({
      api: getChatApiUrl(),
      body: () => ({
        session: sessionRef.current,
        model: modelRef.current,
      }),
    }),
  ).current;

  const { messages, sendMessage, status, setMessages, error } = useChat({
    chatId,
    transport,
    onError: () => setErrorDismissed(false),
  });

  const visibleError = error && !errorDismissed ? error : undefined;
  const isLoading = status === "streaming" || status === "submitted";
  const hasMessages = messages.length > 0 || !!visibleError;

  const models = useAtomValue(availableModelsAtom);
  const estimatedTokens = useMemo(() => {
    let total = 0;
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (part.type === "text") total += estimateTokens(part.text);
        else if (isToolPart(part)) {
          if (part.input) total += estimateTokens(JSON.stringify(part.input));
          if (part.output) total += estimateTokens(typeof part.output === "string" ? part.output : JSON.stringify(part.output));
        }
      }
    }
    return total;
  }, [messages]);
  const contextWindow = useMemo(() => {
    const match = models.find((m) => m.id === selectedModel);
    return match?.context_window ?? DEFAULT_CONTEXT_WINDOW;
  }, [models, selectedModel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, visibleError]);

  // Restore messages from sessionStorage when chatId changes
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setMessages([]);
  }, [chatId, storageKey, setMessages]);

  // Persist messages to sessionStorage
  useEffect(() => {
    if (isLoading) return;
    if (messages.length === 0) {
      sessionStorage.removeItem(storageKey);
      return;
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore quota
    }
  }, [messages, isLoading, storageKey]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage({ text: input });
      setInput("");
    },
    [input, isLoading, sendMessage],
  );

  const handleClear = useCallback(() => {
    setMessages([]);
    setErrorDismissed(true);
    sessionStorage.removeItem(storageKey);
  }, [setMessages, storageKey]);

  const hasVisibleContent = (parts: (typeof messages)[number]["parts"]): boolean => {
    return parts.some(
      (p) => (p.type === "text" && p.text.length > 0) || isToolPart(p),
    );
  };

  return (
    <div className="flex h-full flex-col">
      {hasMessages && (
        <div className="flex items-center justify-end px-3 py-1.5 shrink-0 border-b border-border/40">
          <button
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Clear conversation"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {!hasMessages && !isLoading && (
            <div className="space-y-2 pt-2">
              <p className="text-[11px] text-muted-foreground">
                Control the browser with natural language:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => sendMessage({ text: s })}
                    className="text-[10px] px-2 py-1 rounded-md border bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            if (!hasVisibleContent(message.parts)) return null;
            return (
              <div key={message.id}>
                {message.role === "user" ? (
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {message.parts
                      .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
                      .map((p) => p.text)
                      .join("")}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(() => {
                      type Group = { type: "tools" | "text"; items: (typeof message.parts)[number][] };
                      const groups: Group[] = [];
                      for (const part of message.parts) {
                        const groupType = isToolPart(part) ? "tools" : "text";
                        const last = groups[groups.length - 1];
                        if (last && last.type === groupType) {
                          last.items.push(part);
                        } else {
                          groups.push({ type: groupType, items: [part] });
                        }
                      }

                      return groups.map((group, gi) => {
                        if (group.type === "tools") {
                          return (
                            <div key={gi} className="space-y-0.5">
                              {group.items.map((part) => {
                                if (!isToolPart(part)) return null;
                                return <ToolCallBlock key={part.toolCallId} part={part} />;
                              })}
                            </div>
                          );
                        }
                        const combinedText = group.items
                          .filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text" && !!p.text)
                          .map((p) => p.text)
                          .join("");
                        if (!combinedText) return null;
                        return (
                          <div key={gi} className="text-xs text-foreground">
                            <Streamdown
                              shikiTheme={shikiTheme}
                              controls={false}
                              components={chatComponents}
                            >
                              {combinedText}
                            </Streamdown>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && messages.length > 0 && (() => {
            const lastMsg = messages[messages.length - 1];
            const lastPart = lastMsg?.parts[lastMsg.parts.length - 1];
            const noVisibleContent = !lastMsg || !hasVisibleContent(lastMsg.parts);
            const lastIsCompletedTool = lastPart && isToolPart(lastPart) && lastPart.state === "output-available";
            if (noVisibleContent || lastIsCompletedTool) {
              return (
                <span className="text-[11px] text-muted-foreground shimmer-text">
                  Working...
                </span>
              );
            }
            return null;
          })()}

          {visibleError && (
            <div className="text-[10px] text-destructive/80 bg-destructive/10 rounded-md px-2 py-1.5">
              {(() => {
                try {
                  const parsed = JSON.parse(visibleError.message);
                  return parsed.message || parsed.error || visibleError.message;
                } catch {
                  return visibleError.message || "Something went wrong.";
                }
              })()}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border">
        <form onSubmit={handleSubmit}>
          <div className="px-3 pt-2 pb-1.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }}
              rows={1}
              placeholder="Ask something..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              className="w-full bg-transparent text-xs text-foreground outline-none resize-none max-h-24 leading-relaxed placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex items-center justify-between px-3 pb-2">
            <ModelSelector value={selectedModel} onChange={setSelectedModel} />
            <div className="flex items-center gap-2">
              {hasMessages && (
                <ContextMeter used={estimatedTokens} total={contextWindow} />
              )}
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-primary text-primary-foreground rounded-full p-1 hover:bg-primary/90 transition-colors disabled:opacity-30 shrink-0"
                aria-label="Send message"
              >
                <ArrowUp className="size-3" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
