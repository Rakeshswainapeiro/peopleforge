/** Joins class names, skipping falsy values. Components accept `className` to extend, never to restyle. */
export function cn(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Variant lookup through a Map (no object-key injection); an unknown key adds no classes. */
export function variantClass<K extends string>(table: ReadonlyMap<K, string>, key: K): string {
  return table.get(key) ?? '';
}
