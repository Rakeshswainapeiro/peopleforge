/** An external dependency failed or timed out. The API maps it to 503 (retry later). */
export class IntegrationError extends Error {
  constructor(
    readonly dependency: 'object_store' | 'malware_scanner' | 'email',
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationError';
  }
}

/**
 * An email could not be sent. `reason` is a short code stored with the outbox row (`smtp_550`,
 * `timeout`), never the server's text, which can echo addresses. `permanent`: retrying won't
 * help (the address was refused), so the worker gives up at once.
 */
export class EmailDeliveryError extends Error {
  constructor(
    readonly reason: string,
    readonly permanent: boolean,
  ) {
    super(`Email not sent: ${reason}`);
    this.name = 'EmailDeliveryError';
  }
}
