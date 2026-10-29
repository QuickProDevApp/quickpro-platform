/** Computes which ids to add and remove to turn `current` into `desired`. */
export function diffIds(current: string[], desired: string[]) {
  const have = new Set(current);
  const want = new Set(desired);
  return {
    add: [...want].filter((id) => !have.has(id)),
    remove: [...have].filter((id) => !want.has(id)),
  };
}
