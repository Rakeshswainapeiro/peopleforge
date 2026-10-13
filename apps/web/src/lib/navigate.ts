/** Full-page navigation (e.g. to the identity provider). A module so tests can replace it. */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
