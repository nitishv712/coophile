/** The shape Next hands a page for `?a=1&a=2`. */
export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * A repeated query parameter arrives as an array. Nothing here means anything
 * useful twice over, so take the first occurrence and ignore the rest.
 */
export function first(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
