import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// main.js calls getDb() and passes the result to page renderers
export async function getDb() {
  return supabase
}

// Unwrap Supabase responses — throws on error, returns data
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}
