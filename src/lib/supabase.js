import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://iyipxblbcssezllxrect.supabase.co'
const supabaseAnonKey = 'sb_publishable_-b2iYRCc3OpLot2DCJ4A1g_ufL_YDXv'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)