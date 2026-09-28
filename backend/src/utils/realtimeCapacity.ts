export type RealtimeClientCounts = {
  totalClients: number;
  byAdmin: Record<string, number>;
};

export function hasRealtimeCapacity(
  counts: RealtimeClientCounts,
  adminId: string,
  maximumPerAdmin = 5,
  maximumTotal = 100
): boolean {
  return (
    Number.isSafeInteger(counts.totalClients) &&
    counts.totalClients >= 0 &&
    counts.totalClients < maximumTotal &&
    (counts.byAdmin[adminId] ?? 0) < maximumPerAdmin
  );
}
