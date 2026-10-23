// Reintenta llamadas a la API ante caídas, esperando 2^intento * baseDelayMs (+ jitter) entre intentos
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === maxRetries) break;
      const delay = Math.pow(2, attempt) * baseDelayMs + Math.random() * 500 * (baseDelayMs / 1000);
      console.warn(
        `⚠️ [Exponential Backoff] Reintento ${attempt + 1}/${maxRetries} tras error de API (${err?.message || err}). Esperando ${Math.round(delay)}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
