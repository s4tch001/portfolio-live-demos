const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');

export const SUPABASE_PUBLISHABLE_KEY = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
);

export const WORKER_URL = supabaseUrl
  ? `${supabaseUrl}/functions/v1/cn-api`
  : '';

// The disposable preview uses bounded HTTP refreshes instead of the original
// long-lived custom WebSocket server.
export const WS_BASE = '';
