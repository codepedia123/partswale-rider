import { createClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        headers: {
          "x-client-info": "partswale-rider-webapp",
        },
      },
    })
  : null;
