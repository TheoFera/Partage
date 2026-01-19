import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase: VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent etre configures.');
}

let supabase: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey);
}

export const getSupabaseClient = () => {
  if (!supabase) {
    throw new Error('Configurez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY pour utiliser Supabase.');
  }
  return supabase;
};

export { supabase };
