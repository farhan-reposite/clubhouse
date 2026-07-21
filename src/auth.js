import { supabase } from './db.js'

export async function signIn(role, password) {
  const { data: email, error: rpcErr } = await supabase.rpc('get_email_by_role', { p_role: role })
  if (rpcErr || !email) throw new Error('Role not configured. Contact your administrator.')

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Incorrect password.')

  const roleData = await fetchRole(data.user.id)
  return { user: data.user, role: roleData }
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const role = await fetchRole(session.user.id)
  return { user: session.user, role }
}

async function fetchRole(userId) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, display_name')
    .eq('id', userId)
    .single()
  if (error || !data) throw new Error('User role not found. Contact your manager.')
  return data
}
