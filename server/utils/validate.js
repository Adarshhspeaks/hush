// Validation utilities for IDs, Base64 strings, and socket acknowledgements

// Validates 16-character url-safe nanoid format for room IDs
export const idOk = (id) => typeof id === 'string' && /^[\w-]{16}$/.test(id);

// Validates non-empty url-safe Base64 strings up to specified maximum length
export const b64ok = (s, max) =>
  typeof s === 'string' && s.length > 0 && s.length <= max && /^[\w-]+$/.test(s);

// Helper to safely invoke a socket ack callback with an error object
export const fail = (ack, error) => typeof ack === 'function' && ack({ error });
