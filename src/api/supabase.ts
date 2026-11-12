/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (!supabaseInstance) {
    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
    const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim().replace(/^['"]|['"]$/g, '');

    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-id')) {
      throw new Error(
        'Thiếu thông tin đăng nhập Supabase. Vui lòng thiết lập VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trong biến môi trường.'
      );
    }

    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }

  return supabaseInstance;
};
