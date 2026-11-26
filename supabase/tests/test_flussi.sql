-- Test dei flussi principali, come li vivono admin e clienti.
-- Si esegue con supabase/tests/run.sh dopo migrazioni e seed.
\set ON_ERROR_STOP 1
\o /dev/null
set client_min_messages = notice;

create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'TEST FALLITO: %', msg; end if;
  raise notice 'ok · %', msg;
end $$;

-- Esegue un comando che deve fallire con un messaggio che contiene "atteso".
create or replace function pg_temp.errore(cmd text, atteso text) returns void language plpgsql as $$
begin
  begin
    execute cmd;
  exception when others then
    if position(atteso in sqlerrm) = 0 then raise exception 'TEST FALLITO: atteso «%», ricevuto «%»', atteso, sqlerrm; end if;
    raise notice 'ok · errore atteso: %', atteso;
    return;
  end;
  raise exception 'TEST FALLITO: «%» doveva fallire con «%»', cmd, atteso;
end $$;

create or replace function pg_temp.come(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  execute 'set role authenticated';
end $$;

\set admin '00000000-0000-4000-a000-000000000001'
\set marta '00000000-0000-4000-a000-0000000000a1'
\set luca  '00000000-0000-4000-a000-0000000000a2'
\set paolo '00000000-0000-4000-a000-0000000000a3'
\set andrea '00000000-0000-4000-a000-0000000000a4'
\set p1 '00000000-0000-4000-b000-000000000001'
\set p4 '00000000-0000-4000-b000-000000000004'
\set q1 '00000000-0000-4000-e000-000000000001'
\set q2 '00000000-0000-4000-e000-000000000002'
\set q15 '00000000-0000-4000-e000-000000000015'

-- ── Calcoli ──────────────────────────────────────────────────
select pg_temp.ok((calcola('{"tipo":"occasionale","ritenuta":true,"tariffa":45,"sconto":10,"voci":[{"ore":16}],"spese":[{"importo":99}]}') ->> 'totale')::numeric = 599.60,
  'occasionale con sconto, spese, ritenuta e bollo: netto 599,60 €');
select pg_temp.ok((calcola('{"tipo":"occasionale","ritenuta":false,"tariffa":40,"voci":[{"ore":1}]}') ->> 'totale')::numeric = 40,
  'occasionale sotto 77,47 €: niente bollo, niente ritenuta per un privato');
select pg_temp.ok((calcola('{"tipo":"normale","iva":0,"tariffa":50,"voci":[{"ore":2}]}') ->> 'totale')::numeric = 102,
  'forfettario sopra 77,47 €: marca da bollo');
select pg_temp.ok((calcola('{"tipo":"normale","iva":22,"tariffa":50,"voci":[{"ore":"1,5"}]}') ->> 'totale')::numeric = 91.50,
  'normale con IVA 22% e ore scritte con la virgola');
select pg_temp.ok(piva_valida('07351640003') and not piva_valida('07351640004'), 'controllo della partita IVA');
select pg_temp.ok(cf_persona_valido('RSSMRA85T10A562S') and not cf_persona_valido('RSSMRA85T10A562T'), 'controllo del codice fiscale');

-- ── Cliente: cosa vede ───────────────────────────────────────
select pg_temp.come(:'marta');
select pg_temp.ok(mio_profilo() ->> 'ruolo' = 'cliente', 'Marta entra come cliente');
select pg_temp.ok(jsonb_array_length(miei_progetti() -> 'progetti') = 3, 'Marta vede i 3 progetti di Ortofrutta Bellin');
select pg_temp.ok((select count(*) from progetti) = 3, 'RLS: niente progetti di altri clienti');
select pg_temp.ok((select count(*) from preventivi where stato = 'bozza') = 0, 'RLS: il cliente non vede le bozze dei preventivi');
select pg_temp.ok((select count(*) from prestatore) = 0, 'RLS: il cliente non legge i dati del prestatore');
select pg_temp.ok((select count(*) from note_interne) = 0, 'RLS: il cliente non legge le note interne');
select pg_temp.ok((select count(*) from novita where stato = 'bozza') = 0, 'RLS: il cliente non vede le novità in bozza');
select pg_temp.ok(preventivo_json((select id from preventivi where richiesta_id = :'q1')) is null, 'il cliente non legge una bozza nemmeno per id');
select pg_temp.errore($$select dettaglio_progetto('00000000-0000-4000-b000-000000000004')$$, 'Progetto non trovato');
select pg_temp.errore($$insert into richieste (progetto_id, autore_id, titolo, testo) values ('00000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-0000000000a1', 'x', 'y')$$, 'permission denied');
select pg_temp.errore($$select notifica('novita', '{}')$$, 'permission denied');
select pg_temp.errore($$select aggiorna_richiesta('00000000-0000-4000-e000-000000000001', 'fatta', 'funzione')$$, 'riservata all’amministratore');
select pg_temp.errore($$select crea_richiesta('00000000-0000-4000-b000-000000000001', null, 'Titolo', 'Testo')$$, 'Scegli se si tratta di un errore');
select pg_temp.errore($$select crea_richiesta('00000000-0000-4000-b000-000000000003', 'funzione', 'Titolo', 'Testo')$$, 'archiviato');
select pg_temp.errore($$select crea_richiesta('00000000-0000-4000-b000-000000000001', 'funzione', 'Con file', 'Testo', '[{"percorso":"altro-utente/x.png","nome":"x.png","dimensione":10,"mime":"image/png"}]')$$, 'File non valido');

-- ── Cliente apre una richiesta: email all'admin e cronologia ─
create temporary table t (k text primary key, v jsonb);
grant all on t to authenticated;
insert into t values ('nuova', crea_richiesta(:'p1', 'errore', 'Il PDF dell’ordine è vuoto', 'Da ieri il PDF dell’ordine si apre senza righe.'));
select pg_temp.ok((select v ->> 'messaggio' from t where k = 'nuova') like 'Richiesta inviata · 2 email inviate%', 'richiesta inviata: email a Gabriele e a Luca (segue tutte le richieste)');
reset role;
select pg_temp.ok((select count(*) from email_outbox where oggetto like 'Errore segnalato da Marta Bellin%') = 2, 'in coda le due email “Errore segnalato”');
select pg_temp.ok((select count(*) from eventi where richiesta_id = (select (v ->> 'id')::uuid from t where k = 'nuova') and tipo = 'creata' and email @> array['Gabriele Treminio']) = 1,
  'la cronologia registra chi ha ricevuto l’email');

-- Luca non può modificare la richiesta di Marta
select pg_temp.come(:'luca');
select pg_temp.errore(format($$select modifica_richiesta(%L, 'errore', 'x', 'y')$$, (select v ->> 'id' from t where k = 'nuova')), 'Solo chi apre una richiesta');
select pg_temp.ok(dettaglio_richiesta((select (v ->> 'id')::uuid from t where k = 'nuova')) #>> '{permessi,sola_lettura}' like 'L’ha aperta Marta Bellin%', 'Luca la vede in sola lettura con il motivo');

-- Paolo è disattivato: non vede niente
select pg_temp.come(:'paolo');
select pg_temp.ok((select count(*) from progetti) = 0, 'un referente disattivato non vede niente');

-- ── Admin: Da gestire ────────────────────────────────────────
select pg_temp.come(:'admin');
insert into t values ('dg', da_gestire());
select pg_temp.ok((select v -> 'adesso' from t where k = 'dg') @> '[{"azione": "Rispondi a Marta Bellin"}]', 'Da gestire: “Rispondi a Marta Bellin” tra le cose urgenti');
select pg_temp.ok((select v -> 'adesso' from t where k = 'dg') @> '[{"azione": "Verifica l’errore segnalato da Giulia Rizzato"}]', 'Da gestire: l’errore di Giulia è urgente');
select pg_temp.ok((select v -> 'settimana' from t where k = 'dg') @> '[{"azione": "Valuta la richiesta di Giulia Rizzato"}]', 'Da gestire: la richiesta di Giulia da valutare in settimana');
select pg_temp.ok((select v -> 'attesa' from t where k = 'dg') @> '[{"tipo": "preventivo"}]', 'Da gestire: preventivi in attesa del cliente');
select pg_temp.ok(conteggio_da_gestire() > 0, 'numero accanto a “Da gestire”');
select pg_temp.ok((elenco_clienti() -> 'clienti' -> 0 ->> 'nome') = 'Associazione Alpina Pasubio', 'elenco clienti in ordine alfabetico');
select pg_temp.ok((dettaglio_cliente('00000000-0000-4000-c000-000000000002') #>> '{economico,incassato}')::numeric = 200, 'riepilogo economico: incassati 200 € da Carpenteria Dal Molin');

-- ── Preventivo: bozza, invio, risposta ───────────────────────
select pg_temp.errore(format($$select invia_preventivo(%L)$$, (select v ->> 'id' from t where k = 'nuova')), 'Non c’è una bozza');
select salva_bozza_preventivo((select (v ->> 'id')::uuid from t where k = 'nuova'),
  '{"tipo":"occasionale","ritenuta":true,"tariffa":"45","sconto":"0","consegna":"3","validita":"30","note":"","voci":[{"descrizione":"","ore":""}],"spese":[]}');
select pg_temp.errore(format($$select invia_preventivo(%L)$$, (select v ->> 'id' from t where k = 'nuova')), 'Aggiungi almeno un’attività');
select salva_bozza_preventivo((select (v ->> 'id')::uuid from t where k = 'nuova'),
  '{"tipo":"occasionale","ritenuta":true,"tariffa":"45","sconto":"0","consegna":"3","validita":"30","note":"","voci":[{"descrizione":"Correzione del PDF","ore":"2,5"}],"spese":[]}');
insert into t values ('inv', invia_preventivo((select (v ->> 'id')::uuid from t where k = 'nuova')));
select pg_temp.ok((select v ->> 'numero' from t where k = 'inv') = '2026-014', 'numerazione del preventivo: 2026-014');
select pg_temp.ok((select v ->> 'messaggio' from t where k = 'inv') like 'Preventivo inviato%email inviat%', 'preventivo inviato con email ai referenti');

select pg_temp.come(:'marta');
select pg_temp.ok(dettaglio_richiesta((select (v ->> 'id')::uuid from t where k = 'nuova')) #>> '{inviato,stato_effettivo}' = 'inviato', 'Marta vede il preventivo in attesa di risposta');
select pg_temp.ok(dettaglio_richiesta((select (v ->> 'id')::uuid from t where k = 'nuova')) -> 'bozza' = 'null'::jsonb, 'Marta non riceve la bozza');
select pg_temp.errore(format($$select rispondi_preventivo(%L, 'modifiche', '')$$, (select v ->> 'id' from t where k = 'nuova')), 'Scrivi cosa vorresti cambiare');
select rispondi_preventivo((select (v ->> 'id')::uuid from t where k = 'nuova'), 'accetta', 'Ok, grazie');
select pg_temp.ok((select stato from richieste where id = (select (v ->> 'id')::uuid from t where k = 'nuova')) = 'accettata', 'accettando il preventivo la richiesta passa ad “Accettata”');
select pg_temp.errore(format($$select rispondi_preventivo(%L, 'rifiuta', '')$$, (select v ->> 'id' from t where k = 'nuova')), 'Hai già risposto');
select pg_temp.ok(documento_preventivo((select id from preventivi where richiesta_id = (select (v ->> 'id')::uuid from t where k = 'nuova'))) ->> 'accettazione' like 'Accettato online da Marta Bellin%', 'il PDF riporta l’accettazione');

-- ── Pagamento e ricevuta ─────────────────────────────────────
select pg_temp.come(:'admin');
select pg_temp.errore(format($$select registra_pagamento(%L, current_date, 'bonifico')$$, (select v ->> 'id' from t where k = 'nuova')), 'quando la richiesta è “Fatta”');
select aggiorna_richiesta((select (v ->> 'id')::uuid from t where k = 'nuova'), 'fatta', 'errore');
select pg_temp.errore(format($$select registra_pagamento(%L, current_date + 3, 'bonifico')$$, (select v ->> 'id' from t where k = 'nuova')), 'nel futuro');
select pg_temp.errore(format($$select registra_pagamento(%L, current_date, 'bonifico')$$, (select v ->> 'id' from t where k = 'nuova')), 'Mancano i tuoi dati');
select pg_temp.errore($$select salva_prestatore('Gabriele Treminio', 'Via Roma 1', '3601', 'Schio (VI)', '', '', 'gabriele@gabri-gestionale.it')$$, 'Il CAP ha 5 cifre');
select pg_temp.errore($$select salva_prestatore('Gabriele Treminio', 'Via Roma 1', '36015', 'Schio (VI)', 'RSSMRA85T10A562T', '', 'gabriele@gabri-gestionale.it')$$, 'Il codice fiscale non è valido');
select salva_prestatore('Gabriele Treminio', 'Via Roma 1', '36015', 'Schio (VI)', 'rssmra85t10a562s', '', 'gabriele@gabri-gestionale.it');
insert into t values ('pag', registra_pagamento((select (v ->> 'id')::uuid from t where k = 'nuova'), current_date, 'bonifico'));
select pg_temp.ok((select v ->> 'ricevuta' from t where k = 'pag') = '2/' || extract(year from current_date), 'ricevuta numerata 2/anno');
select pg_temp.ok(documento_ricevuta((select (v ->> 'id')::uuid from t where k = 'nuova')) ->> 'prestCf' = 'C.F. RSSMRA85T10A562S', 'la ricevuta usa i tuoi dati');
select pg_temp.errore(format($$select elimina_richiesta(%L)$$, (select v ->> 'id' from t where k = 'nuova')), 'Prima archivia');
select archivia_richiesta((select (v ->> 'id')::uuid from t where k = 'nuova'));
select pg_temp.errore(format($$select elimina_richiesta(%L)$$, (select v ->> 'id' from t where k = 'nuova')), 'conta nel riepilogo economico');

-- ── Dati fiscali, link, scadenze ─────────────────────────────
select pg_temp.errore($$select salva_dati_fiscali('00000000-0000-4000-c000-000000000004', 'Associazione Alpina Pasubio', '', '', '', '12345678901', '', true)$$, 'La partita IVA non è valida');
select pg_temp.errore($$select salva_link(null, '00000000-0000-4000-b000-000000000001', 'altro', 'Pannello', 'https://admin.example.com/?token=abc', true)$$, 'password o un codice di accesso');
select salva_scadenza(null, :'p1', 'dominio', 'esempio.it', current_date + 10, '12,50', 'cliente', true, true);
select pg_temp.ok((da_gestire() -> 'rinnovi') @> '[{"azione": "Da rinnovare: esempio.it"}]', 'una scadenza entro 30 giorni compare nei rinnovi');
reset role;
select pg_temp.ok(avvisi_scadenze_automatici() >= 1, 'avviso automatico 30 giorni prima');

-- ── Messaggi e preferenze ────────────────────────────────────
select pg_temp.come(:'marta');
select salva_preferenze('{"frequenza":"riepilogo"}');
select pg_temp.come(:'admin');
insert into t values ('msg', invia_messaggio(:'q1', 'Ti ho preparato il preventivo.'));
select pg_temp.ok((select v ->> 'messaggio' from t where k = 'msg') like '%nel riepilogo di stasera%', 'con la preferenza “riepilogo” l’email aspetta le 18');
select pg_temp.errore($$select invia_messaggio('00000000-0000-4000-e000-000000000007', 'ciao')$$, 'ritirata');

-- ── Novità con richieste incluse ─────────────────────────────
insert into t values ('nov', pubblica_novita(null, :'p1', 'Versione 1.5', 'Arrivano le **notifiche**.', array['00000000-0000-4000-e000-000000000003']::uuid[], true));
select pg_temp.ok((select v ->> 'messaggio' from t where k = 'nov') like 'Novità pubblicata: il cliente ora la vede · 1 richiesta segnata come Fatta%', 'pubblicando la novità la richiesta inclusa diventa Fatta');
select pg_temp.ok((select stato from richieste where id = '00000000-0000-4000-e000-000000000003') = 'fatta', 'stato della richiesta inclusa');

reset role;
select 'Test completati' as esito;
