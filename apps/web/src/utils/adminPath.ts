/** Staff pages. Only these may use the browser's storage without the visitor's cookie consent. */
export function isAdminPath(pathname: string = window.location.pathname): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}
