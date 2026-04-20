# React Suspense log

Always-on recorder of Suspense transitions. Unlike `react suspense`, which
takes a snapshot of whatever boundaries are currently suspended, the log
records every `suspended -> resolved` edge as it happens — with full
`suspendedBy` metadata captured synchronously before React clears it.

**Related**: [SKILL.md](../SKILL.md), [profiling.md](profiling.md).

## What it is

A page-side ring buffer (capacity 2000 events) installed by
`--enable react-devtools`. Every time a Suspense boundary flips from
"resolved" to "suspended", the recorder calls `inspectElement` on the same
stack so `suspendedBy` / `ownerStack` / `awaiterStack` are captured before
React's next commit clears them. Every time it flips back to "resolved",
duration is recorded.

## When to use it

- You are debugging a Partial Prerendering (PPR) shell: client-side
  suspenders are observable under the PPR lock, but server-side suspenders
  (`cookies()`, `headers()`, server `fetch`, `"use cache"` miss) only
  appear during the brief streaming window after unlock. A snapshot taken
  after the page stabilizes shows `suspendedBy: []` universally.
- You want a timeline of when each boundary suspended and resolved, not
  just a current-state readout.
- You want to bracket an interaction (click a button, change a cookie)
  and see what Suspense work the interaction produced.

Use plain `react suspense` when you only need the current tree's blockers
for a static page.

## Usage

```bash
agent-browser open --enable react-devtools <url>

# Dump the log as a markdown table + timeline.
agent-browser react suspense-log

# Machine-readable JSON (every field).
agent-browser react suspense-log --json

# Wipe the buffer before the next interaction.
agent-browser react suspense-log --clear

# Skip source-map resolution (faster, raw bundle frames only).
agent-browser react suspense-log --no-source-maps
```

`--enable react-devtools` is required at launch. Without it, the recorder
is not installed and the command errors.

## Reading the output

The JSON event shape:

```jsonc
{
  "events": [
    {
      "t": 123.4,                      // page-local performance.now() ms
      "id": 34571,                     // React fiber id
      "name": "TeamDeploymentsLayout",
      "parentID": 34560,
      "event": "suspended",            // "suspended" | "resolved"
      "environments": ["Server"],
      "suspendedBy": [
        {
          "name": "cookies",           // React's label for the blocker
          "description": "cookies()",
          "env": "Server",
          "ownerName": "fetchTeamContext",
          "ownerStack": [
            {
              "function": "fetchTeamContext",
              "file": "/app/(dash)/context.tsx",    // source-mapped
              "line": 42,
              "column": 8,
              "bundle": ["fetchTeamContext", "...bundle url...", 47, 12]
            }
          ],
          "awaiterName": null,
          "awaiterStack": null
        }
      ],
      "unknownSuspenders": null,
      "jsxSource": ["...bundle url...", 18, 9]
    },
    {
      "t": 178.2,
      "id": 34571,
      "event": "resolved",
      "durationMs": 54.8
    }
  ],
  "bufferCapacity": 2000,
  "overflowed": false,                 // true if events were dropped
  "startedAt": 11.2                    // page-local t when recorder installed
}
```

`unknownSuspenders` is a reason string when React couldn't attribute the
suspender (production build, old React, library `throw`ing a Promise
instead of using `use()`).

## PPR two-phase recipe

Cookie-driven PPR locks show client suspenders in phase 1 (cookie set) and
both client + server suspenders during the streaming window of phase 2
(cookie cleared). The recorder captures both phases if you bracket them:

```bash
agent-browser open --enable react-devtools http://localhost:3000/dashboard
# Phase 1: PPR lock on — shell should be static aside from client blockers.
agent-browser cookies set ppr-instant-testing 1
agent-browser react suspense-log --clear
agent-browser navigate http://localhost:3000/dashboard/teams
sleep 1
agent-browser react suspense-log --json > phase1.json

# Phase 2: unlock and observe the streaming window.
agent-browser cookies clear ppr-instant-testing
agent-browser react suspense-log --clear
agent-browser reload
sleep 2
agent-browser react suspense-log --json > phase2.json
```

Match `suspended` / `resolved` pairs per `id` to derive the per-boundary
picture. A boundary that suspended in phase 2 but not phase 1 is
server-side; the `suspendedBy[0].name` tells you which server API
(`cookies`, `headers`, `fetch`, etc.).

## Source-map resolution

On by default. The Rust side fetches `<bundle>.map` via the running
browser so the request inherits session state, decodes it with the
`sourcemap` crate, and replaces each `ownerStack` / `awaiterStack` entry
with a resolved `{ function, file, line, column, bundle }` object. If a
`.map` is missing or unparseable, the frame stays as the raw 4-tuple
`[function, bundleUrl, line, column]` — source mapping never fails the
command.

Pass `--no-source-maps` to skip resolution entirely (faster on large
logs, and useful if you want to compare against the bundle frames the
browser natively reports).

## Buffer management

2000 events is roughly 80 KB serialized. If a long-running session
overflows the ring, the oldest events drop and `overflowed: true` is
set on the next read. For diagnostic loops, call `--clear` before each
interaction so you only see transitions from the window you care about.
