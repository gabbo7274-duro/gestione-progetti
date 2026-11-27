# Gestione progetti

Portale per seguire i progetti dei clienti (novità, richieste, preventivi, pagamenti, scadenze), con due versioni: **admin** (un solo amministratore) e **cliente** (referenti invitati). Il README spiega l'installazione passo per passo: leggilo prima di toccare la configurazione di Supabase.

- `supabase/`: Postgres su Supabase con **tutta** la logica (migrazioni SQL), Edge Functions (Deno) per le email, modelli delle email di Auth.
- `web/`: React 18 + Vite 5 + TypeScript strict + react-router 6. Nessun framework CSS: tutto in `src/stile.css`.

Tutto il codice, i nomi (tabelle, funzioni, variabili, componenti) e i testi dell'interfaccia sono in italiano: continua così.

## Comandi

```bash
cd web && npm run dev        # http://localhost:5173 (serve web/.env.local, vedi .env.example)
cd web && npm run typecheck  # tsc -b, da lanciare dopo ogni modifica al frontend
cd web && npm run build      # typecheck + build in web/dist
cd web && npm run deploy     # build + pubblicazione su Cloudflare (web/wrangler.jsonc)
supabase/tests/run.sh        # test dei flussi su un Postgres qualsiasi (servono bash e psql)
```

- La CLI di Supabase (v3) si usa con `npx supabase <comando>`, sempre **da questa cartella** (`gestione-progetti`), non dalla cartella padre: la CLI cerca `supabase/` risalendo dalla cartella corrente.
- In CLI v3 `db push` punta al database **locale** per impostazione predefinita: per il progetto remoto serve `npx supabase db push --remote` (prima `--dry-run`). Mai `--include-seed` sul remoto.
- `functions deploy` e `secrets set` usano già il progetto collegato. Senza Docker: `npx supabase functions deploy <nome> --use-api`.
- Il progetto remoto è su Postgres 17 (`config.toml` dice 15: vale solo per lo stack locale).
- Su questa macchina non ci sono `psql` né Deno: i test SQL e le Edge Functions non si possono provare in locale senza installarli (o senza `npx supabase start`, che richiede Docker).
- `web/dist/` è output di build: non modificarlo a mano.
- Hosting del portale: Cloudflare, come Worker con soli file statici (`not_found_handling: single-page-application`). Il backend resta Supabase. Le `VITE_…` sono incluse al momento della build: se cambiano, va rifatto il deploy. `vercel.json` e `public/_redirects` restano solo per chi pubblica altrove.

## Architettura: la logica sta nel database

