/** One visual object per authored object, with a shape-state rather than a percentage. */
export function getObjectSnapshotStates(
  total: number,
  saved: number,
): readonly ('saved' | 'scorched')[] {
  return Array.from({ length: total }, (_, index) => (index < saved ? 'saved' : 'scorched'));
}
