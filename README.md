# Gestione progetti

Portale per seguire i progetti dei clienti: novità, richieste, preventivi, pagamenti e scadenze.
Ha due versioni, **admin** e **cliente**, costruite sul design “nuovo stile” di Claude Design.

- **`supabase/`**: il database e tutta la logica (Postgres su Supabase), le Edge Functions per le email e i modelli delle email di accesso.
- **`web/`**: il portale (React + Vite + TypeScript). Mostra i dati e chiama le funzioni del database, senza regole sue.

## Dove sta la logica

Le regole del portale stanno nel database, in `supabase/migrations/`. Il browser non scrive mai direttamente nelle tabelle (le RLS lo vietano): ogni pulsante chiama una funzione con `supabase.rpc(...)`. La funzione controlla chi la chiama, applica le regole, aggiorna i dati, scrive la cronologia e mette in coda le email.

| File | Cosa contiene |
| --- | --- |
| `…01_schema.sql` | Tabelle, tipi, permessi di lettura (RLS): il cliente vede solo i suoi dati e mai le bozze |
| `…02_calcoli.sql` | Calcolo dei preventivi (ritenuta 20%, marca da bollo sopra 77,47 €, IVA o forfettario), controlli su partita IVA e codice fiscale, formattazione |
| `…03_notifiche.sql` | Chi riceve quale email (preferenze, “le mie richieste” / “tutte”, riepilogo delle 18) e coda `email_outbox` |
| `…04_azioni.sql` | Le azioni: richieste, messaggi, preventivi (bozza, invio con numerazione, risposta del cliente), pagamenti e ricevute, novità, scadenze, link, note, dati fiscali |
| `…05_letture.sql` | Una funzione per ogni schermata (`da_gestire`, `dettaglio_richiesta`, `dettaglio_progetto`, …) con stati e permessi già calcolati, documenti PDF |
| `…06_permessi.sql` | Chi può chiamare quali funzioni, bucket privato degli allegati, avvisi automatici delle scadenze (pg_cron) |

I test dei flussi principali sono in `supabase/tests/`. Girano su un Postgres qualsiasi, senza Supabase:

```bash
supabase/tests/run.sh
```

## Mettere in piedi Supabase

1. Crea un progetto su [supabase.com](https://supabase.com) e installa la [CLI](https://supabase.com/docs/guides/cli).
2. Collega la cartella e carica il database:

   ```bash
   supabase link --project-ref IL_TUO_PROJECT_REF
   ```

   ```bash
   supabase db push
   ```

   I dati di esempio (`supabase/seed.sql`) servono solo in locale (`supabase start` e `supabase db reset`). Non caricarli in produzione.

3. **Crea il tuo utente amministratore.** In Authentication › Users usa “Add user” con la tua email e una password. Poi, nell’editor SQL:

   ```sql
   insert into profili (id, ruolo, nome, cognome, email)
   select id, 'admin', 'Nome', 'Cognome', email from auth.users where email = 'la-tua@email.it';
   ```

   I tuoi dati per preventivi e ricevute li compili dal portale, nella pagina “I tuoi dati”.

4. **Accesso (Authentication › URL Configuration e Providers › Email):**
   - Site URL: l’indirizzo del portale, per esempio `https://portale.tuodominio.it`
   - Redirect URLs: `https://portale.tuodominio.it/nuova-password` e `https://portale.tuodominio.it/`
   - disattiva le nuove iscrizioni: l’accesso è solo su invito;
   - lunghezza minima della password: 10.

5. **Email di accesso (Authentication › Email Templates):** copia il contenuto di `supabase/templates/invito.html`, `recupero.html` e `link-accesso.html` nei modelli “Invite user”, “Reset password” e “Magic link”. Hanno la stessa grafica delle notifiche. Imposta anche un SMTP tuo (Authentication › SMTP Settings, per esempio quello di Resend): quello di Supabase serve solo per le prove.

6. **Edge Functions:**

   ```bash
   supabase functions deploy invita-referente
   ```

   ```bash
   supabase functions deploy invia-email --no-verify-jwt
   ```

   ```bash
   supabase secrets set RESEND_API_KEY=... EMAIL_MITTENTE="Gestione progetti <notifiche@tuodominio.it>" URL_PORTALE=https://portale.tuodominio.it CRON_SECRET=una-stringa-lunga-a-caso
   ```

   - `invita-referente`: il pulsante “Invita referente” crea l’utente e manda l’invito.
   - `invia-email`: spedisce la coda delle notifiche. Le email di chi ha scelto il riepilogo partono insieme dalle 18:00.

7. **Pianifica l’invio delle email ogni minuto** (Database › Extensions: attiva `pg_cron` e `pg_net`), poi nell’editor SQL:

   ```sql
   select cron.schedule('invia-email', '* * * * *', $$
     select net.http_post(
       url := 'https://IL_TUO_PROJECT_REF.supabase.co/functions/v1/invia-email',
       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'LA_TUA_CRON_SECRET'),
       body := '{}'::jsonb)
   $$);
   ```

   Gli avvisi delle scadenze (30 giorni prima) li pianifica già la migrazione, ogni mattina, se `pg_cron` è attivo.

## Il portale web

```bash
cd web
```

```bash
npm install
```

```bash
cp .env.example .env.local
```

In `.env.local` metti l’URL del progetto e la chiave `anon` (Project Settings › API). Poi:

```bash
npm run dev
```

Per la pubblicazione, `npm run build` crea la cartella `web/dist`, da caricare su Vercel, Netlify o simili. I file `vercel.json` e `public/_redirects` fanno funzionare i link diretti alle pagine.

**Su Cloudflare** (configurazione in `web/wrangler.jsonc`): la prima volta `npx wrangler login`, poi `npm run deploy`, che crea la build e la pubblica. Le variabili `VITE_…` finiscono nella build, quindi `.env.local` va compilato prima. Dopo la prima pubblicazione metti l'indirizzo del portale nella Site URL e nelle Redirect URLs di Supabase e nel segreto `URL_PORTALE`.

`VITE_EMAIL_CONTATTO`, facoltativa, è l’indirizzo mostrato a chi ha l’account disattivato.

### Struttura

- `src/admin/`: Da gestire, clienti, progetto, editor delle novità, richiesta, i tuoi dati
- `src/cliente/`: i miei progetti, progetto, nuova o modifica richiesta, richiesta
- `src/comune/`: intestazione, sessione, notifiche, parti condivise della richiesta, stampa dei PDF
- `src/componenti/`: i componenti del design (Logo, Badge di stato, Allegato, Testo formattato, Riepilogo preventivo, Preventivo e Ricevuta in PDF)
- `src/stile.css`: colori, caratteri e misure del “nuovo stile”

## Cosa c’è in più rispetto al design

- **Nuovo cliente, nuovo progetto, modifica o archiviazione del progetto e disattivazione di un referente.** Il design non aveva queste schermate. Le ho aggiunte con gli stessi elementi grafici: finestre e pulsanti secondari.
- **Quando il cliente accetta un preventivo, la richiesta passa da “Nuova” ad “Accettata”.** Così compare in Da gestire tra quelle da iniziare. Nel prototipo restava “Nuova” e non compariva da nessuna parte.
- **I PDF si creano con la stampa del browser** (“Salva come PDF”) da una pagina A4 identica ai documenti del design.
- **La barra demo del prototipo non c’è**: cambio ruolo, posta in uscita simulata, errore simulato.
