import { readDataSnapshot, type DataSnapshotKind } from "@/lib/database.server";
import { EMPTY_SNAPSHOTS, type SnapshotKindMap } from "@/lib/snapshot-types";
import { normalizeQuartilSnapshot, type QuartilSnapshot } from "@/lib/quartil";

export type SnapshotFor<K extends DataSnapshotKind> = SnapshotKindMap[K];

export function getDataSnapshot<K extends DataSnapshotKind>(kind: K): SnapshotFor<K> {
  const stored = readDataSnapshot<SnapshotFor<K>>(kind);
  const snapshot = stored ?? EMPTY_SNAPSHOTS[kind];
  return (
    kind === "quartil" ? normalizeQuartilSnapshot(snapshot as QuartilSnapshot) : snapshot
  ) as SnapshotFor<K>;
}
