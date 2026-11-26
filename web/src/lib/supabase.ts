import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const chiave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurato = !!url && !!chiave;

// Senza configurazione l'app mostra una pagina che spiega cosa manca (vedi App.tsx).
export const supabase = createClient(url || 'http://localhost:54321', chiave || 'manca-la-chiave', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});
