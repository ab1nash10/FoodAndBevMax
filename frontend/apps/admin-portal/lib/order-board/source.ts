'use client';

import { ApiClientError } from '@aahar/api-client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { publicOrganizationApi } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { createBoardSimulation } from './mock';
import type { BoardFeed } from './rules';

/** Where the board's orders come from: the real feed; ?demo=1 runs the simulation instead. */
export const DATA_SOURCE: 'api' | 'mock' = 'api';
export const REFRESH_MS = 3000;
const MAX_BACKOFF_MS = 30_000;

function isInvalidLink(error: unknown): boolean {
  return error instanceof ApiClientError && (error.status === 404 || error.status === 400);
}

export interface BoardFeedState {
  feed: BoardFeed | undefined;
  /**
   * The board link was refused (wrong, replaced, or the restaurant is off): say so, and keep
   * asking slowly, so a link that works again brings the board back without a restart.
   */
  invalidLink: boolean;
  /** The last refresh failed; the last data stays on screen. */
  reconnecting: boolean;
  /** Milliseconds to add to this machine's clock to get the server's. */
  serverOffset: number;
}

/**
 * The board's feed, refreshed every REFRESH_MS. On errors (a refused link too) the last data
 * stays and the refresh slows down until it works again.
 */
export function useBoardFeed(
  restaurantId: string,
  { demo, token }: { demo?: boolean; token?: string },
): BoardFeedState {
  const source = demo ? 'mock' : DATA_SOURCE;
  const simulation = useMemo(() => (source === 'mock' ? createBoardSimulation() : null), [source]);
  const query = useQuery({
    enabled: simulation !== null || Boolean(token),
    queryFn: async () =>
      simulation
        ? simulation.feed(Date.now())
        : (await publicOrganizationApi.getBoardFeed(restaurantId, token ?? '')).data,
    queryKey: queryKeys.orderBoard(restaurantId, source),
    refetchInterval: (current) => {
      if (current.state.status !== 'error') return REFRESH_MS;

      // ponytail: with retry off, fetchFailureCount is 1 after every failed fetch, so this
      // stays at 6 s; count failures since the last success if a longer backoff is wanted.
      return Math.min(MAX_BACKOFF_MS, REFRESH_MS * 2 ** current.state.fetchFailureCount);
    },
    refetchIntervalInBackground: true,
    retry: false,
  });
  const serverOffset = query.data ? Date.parse(query.data.serverTime) - query.dataUpdatedAt : 0;
  const invalidLink = isInvalidLink(query.error);

  return {
    feed: query.data,
    invalidLink,
    reconnecting: query.isError && !invalidLink,
    serverOffset,
  };
}

/** The server's time, ticking every `everyMs`. */
export function useServerNow(serverOffset: number, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);

    return () => window.clearInterval(timer);
  }, [everyMs]);

  return now + serverOffset;
}
