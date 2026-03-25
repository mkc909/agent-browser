"use client";

import { useState } from "react";
import { useStreamConnection } from "@/hooks/useStreamConnection";
import { useSessions } from "@/hooks/useSessions";
import { Viewport } from "@/components/Viewport";
import { ActivityFeed } from "@/components/ActivityFeed";
import { SessionTree } from "@/components/SessionTree";

function getPort(): number {
  if (typeof window === "undefined") return 9223;
  const params = new URLSearchParams(window.location.search);
  const p = params.get("port");
  return p ? parseInt(p, 10) || 9223 : 9223;
}

export default function DashboardPage() {
  const [activePort, setActivePort] = useState(getPort);
  const stream = useStreamConnection(activePort);
  const sessions = useSessions();

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-1 flex min-h-0">
        {/* Left pane: Session tree */}
        <div className="w-[200px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] min-h-0">
          <SessionTree
            sessions={sessions}
            activePort={activePort}
            tabs={stream.tabs}
            onSelectSession={setActivePort}
          />
        </div>

        {/* Center pane: Viewport */}
        <div className="flex-1 border-r border-[var(--border)] min-w-0">
          <Viewport
            frame={stream.currentFrame}
            viewportWidth={stream.viewportWidth}
            viewportHeight={stream.viewportHeight}
            browserConnected={stream.browserConnected}
            screencasting={stream.screencasting}
          />
        </div>

        {/* Right pane: Activity Feed */}
        <div className="w-[400px] shrink-0 min-h-0">
          <ActivityFeed events={stream.events} />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="h-7 border-t border-[var(--border)] bg-[var(--bg-secondary)] flex items-center px-3 gap-4 text-xs shrink-0">
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              stream.connected ? "bg-[var(--success)]" : "bg-[var(--error)]"
            }`}
          />
          <span className="text-[var(--text-muted)]">
            {stream.connected
              ? `ws://localhost:${activePort}`
              : "Connecting..."}
          </span>
        </div>
      </div>
    </div>
  );
}
