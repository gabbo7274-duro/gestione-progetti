-- Gestione progetti · dati di esempio (gli stessi del prototipo)
-- Si caricano con `supabase db reset` in locale. NON usarli in produzione.
-- Tutti gli utenti hanno la password: password-demo

-- ─────────────────────────────────────────────────────────────
-- Utenti (auth) e profili
-- ─────────────────────────────────────────────────────────────
create temporary table _utenti (id uuid, email text, nome text, cognome text, ruolo ruolo_utente, cliente uuid, attivo boolean);
insert into _utenti values
  ('00000000-0000-4000-a000-000000000001', 'gabriele@gabri-gestionale.it',         'Gabriele', 'Treminio',  'admin',   null,                                   true),
  ('00000000-0000-4000-a000-0000000000a1', 'marta.bellin@ortofruttabellin.it',     'Marta',    'Bellin',    'cliente', '00000000-0000-4000-c000-000000000001', true),
  ('00000000-0000-4000-a000-0000000000a2', 'luca.zordan@ortofruttabellin.it',      'Luca',     'Zordan',    'cliente', '00000000-0000-4000-c000-000000000001', true),
  ('00000000-0000-4000-a000-0000000000a3', 'paolo.bellin@ortofruttabellin.it',     'Paolo',    'Bellin',    'cliente', '00000000-0000-4000-c000-000000000001', false),
  ('00000000-0000-4000-a000-0000000000a4', 'andrea@carpenteriadalmolin.it',        'Andrea',   'Dal Molin', 'cliente', '00000000-0000-4000-c000-000000000002', true),
  ('00000000-0000-4000-a000-0000000000a5', 'amministrazione@carpenteriadalmolin.it', 'Sara',   'Cocco',     'cliente', '00000000-0000-4000-c000-000000000002', true),
  ('00000000-0000-4000-a000-0000000000a6', 'segreteria@studiorizzato.it',          'Giulia',   'Rizzato',   'cliente', '00000000-0000-4000-c000-000000000003', true);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email, crypt('password-demo', gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', nome, 'cognome', cognome), now(), now(), '', '', '', ''
  from _utenti;
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select id::text, id, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now() from _utenti;

insert into clienti (id, nome, citta, indirizzo, cap, piva, cf, sostituto) values
  ('00000000-0000-4000-c000-000000000001', 'Ortofrutta Bellin S.r.l.',     'Thiene (VI)',             'Via dell’Industria 14', '36016', '04829170002', '', true),
  ('00000000-0000-4000-c000-000000000002', 'Carpenteria Dal Molin',        'Valdagno (VI)',           'Via Pasubio 88',        '36078', '07351640003', '', true),
  ('00000000-0000-4000-c000-000000000003', 'Studio Dentistico Rizzato',    'Bassano del Grappa (VI)', 'Viale delle Fosse 3',   '36061', '09182730003', '', true),
  ('00000000-0000-4000-c000-000000000004', 'Associazione Alpina Pasubio',  'Valli del Pasubio (VI)',  '',                      '',      '',            '', true);

insert into profili (id, ruolo, cliente_id, nome, cognome, email, attivo)
select id, ruolo, cliente, nome, cognome, email, attivo from _utenti;
update preferenze set richieste = 'tutte' where profilo_id = '00000000-0000-4000-a000-0000000000a2';

update prestatore set nome = 'Gabriele Treminio', email = 'gabriele@gabri-gestionale.it';

-- ─────────────────────────────────────────────────────────────
-- Progetti, novità, scadenze, link
-- ─────────────────────────────────────────────────────────────
insert into progetti (id, cliente_id, nome, descrizione, archiviato, garanzia_fino) values
  ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-c000-000000000001', 'App ordini agenti',       'App per tablet con cui gli agenti raccolgono gli ordini nei negozi, anche senza connessione.', false, '2026-08-31'),
  ('00000000-0000-4000-b000-000000000002', '00000000-0000-4000-c000-000000000001', 'Portale B2B listini',     'Area riservata dove i clienti all’ingrosso consultano listini e disponibilità.', false, null),
  ('00000000-0000-4000-b000-000000000003', '00000000-0000-4000-c000-000000000001', 'Sito vetrina 2024',       'Sito istituzionale con il catalogo dei prodotti di stagione.', true, '2025-09-12'),
  ('00000000-0000-4000-b000-000000000004', '00000000-0000-4000-c000-000000000002', 'Gestionale commesse',     'Pianificazione delle commesse di officina con ore e materiali per cantiere.', false, '2027-04-30'),
  ('00000000-0000-4000-b000-000000000005', '00000000-0000-4000-c000-000000000002', 'Configuratore preventivi','Strumento interno per preventivare scale e ringhiere su misura.', true, '2025-12-18'),
  ('00000000-0000-4000-b000-000000000006', '00000000-0000-4000-c000-000000000003', 'Prenotazioni online',     'Prenotazione delle visite dal sito con promemoria via SMS.', false, '2027-01-15');

insert into novita (id, progetto_id, stato, pubblicata_il, titolo, testo) values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'pubblicata', '2026-11-13', 'Versione 1.4: catalogo consultabile offline',
   E'Da oggi il catalogo si scarica sul tablet all’apertura dell’app, così gli agenti possono consultarlo anche nelle zone senza copertura.\n\nCosa cambia:\n- il primo avvio richiede **circa un minuto** per scaricare le foto\n- gli ordini fatti offline partono da soli appena torna la rete\n- un’icona nella barra in alto indica se siete connessi\n\nTrovate le istruzioni complete nella [guida per gli agenti](https://example.com/guida-agenti).'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001', 'pubblicata', '2026-10-30', 'Nuova schermata di riepilogo ordini',
   E'Abbiamo rifatto la schermata di riepilogo: ora mostra il **totale per negozio** e gli sconti applicati riga per riga.\n\nSe notate importi che non tornano, apriteci una richiesta indicando il numero d’ordine.'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000001', 'pubblicata', '2026-10-08', 'Migrazione al nuovo server completata',
   'La migrazione è terminata **senza perdita di dati**. La sincronizzazione degli ordini ora richiede circa 10 secondi invece di 40.'),
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b000-000000000001', 'bozza', null, 'Piano di lavoro per dicembre',
   E'A dicembre ci concentriamo su:\n- esportazione degli ordini in Excel\n- notifiche per gli ordini confermati\n- accesso con impronta digitale'),
  ('00000000-0000-4000-d000-000000000005', '00000000-0000-4000-b000-000000000004', 'pubblicata', '2026-11-05', 'Calendario commesse condiviso',
   'Il calendario delle commesse è ora visibile anche dal telefono. I capisquadra vedono **solo i cantieri assegnati** a loro.'),
  ('00000000-0000-4000-d000-000000000006', '00000000-0000-4000-b000-000000000006', 'pubblicata', '2026-10-21', 'Promemoria SMS attivi',
   'Da lunedì i pazienti ricevono un SMS il giorno prima della visita. Il testo si può cambiare dalla sezione Impostazioni.'),
  ('00000000-0000-4000-d000-000000000007', '00000000-0000-4000-b000-000000000003', 'pubblicata', '2025-03-12', 'Sito online',
   'Il nuovo sito è pubblicato. Le foto di stagione si aggiornano dal pannello Catalogo.'),
  ('00000000-0000-4000-d000-000000000008', '00000000-0000-4000-b000-000000000005', 'pubblicata', '2025-06-18', 'Configuratore consegnato',
   'Il configuratore è in uso in ufficio tecnico. Il progetto è concluso.'),
  ('00000000-0000-4000-d000-000000000009', '00000000-0000-4000-b000-000000000001', 'pubblicata', '2026-09-19', 'Versione 1.3.2: IVA corretta sugli sconti',
   E'Lo sconto in percentuale ora si applica all’imponibile **prima** del calcolo dell’IVA, come in fattura.\n\nSe trovate ancora differenze, apriteci una segnalazione con il numero d’ordine.');

