-- Gestione progetti · chi può chiamare cosa, file allegati e attività pianificate

-- ─────────────────────────────────────────────────────────────
-- Funzioni: per impostazione predefinita nessuno le chiama dal portale.
-- Poi si apre solo l'elenco qui sotto. Le funzioni interne (notifica, _mail, _evento, …)
-- restano usabili solo dall'interno delle azioni.
-- ─────────────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- usate dalle regole di lettura (RLS) e dai campi calcolati
grant execute on function
  oggi(), is_admin(), mio_cliente(), cliente_di_progetto(uuid), cliente_di_richiesta(uuid), vede_richiesta(uuid),
  calcola(jsonb), preventivo_json(uuid), num_da(jsonb), costanti_fiscali(), calcolo(preventivi), totale(preventivi), valore(preventivi), scade_il(preventivi), stato_effettivo(preventivi),
  da_rispondere(richieste), nome_di(uuid)
to authenticated;

-- letture delle schermate
grant execute on function
  mio_profilo(), da_gestire(), conteggio_da_gestire(), elenco_clienti(), dettaglio_cliente(uuid),
  miei_progetti(), dettaglio_progetto(uuid), editor_novita(uuid, uuid), dettaglio_richiesta(uuid), cronologia(uuid),
  documento_preventivo(uuid), documento_ricevuta(uuid), info_pagamento(uuid, date),
  preventivo_predefinito(uuid), anteprima_preventivo(jsonb)
to authenticated;

-- azioni
grant execute on function
  crea_richiesta(uuid, tipo_richiesta, text, text, jsonb),
  modifica_richiesta(uuid, tipo_richiesta, text, text, jsonb),
  ritira_richiesta(uuid),
  aggiorna_richiesta(uuid, stato_richiesta, tipo_richiesta),
  archivia_richiesta(uuid), ripristina_richiesta(uuid), elimina_richiesta(uuid),
  invia_messaggio(uuid, text, jsonb),
  salva_bozza_preventivo(uuid, jsonb), nuova_versione_preventivo(uuid), invia_preventivo(uuid),
  rispondi_preventivo(uuid, esito_preventivo, text),
  registra_pagamento(uuid, date, metodo_pagamento, text),
  salva_dati_fiscali(uuid, text, text, text, text, text, text, boolean),
  salva_prestatore(text, text, text, text, text, text, text),
  crea_cliente(text, text), salva_progetto(uuid, uuid, text, text, boolean), salva_garanzia(uuid, date),
  controlla_invito(uuid, text, text, text), conferma_invito(), imposta_referente_attivo(uuid, boolean),
  salva_novita(uuid, uuid, text, text, uuid[]), pubblica_novita(uuid, uuid, text, text, uuid[], boolean),
  aggiungi_nota(ambito_nota, uuid, text), elimina_nota(uuid),
  salva_scadenza(uuid, uuid, tipo_scadenza, text, date, text, carico_scadenza, boolean, boolean),
  elimina_scadenza(uuid), rinnova_scadenza(uuid), avvisa_scadenza(uuid),
  salva_link(uuid, uuid, tipo_link, text, text, boolean), elimina_link(uuid),
  salva_preferenze(jsonb)
to authenticated;

-- solo per le Edge Function (chiave di servizio)
grant execute on function crea_profilo_invitato(uuid, uuid, text, text, text), avvisi_scadenze_automatici() to service_role;
grant select, update on email_outbox to service_role;
grant select on profili to service_role;

-- ─────────────────────────────────────────────────────────────
-- File allegati: bucket privato. Ognuno carica nella propria cartella (<id utente>/…);
-- si legge un file se si vede la richiesta a cui è allegato.
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('allegati', 'allegati', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function puo_leggere_file(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select split_part(p_nome, '/', 1) = auth.uid()::text
      or exists (select 1 from allegati a where a.percorso = p_nome and vede_richiesta(a.richiesta_id))
$$;

-- Un file si cancella solo quando non è più allegato a niente.
create or replace function puo_cancellare_file(p_nome text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from allegati a where a.percorso = p_nome)
     and (split_part(p_nome, '/', 1) = auth.uid()::text or is_admin())
$$;
grant execute on function puo_leggere_file(text), puo_cancellare_file(text) to authenticated;

drop policy if exists allegati_carica on storage.objects;
drop policy if exists allegati_leggi on storage.objects;
drop policy if exists allegati_cancella on storage.objects;

create policy allegati_carica on storage.objects for insert to authenticated
  with check (bucket_id = 'allegati' and split_part(name, '/', 1) = auth.uid()::text);

create policy allegati_leggi on storage.objects for select to authenticated
  using (bucket_id = 'allegati' and puo_leggere_file(name));

create policy allegati_cancella on storage.objects for delete to authenticated
  using (bucket_id = 'allegati' and puo_cancellare_file(name));

-- ─────────────────────────────────────────────────────────────
-- Attività pianificate (pg_cron, se disponibile): avvisi delle scadenze ogni mattina alle 8.
-- L'invio delle email si pianifica sulla Edge Function "invia-email" (vedi README).
-- ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('avvisi-scadenze', '0 7 * * *', 'select public.avvisi_scadenze_automatici()');
  end if;
end $$;
