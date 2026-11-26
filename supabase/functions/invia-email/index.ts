// Edge Function "invia-email": svuota la coda email_outbox.
// - le email "subito" partono alla prima esecuzione
// - quelle di chi ha scelto il riepilogo partono insieme, in una sola email, dalle 18:00 (ora italiana)
// Va pianificata ogni minuto (Supabase › Integrations › Cron, oppure pg_cron + pg_net: vedi README).
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';
import { rendiEmail, spedisci, testoSemplice, type Contenuto } from '../_shared/email.ts';

type Riga = { id: string; destinatario_id: string | null; a_email: string; a_nome: string; oggetto: string; contenuto: Contenuto; percorso: string; riepilogo: boolean; creata_il: string; tentativi: number };

const URL_PORTALE = (Deno.env.get('URL_PORTALE') ?? 'http://localhost:5173').replace(/\/$/, '');
const MAX_TENTATIVI = 5;

function oraRoma(d = new Date()) {
  const p = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', hour12: false }).format(d);
  return Number(p);
}

Deno.serve(async (req) => {
  // Solo chiamate con la chiave di servizio (cron) o con il segreto condiviso
  const segreto = Deno.env.get('CRON_SECRET');
  const auth = req.headers.get('authorization') ?? '';
  const servizio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!(auth === `Bearer ${servizio}` || (segreto && req.headers.get('x-cron-secret') === segreto))) {
    return new Response('Non autorizzato', { status: 401 });
  }
  const db = createClient(Deno.env.get('SUPABASE_URL')!, servizio, { auth: { persistSession: false } });
  const { data, error } = await db.from('email_outbox').select('*').is('inviata_il', null).lt('tentativi', MAX_TENTATIVI).order('creata_il').limit(200);
  if (error) return new Response(error.message, { status: 500 });
  const righe = (data ?? []) as Riga[];
  const logo = `${URL_PORTALE}/logo.svg`;
  let inviate = 0, errori = 0;

  const segna = async (ids: string[], err?: string) => {
    if (!err) await db.from('email_outbox').update({ inviata_il: new Date().toISOString(), errore: null }).in('id', ids);
    else for (const r of righe.filter((x) => ids.includes(x.id))) await db.from('email_outbox').update({ tentativi: r.tentativi + 1, errore: err.slice(0, 500) }).eq('id', r.id);
  };

  // 1. email immediate
  for (const r of righe.filter((x) => !x.riepilogo)) {
    const link = URL_PORTALE + r.percorso;
    try { await spedisci(r.a_email, r.oggetto, rendiEmail(r.contenuto, link, logo), testoSemplice(r.contenuto, link)); await segna([r.id]); inviate++; }
    catch (e) { await segna([r.id], String(e)); errori++; }
  }

  // 2. riepilogo delle 18:00: una sola email per persona con tutti gli aggiornamenti in coda
  if (oraRoma() >= 18) {
    const perPersona = new Map<string, Riga[]>();
    for (const r of righe.filter((x) => x.riepilogo)) perPersona.set(r.a_email, [...(perPersona.get(r.a_email) ?? []), r]);
    for (const [email, lista] of perPersona) {
      const primo = lista[0].contenuto;
      const c: Contenuto = {
        saluto: primo.saluto,
        paragrafi: [{ testo: lista.length === 1 ? 'Oggi c’è stato un aggiornamento su Gestione progetti:' : `Oggi ci sono stati ${lista.length} aggiornamenti su Gestione progetti:` },
          ...lista.map((x) => ({ testo: '• ' + x.oggetto }))],
        hasCard: false, card: null, cta: 'Apri il portale', hasNota: false, nota: '', piede: primo.piede,
      };
      try {
        await spedisci(email, lista.length === 1 ? lista[0].oggetto : `Riepilogo di oggi: ${lista.length} aggiornamenti`, rendiEmail(c, URL_PORTALE + '/', logo), testoSemplice(c, URL_PORTALE + '/'));
        await segna(lista.map((x) => x.id)); inviate += lista.length;
      } catch (e) { await segna(lista.map((x) => x.id), String(e)); errori++; }
    }
  }

  return new Response(JSON.stringify({ inviate, errori }), { headers: { 'Content-Type': 'application/json' } });
});