- Il browser **non scrive mai** nelle tabelle: le RLS concedono solo `select` a `authenticated`. Ogni azione è una funzione `security definer` chiamata con `supabase.rpc(...)` tramite `rpc()` / `useDati()` di `web/src/lib/api.ts`.
- Ogni schermata ha una funzione di lettura in `…05_letture.sql` (`da_gestire`, `dettaglio_richiesta`, `dettaglio_progetto`, …) che restituisce JSON già pronto, con stati e permessi calcolati. Il frontend mostra i dati e basta: non duplicare regole o calcoli in React.
- Le azioni (`…04_azioni.sql`) iniziano con `_richiedi_admin()` o `_richiedi_utente()`, restituiscono `jsonb` con `messaggio` (mostrato come toast) e segnalano gli errori con `_errore('testo per l'utente')` (codice `P0001`, mostrato come avviso). Altri errori diventano il banner "rete".
- I calcoli fiscali dei preventivi (ritenuta 20%, bollo sopra 77,47 €, IVA o forfettario, numerazione) stanno in `…02_calcoli.sql`. Per le anteprime il frontend usa `anteprima_preventivo`.
- Email: le azioni chiamano `notifica(tipo, dati)` → righe in `email_outbox` → la Edge Function `invia-email` (pianificata ogni minuto) le spedisce con Resend. Il riepilogo delle 18:00 è gestito dalla funzione. Non mandare email dal browser.
- Cronologia di ogni richiesta in `eventi` (scritta da `_evento`). Il cliente la legge solo con `cronologia()`, che nasconde i destinatari.
- Allegati: bucket privato `allegati`. Il file si carica in `<auth.uid()>/…`, poi l'azione lo registra con `_registra_allegati`. Si legge con URL firmati (`web/src/lib/file.ts`).
- Invito dei referenti: Edge Function `invita-referente` → `controlla_invito` (con il token dell'admin) → `auth.admin.inviteUserByEmail` → `crea_profilo_invitato` (chiave di servizio). Finché `invito_in_attesa` è vero, il portale mostra solo "nuova password".
- Date "di oggi" sempre con `oggi()` (Europe/Rome). pg_cron gira in UTC: `'0 7 * * *'` vuol dire le 8 d'inverno e le 9 d'estate.

## Regole quando modifichi il database

- **Non modificare le migrazioni già applicate** al progetto remoto: aggiungi un nuovo file `supabase/migrations/AAAAMMGGHHMMSS_nome.sql`.
- **Ogni nuova funzione chiamabile dal portale va abilitata esplicitamente**: `…06_permessi.sql` revoca `execute` su tutte le funzioni a `anon`/`authenticated` e cambia i privilegi predefiniti. Aggiungi `grant execute on function nome(tipi) to authenticated;` con la firma esatta. Lo stesso vale se cambi la firma di una funzione esistente (vecchia firma da `drop`, nuova da abilitare).
- Le funzioni interne hanno il prefisso `_` (o sono usate solo da altre funzioni) e non vanno abilitate.
- Ogni nuova tabella: `enable row level security`, una policy di sola lettura e `grant select ... to authenticated` solo se il portale deve leggerla. Nessuna policy di scrittura.
- Le funzioni `security definer` vanno sempre con `set search_path = public`.
- Il cliente non deve mai vedere bozze (novità e preventivi), scadenze o link non visibili, note interne, dati del prestatore: verifica le policy e le funzioni di lettura quando aggiungi campi.
- Dopo una modifica allo schema aggiorna, se serve, `supabase/seed.sql` (solo dati locali: non va mai in produzione) e `supabase/tests/test_flussi.sql`.

## Supabase: chiavi API (attenzione)

Le Edge Functions leggono `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` (chiavi *legacy*), e `invita-referente` usa `verify_jwt = true`. Supabase sta ritirando le chiavi legacy (scadenza indicata "inizio 2027"; i progetti nuovi potrebbero già non averle) a favore di `sb_publishable_…` / `sb_secret_…`, che nelle Edge Functions arrivano come JSON in `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` (chiave `default`). La verifica `verify_jwt` della piattaforma funziona solo con le chiavi legacy. Se le funzioni rispondono 401 o "supabaseKey is required", la causa è questa: leggi le chiavi nuove come alternativa e deploya `invita-referente` con `--no-verify-jwt` (il controllo dell'admin lo fa già `controlla_invito`). Nel frontend `VITE_SUPABASE_ANON_KEY` accetta anche la chiave publishable.

## Frontend

- `src/admin/` schermate admin, `src/cliente/` schermate cliente, `src/comune/` sessione, layout, notifiche, stampa PDF, `src/componenti/` elementi del design.
- Sessione e profilo in `comune/Sessione.tsx` (`useSessione`, `useIo`). Il profilo arriva da `mio_profilo()`.
- Auth con `flowType: 'implicit'` (serve per i link di invito creati dal server): non cambiarlo senza rivedere invito, recupero password e magic link.
- I PDF di preventivi e ricevute sono pagine `/stampa/:tipo/:id` da stampare con "Salva come PDF" del browser.
- Formati italiani: date gg/mm/aaaa, virgola decimale, euro (vedi `src/lib/formato.ts` e le funzioni `eur`, `data_it` in SQL).
