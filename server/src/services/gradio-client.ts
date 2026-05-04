import { Client } from "@gradio/client";
import { config } from '../config/index.js';

let clientInstance: Client | null = null;
let connectionPromise: Promise<Client> | null = null;

async function fetchOk(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

export async function isAceStepApiAvailable(): Promise<boolean> {
  return fetchOk(`${config.acestep.apiUrl}/v1/models`);
}

async function resolveGradioUrl(): Promise<string | null> {
  if (config.acestep.gradioUrl) return config.acestep.gradioUrl;

  const apiAvailable = await isAceStepApiAvailable();
  if (apiAvailable) return null;

  return config.acestep.apiUrl;
}

/**
 * Get a lazy-initialized Gradio client connected to the ACE-Step Gradio app.
 * Caches the connection for reuse across requests.
 */
export async function getGradioClient(): Promise<Client> {
  if (clientInstance) return clientInstance;
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    try {
      const gradioUrl = await resolveGradioUrl();
      if (!gradioUrl) {
        throw new Error('ACE-Step Gradio URL is not configured. Set ACESTEP_GRADIO_URL to enable Gradio-only features.');
      }

      const client = await Client.connect(gradioUrl, {
        events: ["data", "status"],
      });
      clientInstance = client;
      console.log(`[Gradio] Connected to ${gradioUrl}`);
      return client;
    } catch (error) {
      console.error(`[Gradio] Failed to connect:`, error);
      throw error;
    } finally {
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Reset the cached Gradio client, forcing a new connection on next use.
 */
export function resetGradioClient(): void {
  clientInstance = null;
  connectionPromise = null;
}

/**
 * Check if the Gradio app is reachable.
 * Tries multiple well-known endpoints to handle version differences.
 */
export async function isGradioAvailable(): Promise<boolean> {
  const baseUrl = await resolveGradioUrl();
  if (!baseUrl) return false;

  const candidates = [
    `${baseUrl}/gradio_api/info`, // Gradio 5+
    `${baseUrl}/config`,          // Gradio client fallback
    `${baseUrl}/info`,            // Gradio 4.x fallback
  ];

  for (const url of candidates) {
    if (await fetchOk(url)) return true;
  }

  return false;
}
