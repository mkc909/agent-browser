"use client";

import type { SessionInfo } from "@/hooks/useSessions";
import type { TabInfo } from "@/hooks/useStreamConnection";

interface SessionTreeProps {
  sessions: SessionInfo[];
  activePort: number;
  tabs: TabInfo[];
  onSelectSession: (port: number) => void;
}

function TabNode({ tab }: { tab: TabInfo }) {
  return (
    <div
      className={`flex items-center gap-2 pl-7 pr-2 py-1 text-xs truncate ${
        tab.active
          ? "text-[var(--text)]"
          : "text-[var(--text-muted)]"
      }`}
      title={tab.url}
    >
      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
        {tab.active ? "\u25B8" : "\u00B7"}
      </span>
      <span className="truncate">
        {tab.title || tab.url || `Tab ${tab.index}`}
      </span>
    </div>
  );
}

function SessionNode({
  session,
  isActive,
  tabs,
  onSelect,
}: {
  session: SessionInfo;
  isActive: boolean;
  tabs: TabInfo[];
  onSelect: () => void;
}) {
  return (
    <div>
      <button
        onClick={onSelect}
        className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
          isActive
            ? "bg-[var(--bg-tertiary)] text-[var(--text)]"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text)]"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            isActive ? "bg-[var(--success)]" : "bg-[var(--text-muted)]"
          }`}
        />
        <span className="font-mono font-semibold truncate">
          {session.session}
        </span>
        {isActive && tabs.length > 0 && (
          <span className="ml-auto text-[var(--text-muted)] tabular-nums">
            {tabs.length}
          </span>
        )}
      </button>
      {isActive && tabs.length > 0 && (
        <div className="pb-1">
          {tabs.map((tab) => (
            <TabNode key={tab.index} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionTree({
  sessions,
  activePort,
  tabs,
  onSelectSession,
}: SessionTreeProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[var(--border)] shrink-0">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
          Sessions
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.length === 0 ? (
          <div className="text-[var(--text-muted)] text-xs text-center py-4">
            No sessions
          </div>
        ) : (
          sessions.map((s) => (
            <SessionNode
              key={s.port}
              session={s}
              isActive={s.port === activePort}
              tabs={s.port === activePort ? tabs : []}
              onSelect={() => onSelectSession(s.port)}
            />
          ))
        )}
      </div>
    </div>
  );
}
