"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

function useIsClient(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 86_400_000 * 7) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Renders a relative time ("5m ago") that is safe for server-side rendering.
 *
 * `Date.now()` inside `relativeTime` produces different output on the server
 * and the client, which breaks hydration. This component uses
 * `useSyncExternalStore` so the server and the client's first render agree
 * (both show the absolute timestamp), then re-renders with the relative
 * value once mounted on the client.
 */
export function RelativeTime({
  iso,
  style,
  className,
}: {
  iso: string | null;
  style?: React.CSSProperties;
  className?: string;
}) {
  const isClient = useIsClient();
  return (
    <span style={style} className={className}>
      {iso ? (isClient ? relativeTime(iso) : absoluteTime(iso)) : "—"}
    </span>
  );
}