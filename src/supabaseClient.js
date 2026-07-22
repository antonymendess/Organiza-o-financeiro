import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Faltam as variáveis VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY. ' +
    'Configure o arquivo .env (local) ou as Environment Variables no Vercel.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
