import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the canonical root env even when the server is started with
// `npm --prefix server start`, where process.cwd() is the server directory.
dotenv.config({ path: path.join(__dirname, '../../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const defaultPort = process.env.PORT || '3001';

export const config = {
  port: parseInt(defaultPort, 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // SQLite database
  database: {
    path: process.env.DATABASE_PATH || path.join(__dirname, '../../data/acestep.db'),
  },

  // ACE-Step API (local)
  acestep: {
    apiUrl: process.env.ACESTEP_API_URL || 'http://localhost:8001',
    gradioUrl: process.env.ACESTEP_GRADIO_URL || '',
  },

  // Pexels (optional - for video backgrounds)
  pexels: {
    apiKey: process.env.PEXELS_API_KEY || '',
  },

  // Gemini API
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '',
  },

  // OpenAI API (optional fallback for formatting)
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5.2',
    reasoningEffort: (process.env.OPENAI_REASONING_EFFORT || 'high') as 'none' | 'low' | 'medium' | 'high' | 'xhigh',
  },

  // Formatting provider
  format: {
    provider: (process.env.FORMAT_PROVIDER || 'auto') as 'auto' | 'gemini' | 'openai',
  },

  product: {
    timeZone: process.env.PRODUCT_TIME_ZONE || process.env.TZ || 'Europe/Bratislava',
  },

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  auth: {
    publicApiUrl: process.env.PUBLIC_API_URL || process.env.SERVER_PUBLIC_URL || `http://localhost:${defaultPort}`,
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    googleCallbackUrl: process.env.GOOGLE_OAUTH_CALLBACK_URL || '',
    sessionDays: parseInt(process.env.AUTH_SESSION_DAYS || '30', 10),
    superadminEmail: (process.env.SUPERADMIN_EMAIL || '').trim().toLowerCase(),
    passwordResetBaseUrl: process.env.PASSWORD_RESET_BASE_URL || process.env.FRONTEND_URL || `http://localhost:${defaultPort}`,
  },

  // Storage (local only)
  storage: {
    provider: 'local' as const,
    audioDir: process.env.AUDIO_DIR || path.join(__dirname, '../../public/audio'),
  },

  // Training datasets (inside ACE-Step-1.5 so Gradio can access them)
  datasets: {
    dir: process.env.DATASETS_DIR || path.join(__dirname, '../../../ACE-Step-1.5/datasets'),
    uploadsDir: process.env.DATASETS_UPLOADS_DIR || path.join(__dirname, '../../../ACE-Step-1.5/datasets/uploads'),
  },

  // Simplified JWT (for local session, not critical security)
  jwt: {
    secret: process.env.JWT_SECRET || 'ace-step-ui-local-secret',
    expiresIn: '365d', // Long-lived for local app
  },
};
