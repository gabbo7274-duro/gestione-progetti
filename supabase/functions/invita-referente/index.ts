// Edge Function "invita-referente": l'amministratore invita una persona del cliente.
// 1. controlla con il token di chi chiama che sia l'amministratore e che i dati vadano bene (funzione controlla_invito)
// 2. crea l'utente in Supabase Auth e gli manda l'email di invito (modello supabase/templates/invito.html)
// 3. crea il profilo "in attesa di invito" collegato al cliente
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';
import { cors } from '../_shared/email.ts';

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const servizio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const { cliente_id, nome, cognome, email, redirect } = await req.json().catch(() => ({}));

  // con il token di chi chiama: i controlli li fa il database
  const comeUtente = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data: ok, error: errControllo } = await comeUtente.rpc('controlla_invito', { p_cliente: cliente_id, p_nome: nome, p_cognome: cognome, p_email: email });
  if (errControllo) return json({ errore: errControllo.code === 'P0001' ? errControllo.message : 'Accesso non valido: entra di nuovo nel portale.' }, 400);

  const admin = createClient(url, servizio, { auth: { persistSession: false } });
  const indirizzo = (ok as { email: string }).email;
  const portale = Deno.env.get('URL_PORTALE');
  const { data: invito, error: errInvito } = await admin.auth.admin.inviteUserByEmail(indirizzo, {
    redirectTo: portale ? `${portale.replace(/\/$/, '')}/nuova-password?modo=invito` : redirect,
    data: { nome: String(nome).trim(), cognome: String(cognome).trim() },
  });
  if (errInvito || !invito.user) {
    const giaRegistrato = errInvito?.message?.toLowerCase().includes('already');
    return json({ errore: giaRegistrato ? 'Questa email è già associata a un account.' : 'Non è stato possibile inviare l’invito: riprova tra qualche istante.' }, 400);
  }
  const { error: errProfilo } = await admin.rpc('crea_profilo_invitato', { p_user: invito.user.id, p_cliente: cliente_id, p_nome: nome, p_cognome: cognome, p_email: indirizzo });
  if (errProfilo) {
    await admin.auth.admin.deleteUser(invito.user.id);
    return json({ errore: 'Non è stato possibile creare il referente: riprova.' }, 400);
  }
  return json({ email: indirizzo });
});