insert into scadenze (progetto_id, tipo, nome, scade, costo, carico, visibile, avvisa, avvisato_il) values
  ('00000000-0000-4000-b000-000000000001', 'apple',   'Account Apple Developer di Ortofrutta Bellin', '2026-12-02', 99,   'cliente', true,  true,  '2026-11-02'),
  ('00000000-0000-4000-b000-000000000001', 'hosting', 'Server delle API, piano annuale',              '2026-12-10', 60,   'admin',   false, false, null),
  ('00000000-0000-4000-b000-000000000001', 'dominio', 'ortofruttabellin.it su Aruba',                 '2027-03-14', 15,   'cliente', true,  true,  null),
  ('00000000-0000-4000-b000-000000000001', 'google',  'Aggiornamento al livello API richiesto da Google Play', '2027-08-31', null, 'admin', true, true, null),
  ('00000000-0000-4000-b000-000000000004', 'hosting', 'Hosting del gestionale, piano annuale',        '2027-04-30', 120,  'cliente', true,  true,  null),
  ('00000000-0000-4000-b000-000000000006', 'dominio', 'studiorizzato.it su Register.it',              '2027-02-05', 25,   'cliente', true,  true,  null);

insert into link (progetto_id, tipo, etichetta, url, visibile) values
  ('00000000-0000-4000-b000-000000000001', 'app',     'App web per gli agenti',       'https://ordini.ortofruttabellin.it', true),
  ('00000000-0000-4000-b000-000000000001', 'ios',     'App Store',                    'https://apps.apple.com/it/app/ordini-bellin/id0000000000', true),
  ('00000000-0000-4000-b000-000000000001', 'android', 'Google Play',                  'https://play.google.com/store/apps/details?id=it.ortofruttabellin.ordini', true),
  ('00000000-0000-4000-b000-000000000001', 'manuale', 'Manuale per gli agenti (PDF)', 'https://ordini.ortofruttabellin.it/manuale-agenti.pdf', true),
  ('00000000-0000-4000-b000-000000000001', 'altro',   'Pannello Supabase del progetto','https://supabase.com/dashboard/project/ordini-bellin', false),
  ('00000000-0000-4000-b000-000000000004', 'app',     'Gestionale commesse',          'https://commesse.carpenteriadalmolin.it', true),
  ('00000000-0000-4000-b000-000000000004', 'manuale', 'Guida rapida per i capisquadra (PDF)', 'https://commesse.carpenteriadalmolin.it/guida.pdf', true),
  ('00000000-0000-4000-b000-000000000006', 'app',     'Pagina delle prenotazioni',    'https://prenota.studiorizzato.it', true);

