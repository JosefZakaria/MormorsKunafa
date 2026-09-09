/**
 * Express 5 represents route parameters as strings or string arrays in its
 * request types. Named, non-wildcard parameters in this API must be singular;
 * fail closed if a malformed request ever supplies another shape.
 */
export function singleRouteParam(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** Express 5 exposes a named wildcard as one segment per array entry. */
export function joinedWildcardRouteParam(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  return Array.isArray(value) && value.every((part) => typeof part === 'string')
    ? value.join('/')
    : '';
}
