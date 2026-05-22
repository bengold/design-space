import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// AgentPresence
// ─────────────
// Small status indicator that tells the user whether the agent has been
// touching the design recently. We poll events.jsonl every 5s and surface:
//   • when the latest event landed (relative time)
//   • a coloured dot — green when activity within the last ~2 minutes,
//     amber when within ~15 minutes, dim when stale or no events at all
//
// The chrome surface exists because Design Space is a human↔agent workspace,
// not a static prototype viewer — the user needs to know whether the agent
// is "in the room" without watching a terminal.

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const RECENT_WINDOW_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

function relativeTime(ms) {
  if (ms < 60_000) return 'just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function fetchLastEvent(designName) {
  try {
    const res = await fetch(`/designs/${designName}/events.jsonl`, { cache: 'no-store' });
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split('\n').filter(Boolean);
    if (!lines.length) return null;
    // Walk from the tail so a malformed line doesn't shadow a good one.
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const ev = JSON.parse(lines[i]);
        if (ev?.at) return ev;
      } catch {
        /* skip malformed */
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default function AgentPresence({ designName }) {
  const [lastEvent, setLastEvent] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    let timer;
    const tick = async () => {
      const ev = await fetchLastEvent(designName);
      if (cancelledRef.current) return;
      setLastEvent(ev);
      setNow(Date.now());
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    tick();
    return () => {
      cancelledRef.current = true;
      clearTimeout(timer);
    };
  }, [designName]);

  // Independent ticker so the relative-time label refreshes even when no new
  // events land — without re-fetching the file every second.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastAtMs = lastEvent?.at ? Date.parse(lastEvent.at) : null;
  const age = lastAtMs ? now - lastAtMs : null;
  const state =
    age == null
      ? 'idle'
      : age <= ACTIVE_WINDOW_MS
        ? 'active'
        : age <= RECENT_WINDOW_MS
          ? 'recent'
          : 'idle';

  // Turn the raw event type into a phrase that names *what* the agent did, so
  // the chrome conveys activity instead of stale connectivity. The timestamp
  // moves into the tooltip — visible-on-demand, off the constantly-ticking
  // critical path.
  const activityLabel =
    state === 'active'
      ? eventActivityPhrase(lastEvent)
      : state === 'recent'
        ? 'Agent watching'
        : lastAtMs
          ? 'Agent idle'
          : 'Agent ready';

  const dotClass =
    state === 'active'
      ? 'bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129_/_0.15)]'
      : state === 'recent'
        ? 'bg-amber-500'
        : 'bg-muted-foreground/40';

  const detail = age != null ? ` · ${relativeTime(age)}` : '';

  return (
    <div
      aria-label={`${activityLabel}${detail}`}
      title={
        lastEvent
          ? `Last event: ${lastEvent.type}${detail}`
          : 'No events recorded yet — the agent will appear here when it acts'
      }
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full transition-colors', dotClass)} />
      <span className="tracking-tight">{activityLabel}</span>
    </div>
  );
}

// Map event.type → short present-tense phrase. Falls back to "Agent active" so
// new event types don't fail loud; the title tooltip still surfaces the raw
// type for debugging.
function eventActivityPhrase(ev) {
  if (!ev?.type) return 'Agent active';
  switch (ev.type) {
    case 'comment.sent':
    case 'comment.added':
      return 'Routed a comment';
    case 'comment.resolved':
      return 'Resolved a comment';
    case 'overrides.changed':
      return 'Editing styles';
    case 'tweaks.changed':
      return 'Tuning tweaks';
    case 'questions.asked':
      return 'Asked a question';
    case 'questions.answered':
      return 'Got your answer';
    case 'design.saved':
    case 'persist.write':
      return 'Saved changes';
    default:
      return 'Agent active';
  }
}
