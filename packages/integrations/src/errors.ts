/** An external dependency failed or timed out. The API maps it to 503 (retry later). */
export class IntegrationError extends Error {
  constructor(
    readonly dependency: 'object_store' | 'malware_scanner',
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}
