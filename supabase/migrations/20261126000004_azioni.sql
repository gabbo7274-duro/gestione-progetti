-- Gestione progetti · azioni del portale
-- Ogni pulsante del portale chiama una di queste funzioni (supabase.rpc). Controllano chi le chiama,
-- applicano le regole, aggiornano i dati, scrivono la cronologia e mettono in coda le email.
-- Gli errori hanno un messaggio pronto da mostrare all'utente.

create or replace function _errore(m text) returns void
language plpgsql as $$ begin raise exception using message = m, errcode = 'P0001'; end $$;

create or replace function _richiedi_admin() returns profili
language plpgsql stable security definer set search_path = public as $$
declare p profili;
begin
  select * into p from profili where id = auth.uid() and ruolo = 'admin' and attivo;
  if p.id is null then perform _errore('Operazione riservata all’amministratore.'); end if;
  return p;
end $$;

create or replace function _richiedi_utente() returns profili
language plpgsql stable security definer set search_path = public as $$
declare p profili;
begin
  select * into p from profili where id = auth.uid() and attivo;
  if p.id is null then perform _errore('Accesso non valido: entra di nuovo nel portale.'); end if;
  return p;
end $$;

-- Restituisce la richiesta se chi chiama può vederla.
create or replace function _richiesta(p_id uuid) returns richieste
language plpgsql stable security definer set search_path = public as $$
declare r richieste;
begin
  select * into r from richieste where id = p_id;
  if r.id is null or not vede_richiesta(p_id) then perform _errore('Richiesta non trovata.'); end if;
  return r;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Allegati (il file è già nel bucket "allegati", in una cartella che inizia con l'id di chi carica)
-- ─────────────────────────────────────────────────────────────
create or replace function _registra_allegati(p_richiesta uuid, p_messaggio uuid, p_files jsonb, p_gia int default 0)
returns int language plpgsql security definer set search_path = public, storage as $$
declare f jsonb; n int := 0; nome text; mime text; dim bigint; percorso text;
begin
  for f in select * from jsonb_array_elements(coalesce(p_files, '[]')) loop
    nome := coalesce(f ->> 'nome', 'file'); mime := coalesce(f ->> 'mime', ''); dim := coalesce((f ->> 'dimensione')::bigint, 0);
    percorso := f ->> 'percorso';
    if p_gia + n >= 5 then perform _errore('Puoi allegare al massimo 5 file.'); end if;
    if not (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf') or nome ~* '\.(png|jpe?g|webp|gif|pdf)$') then
      perform _errore('“' || nome || '” non è un’immagine o un PDF.');
    end if;
    if dim > 10 * 1048576 then perform _errore('“' || nome || '” supera i 10 MB.'); end if;
    if percorso is null or split_part(percorso, '/', 1) <> auth.uid()::text then perform _errore('File non valido: caricalo di nuovo.'); end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'allegati' and o.name = percorso) then
      perform _errore('Il file “' || nome || '” non è stato caricato: riprova.');
    end if;
    insert into allegati (richiesta_id, messaggio_id, nome, dimensione, mime, percorso, caricato_da)
    values (p_richiesta, p_messaggio, nome, greatest(dim, 1), mime, percorso, auth.uid());
    n := n + 1;
  end loop;
  return n;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Richieste · cliente
-- ─────────────────────────────────────────────────────────────
create or replace function crea_richiesta(p_progetto uuid, p_tipo tipo_richiesta, p_titolo text, p_testo text, p_allegati jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_utente(); g progetti; id_nuova uuid; dest text[];
begin
  if me.ruolo <> 'cliente' then perform _errore('Le richieste le aprono i referenti del cliente.'); end if;
  select * into g from progetti where id = p_progetto and cliente_id = me.cliente_id;
  if g.id is null then perform _errore('Progetto non trovato.'); end if;
  if g.archiviato then perform _errore('Il progetto è archiviato: non si possono aprire nuove richieste.'); end if;
  if p_tipo is null then perform _errore('Scegli se si tratta di un errore o di una nuova funzione.'); end if;
  if coalesce(trim(p_titolo), '') = '' then perform _errore('Inserisci un titolo per la richiesta.'); end if;
  if coalesce(trim(p_testo), '') = '' then perform _errore('Aggiungi una descrizione: spiega cosa ti serve.'); end if;
  insert into richieste (progetto_id, autore_id, tipo, titolo, testo)
  values (g.id, me.id, p_tipo, trim(p_titolo), trim(p_testo)) returning id into id_nuova;
  perform _registra_allegati(id_nuova, null, p_allegati);
  dest := notifica('nuovaRichiesta', jsonb_build_object('richiesta_id', id_nuova, 'autore_id', me.id));
  perform _evento(id_nuova, 'creata', 'ha aperto la richiesta', me.id, dest);
  return jsonb_build_object('id', id_nuova, 'messaggio', 'Richiesta inviata' || riepilogo_invio(dest));
end $$;

-- p_allegati: la lista finale. Gli elementi con "id" sono allegati già presenti da tenere, gli altri sono file nuovi.
create or replace function modifica_richiesta(p_id uuid, p_tipo tipo_richiesta, p_titolo text, p_testo text, p_allegati jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_utente(); r richieste := _richiesta(p_id); dest text[]; tenuti uuid[]; tolti text[]; n int;
begin
  if r.autore_id <> me.id then perform _errore('Solo chi apre una richiesta può modificarla.'); end if;
  if r.stato <> 'nuova' then perform _errore('Non puoi più modificarla: è già stata presa in carico.'); end if;
  if (select archiviato from progetti where id = r.progetto_id) then perform _errore('Il progetto è archiviato: puoi solo consultare questa richiesta.'); end if;
  if p_tipo is null then perform _errore('Scegli se si tratta di un errore o di una nuova funzione.'); end if;
  if coalesce(trim(p_titolo), '') = '' then perform _errore('Inserisci un titolo per la richiesta.'); end if;
  if coalesce(trim(p_testo), '') = '' then perform _errore('Aggiungi una descrizione: spiega cosa ti serve.'); end if;
  select coalesce(array_agg((x ->> 'id')::uuid), '{}') into tenuti from jsonb_array_elements(coalesce(p_allegati, '[]')) x where x ? 'id';
  with del as (delete from allegati where richiesta_id = r.id and messaggio_id is null and not (id = any (tenuti)) returning percorso)
  select coalesce(array_agg(percorso), '{}') into tolti from del;
  select count(*) into n from allegati where richiesta_id = r.id and messaggio_id is null;
  perform _registra_allegati(r.id, null, (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements(coalesce(p_allegati, '[]')) x where not x ? 'id'), n);
  update richieste set tipo = p_tipo, titolo = trim(p_titolo), testo = trim(p_testo) where id = r.id;
  dest := notifica('modificata', jsonb_build_object('richiesta_id', r.id, 'autore_id', me.id));
  perform _evento(r.id, 'modificata', 'ha modificato la richiesta', me.id, dest);
  return jsonb_build_object('id', r.id, 'file_tolti', to_jsonb(tolti), 'messaggio', 'Modifiche salvate' || riepilogo_invio(dest));
end $$;

create or replace function ritira_richiesta(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_utente(); r richieste := _richiesta(p_id); dest text[];
begin
  if r.autore_id <> me.id then perform _errore('Solo chi apre una richiesta può ritirarla.'); end if;
  if r.stato <> 'nuova' then perform _errore('Non puoi più ritirarla: è già stata presa in carico.'); end if;
  update richieste set stato = 'ritirata' where id = r.id;
  dest := notifica('ritirata', jsonb_build_object('richiesta_id', r.id, 'autore_id', me.id));
  perform _evento(r.id, 'ritirata', 'ha ritirato la richiesta', me.id, dest, true, 'ritirata');
  return jsonb_build_object('messaggio', 'Richiesta ritirata' || riepilogo_invio(dest));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Richieste · amministratore
-- ─────────────────────────────────────────────────────────────
create or replace function aggiorna_richiesta(p_id uuid, p_stato stato_richiesta, p_tipo tipo_richiesta) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_id); dest text[] := '{}'; parti text[] := '{}';
begin
  if r.stato = 'ritirata' then perform _errore('La richiesta è stata ritirata dal cliente: non si può più cambiare.'); end if;
  if r.archiviata_il is not null then perform _errore('La richiesta è in archivio: ripristinala per cambiarne lo stato.'); end if;
  if p_stato = 'ritirata' then perform _errore('Solo il cliente può ritirare una richiesta.'); end if;
  if p_stato = r.stato and p_tipo = r.tipo then
    return jsonb_build_object('messaggio', 'Non hai cambiato niente');
  end if;
  update richieste set stato = p_stato, tipo = p_tipo where id = r.id;
  if p_stato <> r.stato then
    dest := notifica('stato', jsonb_build_object('richiesta_id', r.id, 'stato', p_stato));
    perform _evento(r.id, 'stato', 'ha cambiato lo stato in “' || etichetta_stato_richiesta(p_stato) || '”', me.id, dest, true, p_stato);
    parti := parti || ('Stato: ' || etichetta_stato_richiesta(p_stato));
  end if;
  if p_tipo <> r.tipo then
    perform _evento(r.id, 'tipo', 'ha cambiato il tipo in “' || etichetta_tipo(p_tipo) || '”', me.id);
    parti := parti || ('Tipo: ' || etichetta_tipo(p_tipo));
  end if;
  return jsonb_build_object('messaggio', 'Salvato · ' || array_to_string(parti, ' · ') || riepilogo_invio(dest));
end $$;

create or replace function archivia_richiesta(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_id);
begin
  if r.archiviata_il is not null then perform _errore('La richiesta è già in archivio.'); end if;
  if r.stato not in ('fatta', 'rifiutata', 'ritirata') then perform _errore('Si archiviano solo le richieste fatte, rifiutate o ritirate.'); end if;
  update richieste set archiviata_il = oggi() where id = r.id;
  perform _evento(r.id, 'archiviata', 'ha archiviato la richiesta', me.id, '{}', false);
  return jsonb_build_object('messaggio', 'Richiesta archiviata · la trovi in Archivio');
end $$;

create or replace function ripristina_richiesta(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_id);
begin
  if r.archiviata_il is null then perform _errore('La richiesta non è in archivio.'); end if;
  update richieste set archiviata_il = null where id = r.id;
  perform _evento(r.id, 'ripristinata', 'ha ripristinato la richiesta tra le attive', me.id, '{}', false);
  return jsonb_build_object('messaggio', 'Richiesta ripristinata tra le attive');
end $$;

-- Una richiesta con preventivo accettato o pagamento non si elimina: conta nel riepilogo economico.
create or replace function elimina_richiesta(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_id); pa preventivi; file text[];
begin
  if r.archiviata_il is null then perform _errore('Prima archivia la richiesta: si eliminano solo quelle in archivio.'); end if;
  pa := pv_accettato(r.id);
  if pa.id is not null or exists (select 1 from pagamenti where richiesta_id = r.id) then
    perform _errore('Non si può eliminare: il preventivo accettato' || coalesce(' n. ' || pa.numero, '') || ' conta nel riepilogo economico del cliente.');
  end if;
  select coalesce(array_agg(percorso), '{}') into file from allegati where richiesta_id = r.id;
  delete from richieste where id = r.id;
  return jsonb_build_object('messaggio', 'Richiesta eliminata: “' || r.titolo || '”', 'file_tolti', to_jsonb(file), 'progetto_id', r.progetto_id);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Messaggi
-- ─────────────────────────────────────────────────────────────
create or replace function invia_messaggio(p_richiesta uuid, p_testo text, p_allegati jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_utente(); r richieste := _richiesta(p_richiesta); id_msg uuid; n int; dest text[];
begin
  if r.stato = 'ritirata' then perform _errore('La richiesta è stata ritirata: non si possono aggiungere messaggi.'); end if;
  if (select archiviato from progetti where id = r.progetto_id) then perform _errore('Il progetto è archiviato: i messaggi sono in sola lettura.'); end if;
  if me.ruolo = 'admin' and r.archiviata_il is not null then perform _errore('La richiesta è in archivio: ripristinala per scrivere al cliente.'); end if;
  if coalesce(trim(p_testo), '') = '' and jsonb_array_length(coalesce(p_allegati, '[]')) = 0 then
    perform _errore('Scrivi un messaggio o allega un file.');
  end if;
  insert into messaggi (richiesta_id, autore_id, testo) values (r.id, me.id, coalesce(trim(p_testo), '')) returning id into id_msg;
  n := _registra_allegati(r.id, id_msg, p_allegati);
  dest := notifica(case when me.ruolo = 'admin' then 'msgAdmin' else 'msgCliente' end,
    jsonb_build_object('richiesta_id', r.id, 'autore_id', me.id, 'testo', p_testo, 'n_allegati', n));
  perform _evento(r.id, 'messaggio', case when n > 0 then 'ha scritto un messaggio con ' || plur(n, 'allegato', 'allegati') else 'ha scritto un messaggio' end, me.id, dest);
  -- se il cliente scrive in una richiesta archiviata, torna tra le attive
  if me.ruolo = 'cliente' and r.archiviata_il is not null then
    update richieste set archiviata_il = null where id = r.id;
    perform _evento(r.id, 'ripristinata', 'Tornata tra le attive: il cliente ha scritto un messaggio', null, '{}', false);
  end if;
  return jsonb_build_object('id', id_msg, 'messaggio', 'Messaggio inviato' || riepilogo_invio(dest));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Preventivi · amministratore
-- ─────────────────────────────────────────────────────────────
-- Valori di partenza per un preventivo nuovo (la ritenuta segue i dati fiscali del cliente).
create or replace function preventivo_predefinito(p_richiesta uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_richiesta); sost boolean;
begin
  select c.sostituto into sost from progetti g join clienti c on c.id = g.cliente_id where g.id = r.progetto_id;
  return jsonb_build_object('tipo', 'occasionale', 'ritenuta', coalesce(sost, true), 'iva', 22, 'tariffa', 45, 'sconto', 0,
    'consegna', 10, 'validita', 30, 'note', '', 'voci', jsonb_build_array(jsonb_build_object('descrizione', '', 'ore', '')), 'spese', '[]'::jsonb);
end $$;

-- Totali calcolati per l'editor, mentre si scrive (niente viene salvato).
create or replace function anteprima_preventivo(p_dati jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_admin(); c jsonb := calcola(p_dati);
begin
  return jsonb_build_object('calcolo', c, 'totali', righe_totali(c), 'noteFiscali', note_fiscali(c),
    'importi', (select coalesce(jsonb_agg(eur(num_da(v -> 'ore') * (c ->> 'tariffa')::numeric)), '[]') from jsonb_array_elements(coalesce(p_dati -> 'voci', '[]')) v),
    'totale', eur((c ->> 'totale')::numeric));
end $$;

create or replace function _scrivi_righe(p_id uuid, p_dati jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from preventivo_voci where preventivo_id = p_id;
  delete from preventivo_spese where preventivo_id = p_id;
  insert into preventivo_voci (preventivo_id, posizione, descrizione, ore)
    select p_id, o, trim(coalesce(v ->> 'descrizione', '')), greatest(num_da(v -> 'ore'), 0)
      from jsonb_array_elements(coalesce(p_dati -> 'voci', '[]')) with ordinality as t(v, o);
  insert into preventivo_spese (preventivo_id, posizione, descrizione, importo)
    select p_id, o, trim(coalesce(x ->> 'descrizione', '')), greatest(num_da(x -> 'importo'), 0)
      from jsonb_array_elements(coalesce(p_dati -> 'spese', '[]')) with ordinality as t(x, o);
end $$;

create or replace function _puo_lavorare_pv(r richieste) returns void
language plpgsql stable as $$
begin
  if r.stato = 'ritirata' then perform _errore('La richiesta è stata ritirata: non serve un preventivo.'); end if;
  if r.archiviata_il is not null then perform _errore('La richiesta è in archivio: ripristinala per preparare un preventivo.'); end if;
  if exists (select 1 from pagamenti where richiesta_id = r.id) then perform _errore('Il lavoro è già stato pagato: il preventivo non si cambia più.'); end if;
end $$;

-- Salva la bozza (la crea se non c'è). Restituisce l'id della bozza.
create or replace function salva_bozza_preventivo(p_richiesta uuid, p_dati jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_richiesta); b preventivi; inv preventivi; d jsonb := p_dati;
begin
  perform _puo_lavorare_pv(r);
  b := pv_bozza(r.id); inv := pv_inviato(r.id);
  if b.id is null then
    insert into preventivi (richiesta_id, versione, numero) values (r.id, coalesce(inv.versione, 0) + 1, inv.numero) returning * into b;
  end if;
  update preventivi set
    tipo = coalesce((d ->> 'tipo')::tipo_preventivo, 'occasionale'),
    ritenuta = coalesce((d ->> 'ritenuta')::boolean, true),
    iva = least(100, greatest(0, num_da(d -> 'iva'))),
    tariffa = greatest(0, num_da(d -> 'tariffa')),
    sconto = least(100, greatest(0, num_da(d -> 'sconto'))),
    consegna = greatest(0, num_da(d -> 'consegna')::int),
    validita = greatest(1, coalesce(nullif(num_da(d -> 'validita')::int, 0), 30)),
    note = trim(coalesce(d ->> 'note', '')),
    aggiornato_il = now()
  where id = b.id;
  perform _scrivi_righe(b.id, d);
  return jsonb_build_object('id', b.id, 'messaggio', 'Bozza del preventivo salvata');
end $$;

-- Prepara una nuova versione partendo dall'ultima inviata (per esempio dopo una richiesta di modifiche).
create or replace function nuova_versione_preventivo(p_richiesta uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_richiesta); inv preventivi; nuovo uuid;
begin
  perform _puo_lavorare_pv(r);
  if (pv_bozza(r.id)).id is not null then perform _errore('C’è già una bozza in lavorazione.'); end if;
  inv := pv_inviato(r.id);
  if inv.id is null then perform _errore('Non c’è ancora un preventivo inviato.'); end if;
  insert into preventivi (richiesta_id, versione, numero, tipo, ritenuta, iva, tariffa, sconto, consegna, validita, note)
  values (r.id, inv.versione + 1, inv.numero, inv.tipo, inv.ritenuta, inv.iva, inv.tariffa, inv.sconto, inv.consegna, inv.validita, inv.note)
  returning id into nuovo;
  perform _scrivi_righe(nuovo, preventivo_json(inv.id));
  return jsonb_build_object('id', nuovo, 'messaggio', 'Nuova versione in bozza');
end $$;

create or replace function invia_preventivo(p_richiesta uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_richiesta); b preventivi; d jsonb; c jsonb; v_anno int := extract(year from oggi()); n int; num text; dest text[];
begin
  perform _puo_lavorare_pv(r);
  b := pv_bozza(r.id);
  if b.id is null then perform _errore('Non c’è una bozza da inviare: salva prima il preventivo.'); end if;
  if b.tariffa <= 0 then perform _errore('Inserisci la tariffa oraria.'); end if;
  if not exists (select 1 from preventivo_voci where preventivo_id = b.id and descrizione <> '' and ore > 0) then
    perform _errore('Aggiungi almeno un’attività con descrizione e ore.');
  end if;
  num := b.numero;
  if num is null then
    insert into contatori (chiave, anno, valore) values ('preventivo', v_anno, 1)
      on conflict (chiave, anno) do update set valore = contatori.valore + 1 returning valore into n;
    num := v_anno || '-' || lpad(n::text, 3, '0');
  end if;
  update preventivi set stato = 'inviato', numero = num, inviato_il = oggi(), prestatore = prestatore_attuale(),
    esito = null, esito_da = null, esito_il = null, esito_msg = '', aggiornato_il = now()
  where id = b.id;
  d := preventivo_json(b.id); c := calcola(d);
  dest := notifica('preventivo', jsonb_build_object('richiesta_id', r.id, 'preventivo_id', b.id));
  perform _evento(r.id, 'pvInviato', 'ha inviato il preventivo n. ' || num || ' (' || case when b.tipo = 'occasionale' then 'netto ' else 'totale ' end
    || eur((c ->> 'totale')::numeric) || ')', me.id, dest);
  return jsonb_build_object('id', b.id, 'numero', num, 'messaggio', 'Preventivo inviato: il cliente lo vede nella richiesta' || riepilogo_invio(dest));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Preventivi · risposta del cliente
-- ─────────────────────────────────────────────────────────────
create or replace function rispondi_preventivo(p_richiesta uuid, p_esito esito_preventivo, p_messaggio text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_utente(); r richieste := _richiesta(p_richiesta); inv preventivi; dest text[]; dest2 text[];
begin
  if me.ruolo <> 'cliente' then perform _errore('Al preventivo risponde il cliente.'); end if;
  if (select archiviato from progetti where id = r.progetto_id) then perform _errore('Il progetto è archiviato.'); end if;
  inv := pv_inviato(r.id);
  if inv.id is null then perform _errore('Non c’è un preventivo a cui rispondere.'); end if;
  if stato_effettivo(inv) = 'scaduto' then perform _errore('L’offerta è scaduta il ' || data_it(scade_il(inv)) || '. Contatta ' || nome_admin() || ' per riceverne una aggiornata.'); end if;
  if stato_effettivo(inv) <> 'inviato' then perform _errore('Hai già risposto a questo preventivo.'); end if;
  if p_esito = 'modifiche' and coalesce(trim(p_messaggio), '') = '' then perform _errore('Scrivi cosa vorresti cambiare.'); end if;
  update preventivi set esito = p_esito, esito_da = me.id, esito_il = oggi(), esito_msg = coalesce(trim(p_messaggio), ''), aggiornato_il = now()
   where id = inv.id;
  dest := notifica('esito', jsonb_build_object('richiesta_id', r.id, 'preventivo_id', inv.id, 'autore_id', me.id));
  perform _evento(r.id, 'pvEsito', case p_esito when 'accetta' then 'ha accettato il preventivo n. ' when 'modifiche' then 'ha chiesto modifiche al preventivo n. '
    else 'ha rifiutato il preventivo n. ' end || inv.numero, me.id, dest);
  -- con il preventivo accettato la richiesta passa ad "Accettata": compare in Da gestire tra quelle da iniziare
  if p_esito = 'accetta' and r.stato = 'nuova' then
    update richieste set stato = 'accettata' where id = r.id;
    dest2 := notifica('stato', jsonb_build_object('richiesta_id', r.id, 'stato', 'accettata', 'escludi', jsonb_build_array(me.id)));
    perform _evento(r.id, 'stato', 'Stato cambiato in “Accettata”: preventivo accettato', null, dest2, true, 'accettata');
  end if;
  return jsonb_build_object('messaggio', case p_esito when 'accetta' then 'Preventivo accettato' when 'modifiche' then 'Richiesta di modifiche inviata'
    else 'Preventivo rifiutato' end || riepilogo_invio(dest || coalesce(dest2, '{}')));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Pagamento e ricevuta
-- ─────────────────────────────────────────────────────────────
create or replace function registra_pagamento(p_richiesta uuid, p_il date, p_metodo metodo_pagamento, p_fattura text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me profili := _richiedi_admin(); r richieste := _richiesta(p_richiesta); pa preventivi; cl clienti; pr jsonb := prestatore_attuale();
  v_anno int; n int; ric text; occ boolean; dest text[];
begin
  if r.stato <> 'fatta' then perform _errore('Il pagamento si registra quando la richiesta è “Fatta”.'); end if;
  pa := pv_accettato(r.id);
  if pa.id is null then perform _errore('Serve un preventivo accettato per registrare il pagamento.'); end if;
  if exists (select 1 from pagamenti where richiesta_id = r.id) then perform _errore('Il pagamento è già registrato.'); end if;
  if p_il is null then perform _errore('Inserisci la data del pagamento.'); end if;
  if p_il > oggi() then perform _errore('La data del pagamento non può essere nel futuro.'); end if;
  select c.* into cl from progetti g join clienti c on c.id = g.cliente_id where g.id = r.progetto_id;
  occ := pa.tipo = 'occasionale';
  if occ and not prestatore_completo(pr) then perform _errore('Mancano i tuoi dati (indirizzo e codice fiscale): completali prima di creare la ricevuta.'); end if;
  if occ and not fiscale_completo(cl) then perform _errore('Mancano i dati fiscali di ' || cl.nome || ': completali prima di creare la ricevuta.'); end if;
  if occ then
    v_anno := extract(year from p_il);
    insert into contatori (chiave, anno, valore) values ('ricevuta', v_anno, 1)
      on conflict (chiave, anno) do update set valore = contatori.valore + 1 returning valore into n;
    ric := n || '/' || v_anno;
  end if;
  insert into pagamenti (richiesta_id, preventivo_id, pagato_il, metodo, ricevuta, fattura, committente, prestatore)
  values (r.id, pa.id, p_il, p_metodo, ric, case when occ then '' else trim(coalesce(p_fattura, '')) end,
    case when occ then jsonb_build_object('nome', cl.nome, 'indirizzo', indirizzo_di(cl), 'fiscale', fiscale_di(cl)) end,
    case when occ then pr end);
  if ric is not null then
    dest := notifica('ricevuta', jsonb_build_object('richiesta_id', r.id, 'preventivo_id', pa.id, 'ricevuta', ric, 'pagato_il', data_it(p_il)));
  end if;
  perform _evento(r.id, 'pagamento', 'ha registrato il pagamento' || coalesce(' · ricevuta n. ' || ric, coalesce(' · fattura n. ' || nullif(trim(p_fattura), ''), '')), me.id, coalesce(dest, '{}'));
  return jsonb_build_object('ricevuta', ric, 'messaggio', case when occ then 'Pagamento registrato · ricevuta n. ' || ric else 'Pagamento registrato' end || riepilogo_invio(dest));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Dati fiscali del cliente e i tuoi dati
-- ─────────────────────────────────────────────────────────────
create or replace function salva_dati_fiscali(p_cliente uuid, p_nome text, p_indirizzo text, p_cap text, p_citta text,
                                              p_piva text, p_cf text, p_sostituto boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); v_piva text := regexp_replace(coalesce(p_piva, ''), '\s+', '', 'g');
  v_cf text := upper(regexp_replace(coalesce(p_cf, ''), '\s+', '', 'g')); v_cap text := trim(coalesce(p_cap, ''));
begin
  if not exists (select 1 from clienti where id = p_cliente) then perform _errore('Cliente non trovato.'); end if;
  if coalesce(trim(p_nome), '') = '' then perform _errore('Inserisci la ragione sociale o il nome del cliente.'); end if;
  if v_piva <> '' and v_piva !~ '^\d{11}$' then perform _errore('La partita IVA ha 11 cifre: controlla di averla scritta tutta.'); end if;
  if v_piva <> '' and not piva_valida(v_piva) then perform _errore('La partita IVA non è valida: probabilmente c’è una cifra sbagliata.'); end if;
  if v_cf <> '' and v_cf !~ '^(\d{11}|[A-Z0-9]{16})$' then perform _errore('Il codice fiscale ha 16 caratteri per le persone e 11 cifre per le aziende.'); end if;
  if v_cap <> '' and v_cap !~ '^\d{5}$' then perform _errore('Il CAP ha 5 cifre.'); end if;
  update clienti set nome = trim(p_nome), indirizzo = trim(coalesce(p_indirizzo, '')), cap = v_cap, citta = trim(coalesce(p_citta, '')),
    piva = v_piva, cf = case when v_cf = v_piva then '' else v_cf end, sostituto = coalesce(p_sostituto, true)
  where id = p_cliente;
  return jsonb_build_object('messaggio', 'Dati fiscali salvati');
end $$;

create or replace function salva_prestatore(p_nome text, p_indirizzo text, p_cap text, p_citta text, p_cf text, p_piva text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); v_cf text := upper(regexp_replace(coalesce(p_cf, ''), '\s+', '', 'g'));
  v_piva text := regexp_replace(coalesce(p_piva, ''), '\s+', '', 'g'); v_cap text := trim(coalesce(p_cap, '')); v_email text := trim(coalesce(p_email, ''));
begin
  if coalesce(trim(p_nome), '') = '' then perform _errore('Inserisci nome e cognome.'); end if;
  if v_cap <> '' and v_cap !~ '^\d{5}$' then perform _errore('Il CAP ha 5 cifre.'); end if;
  if v_cf <> '' and v_cf !~ '^[A-Z0-9]{16}$' then perform _errore('Il codice fiscale ha 16 caratteri: controlla di averlo scritto tutto.'); end if;
  if v_cf <> '' and not cf_persona_valido(v_cf) then perform _errore('Il codice fiscale non è valido: probabilmente c’è un carattere sbagliato.'); end if;
  if v_piva <> '' and v_piva !~ '^\d{11}$' then perform _errore('La partita IVA ha 11 cifre: controlla di averla scritta tutta.'); end if;
  if v_piva <> '' and not piva_valida(v_piva) then perform _errore('La partita IVA non è valida: probabilmente c’è una cifra sbagliata.'); end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then perform _errore('Inserisci un’email valida.'); end if;
  update prestatore set nome = trim(p_nome), indirizzo = trim(coalesce(p_indirizzo, '')), cap = v_cap, citta = trim(coalesce(p_citta, '')),
    cf = v_cf, piva = v_piva, email = v_email;
  return jsonb_build_object('messaggio', 'I tuoi dati sono salvati');
end $$;

-- ─────────────────────────────────────────────────────────────
-- Clienti, progetti, referenti
-- ─────────────────────────────────────────────────────────────
create or replace function crea_cliente(p_nome text, p_citta text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); nuovo uuid;
begin
  if coalesce(trim(p_nome), '') = '' then perform _errore('Inserisci il nome del cliente.'); end if;
  insert into clienti (nome, citta) values (trim(p_nome), trim(coalesce(p_citta, ''))) returning id into nuovo;
  return jsonb_build_object('id', nuovo, 'messaggio', 'Cliente creato');
end $$;

create or replace function salva_progetto(p_id uuid, p_cliente uuid, p_nome text, p_descrizione text, p_archiviato boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); pid uuid := p_id;
begin
  if coalesce(trim(p_nome), '') = '' then perform _errore('Inserisci il nome del progetto.'); end if;
  if pid is null then
    if not exists (select 1 from clienti where id = p_cliente) then perform _errore('Cliente non trovato.'); end if;
    insert into progetti (cliente_id, nome, descrizione, archiviato) values (p_cliente, trim(p_nome), trim(coalesce(p_descrizione, '')), coalesce(p_archiviato, false))
    returning id into pid;
  else
    update progetti set nome = trim(p_nome), descrizione = trim(coalesce(p_descrizione, '')), archiviato = coalesce(p_archiviato, false) where id = pid;
    if not found then perform _errore('Progetto non trovato.'); end if;
  end if;
  return jsonb_build_object('id', pid, 'messaggio', case when p_id is null then 'Progetto creato' else 'Progetto salvato' end);
end $$;

create or replace function salva_garanzia(p_progetto uuid, p_fino date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin();
begin
  update progetti set garanzia_fino = p_fino where id = p_progetto;
  if not found then perform _errore('Progetto non trovato.'); end if;
  return jsonb_build_object('messaggio', case when p_fino is null then 'Garanzia rimossa' else 'Garanzia fino al ' || data_it(p_fino) end);
end $$;

-- Chiamata dalla Edge Function "invita-referente" (con la chiave di servizio) dopo aver creato l'utente in Auth.
create or replace function crea_profilo_invitato(p_user uuid, p_cliente uuid, p_nome text, p_cognome text, p_email text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into profili (id, ruolo, cliente_id, nome, cognome, email, attivo, invito_in_attesa)
  values (p_user, 'cliente', p_cliente, trim(p_nome), trim(p_cognome), lower(trim(p_email)), true, true);
end $$;
revoke execute on function crea_profilo_invitato(uuid, uuid, text, text, text) from public, anon, authenticated;

-- Controlli prima dell'invito (li usa la Edge Function, con il token dell'amministratore).
create or replace function controlla_invito(p_cliente uuid, p_nome text, p_cognome text, p_email text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_admin(); v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not exists (select 1 from clienti where id = p_cliente) then perform _errore('Cliente non trovato.'); end if;
  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_cognome), '') = '' then perform _errore('Inserisci nome e cognome.'); end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform _errore('Inserisci un indirizzo email valido.'); end if;
  if exists (select 1 from profili where profili.email = v_email) then perform _errore('Questa email è già associata a un referente.'); end if;
  return jsonb_build_object('ok', true, 'email', v_email);
end $$;

-- Il referente ha scelto la password dal link dell'invito.
create or replace function conferma_invito() returns void
language sql security definer set search_path = public as $$
  update profili set invito_in_attesa = false where id = auth.uid() and invito_in_attesa
$$;

create or replace function imposta_referente_attivo(p_id uuid, p_attivo boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin();
begin
  update profili set attivo = p_attivo where id = p_id and ruolo = 'cliente';
  if not found then perform _errore('Referente non trovato.'); end if;
  return jsonb_build_object('messaggio', case when p_attivo then 'Referente riattivato' else 'Referente disattivato: non può più entrare' end);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Novità
-- ─────────────────────────────────────────────────────────────
create or replace function _salva_novita(p_id uuid, p_progetto uuid, p_titolo text, p_testo text, p_richieste uuid[]) returns novita
language plpgsql security definer set search_path = public as $$
declare n novita;
begin
  if coalesce(trim(p_titolo), '') = '' then perform _errore('Il titolo è obbligatorio.'); end if;
  if p_id is null then
    if not exists (select 1 from progetti where id = p_progetto) then perform _errore('Progetto non trovato.'); end if;
    insert into novita (progetto_id, titolo, testo) values (p_progetto, trim(p_titolo), coalesce(p_testo, '')) returning * into n;
  else
    update novita set titolo = trim(p_titolo), testo = coalesce(p_testo, ''), aggiornata_il = now() where id = p_id returning * into n;
    if n.id is null then perform _errore('Novità non trovata.'); end if;
  end if;
  delete from novita_richieste where novita_id = n.id;
  insert into novita_richieste (novita_id, richiesta_id)
    select n.id, q.id from richieste q where q.id = any (coalesce(p_richieste, '{}')) and q.progetto_id = n.progetto_id;
  return n;
end $$;

create or replace function salva_novita(p_id uuid, p_progetto uuid, p_titolo text, p_testo text, p_richieste uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); n novita := _salva_novita(p_id, p_progetto, p_titolo, p_testo, p_richieste);
begin
  return jsonb_build_object('id', n.id, 'messaggio',
    case when n.stato = 'pubblicata' then 'Modifiche salvate: il cliente vede già la versione aggiornata' else 'Bozza salvata' end);
end $$;

-- Pubblica (salvando prima il contenuto). Con p_segna_fatte le richieste incluse ancora aperte passano a "Fatta".
create or replace function pubblica_novita(p_id uuid, p_progetto uuid, p_titolo text, p_testo text, p_richieste uuid[] default '{}', p_segna_fatte boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); n novita; dest text[]; tutti text[] := '{}'; q richieste; avvisati uuid[]; chiuse int := 0; ds text[];
begin
  if coalesce(trim(p_titolo), '') = '' or coalesce(trim(p_testo), '') = '' then perform _errore('Per pubblicare servono titolo e testo.'); end if;
  n := _salva_novita(p_id, p_progetto, p_titolo, p_testo, p_richieste);
  if n.stato = 'pubblicata' then perform _errore('La novità è già pubblicata.'); end if;
  update novita set stato = 'pubblicata', pubblicata_il = oggi() where id = n.id;
  select coalesce(array_agg(p.id), '{}') into avvisati from referenti_di(cliente_di_progetto(n.progetto_id)) p join preferenze f on f.profilo_id = p.id where f.novita;
  dest := notifica('novita', jsonb_build_object('progetto_id', n.progetto_id, 'novita_id', n.id));
  tutti := dest;
  for q in select r.* from richieste r join novita_richieste nr on nr.richiesta_id = r.id where nr.novita_id = n.id loop
    perform _evento(q.id, 'novita', 'Inclusa nella novità “' || trim(p_titolo) || '”', null, dest);
    if coalesce(p_segna_fatte, true) and q.stato in ('nuova', 'accettata', 'in_lavorazione') then
      update richieste set stato = 'fatta' where id = q.id;
      ds := notifica('stato', jsonb_build_object('richiesta_id', q.id, 'stato', 'fatta', 'escludi', to_jsonb(avvisati)));
      perform _evento(q.id, 'stato', 'ha cambiato lo stato in “Fatta”', me.id, ds, true, 'fatta');
      tutti := tutti || ds; chiuse := chiuse + 1;
    end if;
  end loop;
  return jsonb_build_object('id', n.id, 'messaggio', 'Novità pubblicata: il cliente ora la vede'
    || case when chiuse > 0 then ' · ' || plur(chiuse, 'richiesta segnata come Fatta', 'richieste segnate come Fatte') else '' end
    || riepilogo_invio(tutti));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Note interne (solo amministratore)
-- ─────────────────────────────────────────────────────────────
create or replace function aggiungi_nota(p_ambito ambito_nota, p_rif uuid, p_testo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin();
begin
  if coalesce(trim(p_testo), '') = '' then perform _errore('Scrivi il testo della nota.'); end if;
  if p_ambito = 'cliente' then
    insert into note_interne (ambito, cliente_id, testo) values ('cliente', p_rif, trim(p_testo));
  else
    perform _richiesta(p_rif);
    insert into note_interne (ambito, richiesta_id, testo) values ('richiesta', p_rif, trim(p_testo));
    perform _evento(p_rif, 'nota', 'ha aggiunto una nota interna', me.id, '{}', false);
  end if;
  return jsonb_build_object('messaggio', 'Nota salvata: la vedi solo tu');
end $$;

create or replace function elimina_nota(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin();
begin
  delete from note_interne where id = p_id;
  return jsonb_build_object('messaggio', 'Nota eliminata');
end $$;

-- ─────────────────────────────────────────────────────────────
-- Scadenze e link utili
-- ─────────────────────────────────────────────────────────────
create or replace function salva_scadenza(p_id uuid, p_progetto uuid, p_tipo tipo_scadenza, p_nome text, p_scade date,
                                          p_costo text, p_carico carico_scadenza, p_visibile boolean, p_avvisa boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); v_costo numeric; prima scadenze;
begin
  if coalesce(trim(p_nome), '') = '' then perform _errore('Scrivi cosa scade, per esempio il nome del dominio.'); end if;
  if p_scade is null then perform _errore('Inserisci la data di scadenza.'); end if;
  if coalesce(trim(p_costo), '') <> '' and replace(trim(p_costo), ',', '.') !~ '^\d+(\.\d{1,2})?$' then
    perform _errore('Il costo deve essere un numero, per esempio 15 o 99,00.');
  end if;
  v_costo := nullif(replace(trim(coalesce(p_costo, '')), ',', '.'), '')::numeric;
  if p_id is null then
    if not exists (select 1 from progetti where id = p_progetto) then perform _errore('Progetto non trovato.'); end if;
    insert into scadenze (progetto_id, tipo, nome, scade, costo, carico, visibile, avvisa)
    values (p_progetto, p_tipo, trim(p_nome), p_scade, v_costo, p_carico, coalesce(p_visibile, true), coalesce(p_visibile and p_avvisa, false));
  else
    select * into prima from scadenze where id = p_id;
    if prima.id is null then perform _errore('Scadenza non trovata.'); end if;
    update scadenze set tipo = p_tipo, nome = trim(p_nome), scade = p_scade, costo = v_costo, carico = p_carico,
      visibile = coalesce(p_visibile, true), avvisa = coalesce(p_visibile and p_avvisa, false),
      avvisato_il = case when prima.scade = p_scade then prima.avvisato_il end
    where id = p_id;
  end if;
  return jsonb_build_object('messaggio', case when p_id is null then 'Scadenza aggiunta' else 'Scadenza aggiornata' end);
end $$;

create or replace function elimina_scadenza(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin();
begin
  delete from scadenze where id = p_id;
  return jsonb_build_object('messaggio', 'Scadenza eliminata');
end $$;

create or replace function rinnova_scadenza(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); nuova date;
begin
  update scadenze set scade = (scade + interval '1 year')::date, avvisato_il = null where id = p_id returning scade into nuova;
  if nuova is null then perform _errore('Scadenza non trovata.'); end if;
  return jsonb_build_object('messaggio', 'Segnata come rinnovata: prossima scadenza il ' || data_it(nuova));
end $$;

create or replace function _avvisa_scadenza(p_id uuid) returns text[]
language plpgsql security definer set search_path = public as $$
declare sx scadenze; dest text[];
begin
  select * into sx from scadenze where id = p_id;
  dest := notifica('scadenza', jsonb_build_object('progetto_id', sx.progetto_id, 'scadenza_id', sx.id));
  update scadenze set avvisato_il = oggi() where id = p_id;
  return dest;
end $$;

create or replace function avvisa_scadenza(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); sx scadenze; dest text[];
begin
  select * into sx from scadenze where id = p_id;
  if sx.id is null then perform _errore('Scadenza non trovata.'); end if;
  if not sx.visibile then perform _errore('Il cliente non vede questa scadenza: rendila visibile per avvisarlo.'); end if;
  dest := _avvisa_scadenza(p_id);
  return jsonb_build_object('messaggio', 'Avviso al cliente' || coalesce(nullif(riepilogo_invio(dest), ''), ': nessun referente riceve questi avvisi'));
end $$;

-- Ogni giorno (pg_cron): avvisa il cliente 30 giorni prima delle scadenze visibili con l'avviso attivo.
create or replace function avvisi_scadenze_automatici() returns int
language plpgsql security definer set search_path = public as $$
declare sx scadenze; n int := 0;
begin
  for sx in select s.* from scadenze s join progetti g on g.id = s.progetto_id
             where s.visibile and s.avvisa and s.avvisato_il is null and not g.archiviato and s.scade - 30 <= oggi() loop
    perform _avvisa_scadenza(sx.id); n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function avvisi_scadenze_automatici() from public, anon, authenticated;

create or replace function salva_link(p_id uuid, p_progetto uuid, p_tipo tipo_link, p_etichetta text, p_url text, p_visibile boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin(); v_url text := trim(coalesce(p_url, ''));
begin
  if coalesce(trim(p_etichetta), '') = '' then perform _errore('Scrivi un nome per il link, per esempio “App Store”.'); end if;
  if v_url !~ '^https?://[^\s/]+\.[^\s]+$' then perform _errore('Inserisci un indirizzo completo che inizi con https://'); end if;
  if v_url ~* '(password|passwd|pwd|token|apikey|api_key|secret|pass)=' or v_url ~ '//[^/@]+:[^/@]+@' then
    perform _errore('L’indirizzo contiene una password o un codice di accesso: toglilo. Le credenziali tienile in un gestore di password, non nel portale.');
  end if;
  if p_id is null then
    if not exists (select 1 from progetti where id = p_progetto) then perform _errore('Progetto non trovato.'); end if;
    insert into link (progetto_id, tipo, etichetta, url, visibile) values (p_progetto, p_tipo, trim(p_etichetta), v_url, coalesce(p_visibile, true));
  else
    update link set tipo = p_tipo, etichetta = trim(p_etichetta), url = v_url, visibile = coalesce(p_visibile, true) where id = p_id;
    if not found then perform _errore('Link non trovato.'); end if;
  end if;
  return jsonb_build_object('messaggio', case when p_id is null then 'Link aggiunto' else 'Link aggiornato' end);
end $$;

create or replace function elimina_link(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_admin();
begin
  delete from link where id = p_id;
  return jsonb_build_object('messaggio', 'Link eliminato');
end $$;

-- ─────────────────────────────────────────────────────────────
-- Preferenze email
-- ─────────────────────────────────────────────────────────────
create or replace function salva_preferenze(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profili := _richiedi_utente();
begin
  update preferenze set
    novita = coalesce((p ->> 'novita')::boolean, novita),
    richieste = coalesce((p ->> 'richieste')::pref_richieste, richieste),
    preventivi = coalesce((p ->> 'preventivi')::boolean, preventivi),
    scadenze = coalesce((p ->> 'scadenze')::boolean, scadenze),
    nuove_richieste = coalesce((p ->> 'nuove_richieste')::boolean, nuove_richieste),
    messaggi = coalesce((p ->> 'messaggi')::boolean, messaggi),
    altre = coalesce((p ->> 'altre')::boolean, altre),
    frequenza = coalesce((p ->> 'frequenza')::frequenza_email, frequenza)
  where profilo_id = me.id;
  return jsonb_build_object('messaggio', 'Preferenze salvate');
end $$;
