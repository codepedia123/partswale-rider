const envValue = (value: string | undefined) => value?.trim() ?? "";

export const env = {
  supabaseUrl: envValue(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: envValue(import.meta.env.VITE_SUPABASE_ANON_KEY),
  n8nBaseUrl: envValue(import.meta.env.VITE_N8N_BASE_URL),
};

export const isSupabaseConfigured =
  env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
