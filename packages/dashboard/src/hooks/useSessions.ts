"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface SessionInfo {
  session: string;
  port: number;
}

export function useSessions(pollInterval = 5000): SessionInfo[] {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const resp = await fetch("/api/sessions");
      if (resp.ok) {
        const data: SessionInfo[] = await resp.json();
        data.sort((a, b) => a.session.localeCompare(b.session));
        setSessions(data);
      }
    } catch {
      // Server unreachable -- keep last known sessions
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    timerRef.current = setInterval(fetchSessions, pollInterval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchSessions, pollInterval]);

  return sessions;
}