-- ─────────────────────────────────────────────────────────────
-- Richieste e messaggi
-- ─────────────────────────────────────────────────────────────
-- id brevi per leggibilità: q01 … q15
create or replace function pg_temp.q(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-e000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create or replace function pg_temp.u(s text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-0000000000' || s)::uuid $$;
create or replace function pg_temp.t(d text, o text) returns timestamptz language sql immutable as $$ select (d || ' ' || o || ' Europe/Rome')::timestamptz $$;
create or replace function pg_temp.p(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-b000-00000000000' || n)::uuid $$;

insert into richieste (id, progetto_id, autore_id, aperta_il, stato, tipo, titolo, testo, archiviata_il) values
  (pg_temp.q(1),  pg_temp.p(1), pg_temp.u('a1'), pg_temp.t('2026-11-12', '08:42'), 'nuova',          'funzione', 'Esportazione ordini in Excel', 'Ci servirebbe scaricare gli ordini del mese in un file Excel, con una riga per prodotto, da passare al commercialista.', null),
  (pg_temp.q(2),  pg_temp.p(1), pg_temp.u('a2'), pg_temp.t('2026-11-14', '09:05'), 'nuova',          'funzione', 'Filtro per zona agente', 'Nella lista ordini vorremmo filtrare per zona (Alto Vicentino, Bassanese, Padovano) per vedere subito l’andamento di ogni agente.', null),
  (pg_temp.q(3),  pg_temp.p(1), pg_temp.u('a1'), pg_temp.t('2026-10-28', '09:31'), 'in_lavorazione', 'funzione', 'Notifica quando un ordine viene confermato', 'Gli agenti vorrebbero sapere quando il magazzino conferma un ordine, senza dover aprire l’app.', null),
  (pg_temp.q(4),  pg_temp.p(1), pg_temp.u('a2'), pg_temp.t('2026-10-02', '10:12'), 'accettata',      'funzione', 'Accesso con impronta digitale', 'Inserire la password ogni mattina è scomodo: sarebbe possibile entrare con l’impronta?', null),
  (pg_temp.q(5),  pg_temp.p(1), pg_temp.u('a1'), pg_temp.t('2026-09-15', '10:48'), 'fatta',          'errore',   'IVA sbagliata sugli sconti nel riepilogo', 'Quando applichiamo uno sconto in percentuale, il totale IVA nel riepilogo non corrisponde a quello della fattura.', null),
  (pg_temp.q(6),  pg_temp.p(1), pg_temp.u('a2'), pg_temp.t('2026-09-10', '11:20'), 'rifiutata',      'funzione', 'Invio ordini via WhatsApp', 'Sarebbe comodo mandare la conferma d’ordine al negozio direttamente su WhatsApp.', null),
  (pg_temp.q(7),  pg_temp.p(1), pg_temp.u('a1'), pg_temp.t('2026-09-05', '08:42'), 'ritirata',       'funzione', 'Stampa etichette per i bancali', 'Vorremmo stampare dall’app le etichette da attaccare ai bancali in uscita.', null),
  (pg_temp.q(8),  pg_temp.p(4), pg_temp.u('a4'), pg_temp.t('2026-11-16', '09:05'), 'nuova',          'funzione', 'Ore per operaio nel riepilogo commessa', 'Nel riepilogo di ogni commessa vorremmo vedere le ore divise per operaio, non solo il totale.', null),
  (pg_temp.q(9),  pg_temp.p(6), pg_temp.u('a6'), pg_temp.t('2026-11-17', '09:31'), 'nuova',          'funzione', 'Promemoria anche via email', 'Alcuni pazienti anziani preferiscono l’email agli SMS: si può scegliere il canale per ogni paziente?', null),
  (pg_temp.q(10), pg_temp.p(3), pg_temp.u('a1'), pg_temp.t('2025-02-02', '10:12'), 'fatta',          'funzione', 'Aggiornare le foto di stagione', 'Sostituire le foto degli agrumi con quelle della primavera.', null),
  (pg_temp.q(11), pg_temp.p(1), pg_temp.u('a2'), pg_temp.t('2026-11-21', '10:48'), 'nuova',          'errore',   'Il totale non si aggiorna dopo aver tolto un prodotto', 'Se in un ordine tolgo un prodotto, il totale in fondo resta quello di prima finché non chiudo e riapro l’ordine.', null),
  (pg_temp.q(12), pg_temp.p(6), pg_temp.u('a6'), pg_temp.t('2026-11-20', '11:20'), 'nuova',          'errore',   'Il promemoria SMS arriva due volte', 'Da qualche giorno alcuni pazienti ricevono lo stesso promemoria due volte, a pochi minuti di distanza.', null),
  (pg_temp.q(13), pg_temp.p(1), pg_temp.u('a1'), pg_temp.t('2026-07-22', '08:42'), 'fatta',          'funzione', 'Logo aziendale nella schermata di accesso', 'Al posto della scritta in alto vorremmo il nostro logo nella schermata di accesso dell’app.', '2026-08-05'),
  (pg_temp.q(14), pg_temp.p(1), pg_temp.u('a2'), pg_temp.t('2026-08-03', '09:05'), 'rifiutata',      'funzione', 'Ordini via email per i negozi senza tablet', 'Alcuni negozi non usano il tablet: potremmo ricevere gli ordini via email e caricarli in automatico?', '2026-08-20'),
  (pg_temp.q(15), pg_temp.p(4), pg_temp.u('a4'), pg_temp.t('2026-10-06', '09:31'), 'fatta',          'funzione', 'Stampa del foglio ore settimanale', 'Ci servirebbe stampare il foglio ore della settimana di ogni operaio, da far firmare il venerdì.', null);

insert into messaggi (richiesta_id, autore_id, scritto_il, testo) values
  (pg_temp.q(1),  pg_temp.u('01'), pg_temp.t('2026-11-13', '10:12'), 'Ciao Marta, al commercialista serve l’aliquota IVA su ogni riga o basta il totale per ordine?'),
  (pg_temp.q(1),  pg_temp.u('a1'), pg_temp.t('2026-11-13', '14:40'), 'Su ogni riga, grazie. Ti allego l’esempio che usa adesso.'),
  (pg_temp.q(2),  pg_temp.u('01'), pg_temp.t('2026-11-18', '11:05'), 'Ti ho mandato il preventivo qui sotto. Una domanda: i negozi senza zona li mettiamo in “Senza zona” o li nascondiamo?'),
  (pg_temp.q(3),  pg_temp.u('01'), pg_temp.t('2026-10-29', '09:20'), 'La stiamo sviluppando: la notifica arriverà sul tablet dell’agente. Contiamo di rilasciarla con la versione 1.5.'),
  (pg_temp.q(3),  pg_temp.u('a1'), pg_temp.t('2026-10-30', '08:55'), 'Perfetto. Si può avere anche quando un ordine viene annullato?'),
  (pg_temp.q(3),  pg_temp.u('01'), pg_temp.t('2026-10-30', '12:10'), 'Sì, la aggiungo nella stessa versione senza costi in più.'),
  (pg_temp.q(4),  pg_temp.u('01'), pg_temp.t('2026-10-03', '16:30'), 'Va bene, la inseriamo nel piano di dicembre insieme all’esportazione in Excel. Ti ho mandato il preventivo.'),
  (pg_temp.q(5),  pg_temp.u('01'), pg_temp.t('2026-09-16', '09:40'), 'Grazie per lo screenshot: ho trovato il problema, lo sconto veniva applicato dopo l’IVA.'),
  (pg_temp.q(5),  pg_temp.u('01'), pg_temp.t('2026-09-19', '17:05'), 'Corretto nella versione 1.3.2: lo sconto ora si applica all’imponibile prima del calcolo dell’IVA.'),
  (pg_temp.q(6),  pg_temp.u('01'), pg_temp.t('2026-09-11', '10:00'), 'WhatsApp non permette messaggi automatici senza un account Business a pagamento, con costi per ogni messaggio. Se vi interessa possiamo valutare l’invio via email.'),
  (pg_temp.q(10), pg_temp.u('01'), pg_temp.t('2025-02-03', '12:00'), 'Fatto: le nuove foto sono online.'),
  (pg_temp.q(13), pg_temp.u('01'), pg_temp.t('2026-07-24', '11:30'), 'Fatto: il logo è nella versione 1.2.1. Se lo volete più grande, ditemelo.'),
  (pg_temp.q(14), pg_temp.u('01'), pg_temp.t('2026-08-05', '09:15'), 'Leggere ordini scritti a mano nelle email non è affidabile: si rischiano errori sulle quantità. Meglio un modulo web semplice per quei negozi: se vi interessa, vi preparo un preventivo.'),
  (pg_temp.q(15), pg_temp.u('01'), pg_temp.t('2026-11-11', '17:40'), 'Fatto: lo trovi in Commesse › Ore › Stampa settimana. Ho aggiunto anche i totali per commessa.');

insert into novita_richieste (novita_id, richiesta_id) values
  ('00000000-0000-4000-d000-000000000007', pg_temp.q(10)),
  ('00000000-0000-4000-d000-000000000009', pg_temp.q(5));

insert into note_interne (ambito, cliente_id, richiesta_id, scritta_il, testo) values
  ('cliente',   '00000000-0000-4000-c000-000000000001', null, pg_temp.t('2026-10-05', '18:20'), 'Pagano a 60 giorni fine mese: scriverlo nelle note dei preventivi.'),
  ('cliente',   '00000000-0000-4000-c000-000000000001', null, pg_temp.t('2026-11-13', '09:05'), 'Sui preventivi decide Marta; Luca segue gli agenti e segnala i problemi.'),
  ('cliente',   '00000000-0000-4000-c000-000000000002', null, pg_temp.t('2026-11-02', '17:40'), 'Andrea risponde al telefono solo la mattina presto, prima delle 8.'),
  ('richiesta', null, pg_temp.q(2), pg_temp.t('2026-11-18', '11:10'), 'Le zone stanno nel gestionale vecchio: chiedere a Luca l’export dei clienti con la zona.');

-- ─────────────────────────────────────────────────────────────
-- Preventivi
-- ─────────────────────────────────────────────────────────────
create or replace function pg_temp.pv(r uuid, st stato_preventivo, num text, il date, tar numeric, sc numeric, cons int, note text,
  esito esito_preventivo, esito_da uuid, esito_il date, esito_msg text, voci jsonb, spese jsonb default '[]') returns void
language plpgsql as $$
declare id_pv uuid;
begin
  insert into preventivi (richiesta_id, versione, stato, numero, tipo, ritenuta, iva, tariffa, sconto, consegna, validita, note, inviato_il,
                          prestatore, esito, esito_da, esito_il, esito_msg)
  values (r, 1, st, num, 'occasionale', true, 22, tar, sc, cons, 30, coalesce(note, ''), il,
          case when st = 'inviato' then prestatore_attuale() end, esito, esito_da, esito_il, coalesce(esito_msg, ''))
  returning id into id_pv;
  perform _scrivi_righe(id_pv, jsonb_build_object('voci', voci, 'spese', spese));
end $$;

select pg_temp.pv(pg_temp.q(1), 'bozza', null, null, 45, 0, 5, 'Il file si scaricherà dalla schermata Ordini, scegliendo il mese.', null, null, null, null,
  '[{"descrizione":"Analisi del formato richiesto dal commercialista","ore":2},{"descrizione":"Esportazione in Excel con una riga per prodotto","ore":6},{"descrizione":"Prove con gli ordini di ottobre","ore":1.5}]');
select pg_temp.pv(pg_temp.q(5), 'inviato', '2026-006', '2026-09-16', 45, 0, 3, null, 'accetta', pg_temp.u('a1'), '2026-09-17', null,
  '[{"descrizione":"Correzione del calcolo IVA sugli sconti","ore":3},{"descrizione":"Verifica sulle fatture di agosto","ore":1}]');
select pg_temp.pv(pg_temp.q(4), 'inviato', '2026-007', '2026-10-03', 45, 10, 15, 'Lo sconto vale se l’accesso biometrico viene rilasciato insieme alla versione di dicembre.',
  'accetta', pg_temp.u('a2'), '2026-10-05', 'Va bene, procediamo con la versione di dicembre.',
  '[{"descrizione":"Accesso con impronta su Android e iOS","ore":10},{"descrizione":"Ripiego sulla password se l’impronta non è disponibile","ore":3},{"descrizione":"Prove sui tablet degli agenti","ore":3}]',
  '[{"descrizione":"Account sviluppatore Apple (quota annuale)","importo":99}]');
select pg_temp.pv(pg_temp.q(3), 'inviato', '2026-009', '2026-10-29', 45, 0, 20, null, 'accetta', pg_temp.u('a1'), '2026-10-30', null,
  '[{"descrizione":"Servizio di notifiche push","ore":8},{"descrizione":"Impostazioni delle notifiche nell’app","ore":4},{"descrizione":"Prove e pubblicazione sugli store","ore":2}]');
select pg_temp.pv(pg_temp.q(2), 'inviato', '2026-012', '2026-11-18', 45, 0, 7, 'Le zone vengono prese dall’anagrafica agenti: se un negozio non ha la zona, compare in “Senza zona”.', null, null, null, null,
  '[{"descrizione":"Campo zona nell’anagrafica agenti","ore":1.5},{"descrizione":"Filtro per zona nella lista ordini","ore":3},{"descrizione":"Totali per zona nel riepilogo","ore":2}]');
select pg_temp.pv(pg_temp.q(8), 'inviato', '2026-013', '2026-11-18', 40, 0, 6, null, null, null, null, null,
  '[{"descrizione":"Ore per operaio nel riepilogo commessa","ore":4},{"descrizione":"Esportazione delle ore in PDF","ore":2}]');
select pg_temp.pv(pg_temp.q(15), 'inviato', '2026-008', '2026-10-08', 40, 0, 5, null, 'accetta', pg_temp.u('a4'), '2026-10-09', 'Perfetto, procedi pure.',
  '[{"descrizione":"Foglio ore settimanale per operaio, stampabile","ore":4},{"descrizione":"Totali per commessa in fondo al foglio","ore":1}]');

insert into contatori (chiave, anno, valore) values ('preventivo', 2026, 13), ('ricevuta', 2026, 1);

insert into pagamenti (richiesta_id, preventivo_id, pagato_il, metodo, ricevuta, committente, prestatore)
select pg_temp.q(15), p.id, '2026-11-12', 'bonifico', '1/2026',
  '{"nome":"Carpenteria Dal Molin","indirizzo":"Via Pasubio 88, 36078 Valdagno (VI)","fiscale":"P.IVA e C.F. 07351640003"}', prestatore_attuale()
  from preventivi p where p.richiesta_id = pg_temp.q(15);

-- ─────────────────────────────────────────────────────────────
-- Cronologia ricostruita dai dati (le azioni del portale la scrivono da sole)
-- ─────────────────────────────────────────────────────────────
insert into eventi (richiesta_id, tipo, avvenuto_il, da_id, testo, visibile_cliente, stato_a)
select id, 'creata', aperta_il, autore_id, 'ha aperto la richiesta', true, null::stato_richiesta from richieste
union all
select richiesta_id, 'messaggio', scritto_il, autore_id, 'ha scritto un messaggio', true, null from messaggi
union all
select richiesta_id, 'pvInviato', (inviato_il + time '10:00') at time zone 'Europe/Rome', pg_temp.u('01'),
  'ha inviato il preventivo n. ' || numero || ' (netto ' || eur(totale(p)) || ')', true, null from preventivi p where stato = 'inviato'
union all
select richiesta_id, 'pvEsito', (esito_il + time '09:30') at time zone 'Europe/Rome', esito_da, 'ha accettato il preventivo n. ' || numero, true, null
  from preventivi where esito = 'accetta'
union all
select pg_temp.q(x.n), 'stato', pg_temp.t(x.d, x.o), pg_temp.u('01'), 'ha cambiato lo stato in “' || etichetta_stato_richiesta(x.s::stato_richiesta) || '”', true, x.s::stato_richiesta
  from (values (3, 'accettata', '2026-10-30', '11:20'), (3, 'in_lavorazione', '2026-11-02', '09:30'), (4, 'accettata', '2026-10-05', '15:10'),
               (5, 'accettata', '2026-09-17', '09:40'), (5, 'in_lavorazione', '2026-09-17', '09:41'), (5, 'fatta', '2026-09-19', '18:00'),
               (6, 'rifiutata', '2026-09-11', '10:01'), (10, 'accettata', '2025-02-03', '10:15'), (10, 'in_lavorazione', '2025-02-10', '09:00'),
               (10, 'fatta', '2025-03-12', '18:00'), (13, 'accettata', '2026-07-22', '15:00'), (13, 'fatta', '2026-07-24', '11:31'),
               (14, 'rifiutata', '2026-08-05', '09:16'), (15, 'accettata', '2026-10-09', '12:05'), (15, 'in_lavorazione', '2026-10-14', '09:00'),
               (15, 'fatta', '2026-11-11', '17:45')) as x(n, s, d, o)
union all
select pg_temp.q(7), 'ritirata', pg_temp.t('2026-09-06', '08:50'), pg_temp.u('a1'), 'ha ritirato la richiesta', true, 'ritirata'
union all
select id, 'archiviata', (archiviata_il + time '18:20') at time zone 'Europe/Rome', pg_temp.u('01'), 'ha archiviato la richiesta', false, null
  from richieste where archiviata_il is not null
union all
select pg_temp.q(15), 'pagamento', pg_temp.t('2026-11-12', '09:05'), pg_temp.u('01'), 'ha registrato il pagamento · ricevuta n. 1/2026', true, null
union all
select nr.richiesta_id, 'novita', (n.pubblicata_il + time '17:59') at time zone 'Europe/Rome', null, 'Inclusa nella novità “' || n.titolo || '”', true, null
  from novita_richieste nr join novita n on n.id = nr.novita_id
union all
select richiesta_id, 'nota', scritta_il, pg_temp.u('01'), 'ha aggiunto una nota interna', false, null from note_interne where ambito = 'richiesta';
