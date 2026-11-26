-- Gestione progetti · letture per le schermate
-- Ogni schermata legge con una sola chiamata. Stati, permessi, conteggi e testi derivati
-- sono calcolati qui, con le stesse regole delle azioni.

-- Chi sono: per l'intestazione e per decidere admin / cliente.
create or replace function mio_profilo() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili; f preferenze; cl clienti;
begin
  select * into me from profili where id = auth.uid();
  if me.id is null then return null; end if;
  select * into f from preferenze where profilo_id = me.id;
  select * into cl from clienti where id = me.cliente_id;
  return jsonb_build_object('id', me.id, 'ruolo', me.ruolo, 'nome', me.nome, 'cognome', me.cognome, 'email', me.email,
    'attivo', me.attivo, 'invito_in_attesa', me.invito_in_attesa, 'cliente_id', me.cliente_id, 'cliente_nome', cl.nome,
    'nome_admin', nome_admin(), 'preferenze', to_jsonb(f) - 'profilo_id',
    'da_gestire', case when me.ruolo = 'admin' and me.attivo then conteggio_da_gestire() end);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Da gestire
-- ─────────────────────────────────────────────────────────────
create or replace function _ultimo_messaggio(p_richiesta uuid) returns messaggi
language sql stable security definer set search_path = public as $$
  select * from messaggi where richiesta_id = p_richiesta order by scritto_il desc limit 1
$$;

-- L'ultimo messaggio è del cliente e la richiesta non è ritirata.
create or replace function da_rispondere(r richieste) returns boolean
language sql stable security definer set search_path = public as $$
  select r.stato <> 'ritirata' and coalesce((select pr.ruolo = 'cliente' from messaggi m join profili pr on pr.id = m.autore_id
    where m.richiesta_id = r.id order by m.scritto_il desc limit 1), false)
$$;

create or replace function in_garanzia(p_progetto uuid, p_data date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select garanzia_fino is not null and p_data <= garanzia_fino from progetti where id = p_progetto), false)
$$;

create or replace function _data_fatta(r richieste) returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select (avvenuto_il at time zone 'Europe/Rome')::date from eventi where richiesta_id = r.id and tipo = 'stato' and stato_a = 'fatta'
    order by avvenuto_il desc limit 1), r.aperta_il::date)
$$;

create or replace function _voce_dg(r richieste, dal date, azione text, contesto text, citazione text, sezione text, urgente boolean) returns jsonb
language sql stable as $$
  select jsonb_build_object('dal', dal, 'giorni', greatest(oggi() - dal, 0), 'urgente', urgente, 'azione', azione, 'contesto', contesto,
    'citazione', coalesce(citazione, ''), 'richiesta_id', r.id, 'sezione', sezione)
$$;

-- La pagina "Da gestire": per urgenza, una riga per richiesta con l'azione che serve adesso.
create or replace function da_gestire() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profili := _richiedi_admin();
  r richieste; cli text; cur preventivi; inv preventivi; stp text; u messaggi; c jsonb; sx record;
  adesso jsonb := '[]'; settimana jsonb := '[]'; rinnovi jsonb := '[]'; attesa jsonb := '[]';
  extra_pv text; d date; g int;
begin
  for r in select q.* from richieste q join progetti p on p.id = q.progetto_id where q.archiviata_il is null and q.stato <> 'ritirata' loop
    select c2.nome into cli from progetti p join clienti c2 on c2.id = p.cliente_id where p.id = r.progetto_id;
    u := _ultimo_messaggio(r.id);
    if r.stato in ('rifiutata', 'fatta') then
      if da_rispondere(r) then
        adesso := adesso || _voce_dg(r, u.scritto_il::date, 'Rispondi a ' || nome_di(u.autore_id), r.titolo || ' · ' || cli, taglia(coalesce(nullif(u.testo, ''), 'Allegato'), 120), 'messaggi', true);
      end if;
      if r.stato = 'fatta' and (pv_accettato(r.id)).id is not null and not exists (select 1 from pagamenti where richiesta_id = r.id) then
        inv := pv_accettato(r.id); d := _data_fatta(r); c := calcola(preventivo_json(inv.id));
        attesa := attesa || jsonb_build_object('tipo', 'pagamento', 'data', d, 'etichetta', 'finito', 'richiesta_id', r.id, 'sezione', null,
          'azione', 'Pagamento · ' || case when inv.tipo = 'occasionale' then 'netto ' else 'totale ' end || eur((c ->> 'totale')::numeric),
          'contesto', r.titolo || ' · ' || cli || ' · lavoro finito il ' || data_it(d));
      end if;
      continue;
    end if;
    cur := pv_corrente(r.id); inv := pv_inviato(r.id);
    stp := case when cur.id is null then null else stato_effettivo(cur) end;
    extra_pv := case when cur.stato = 'bozza' then ' · preventivo in bozza' else '' end;
    if da_rispondere(r) then
      adesso := adesso || _voce_dg(r, u.scritto_il::date, 'Rispondi a ' || nome_di(u.autore_id), r.titolo || ' · ' || cli || extra_pv, taglia(coalesce(nullif(u.testo, ''), 'Allegato'), 120), 'messaggi', true);
    elsif cur.id is not null and ((cur.stato = 'bozza' and inv.esito = 'modifiche') or stp = 'modifiche') then
      adesso := adesso || _voce_dg(r, inv.esito_il, 'Rivedi il preventivo: ' || nome_di(inv.esito_da) || ' chiede modifiche', r.titolo || ' · ' || cli,
        case when inv.esito_msg <> '' then taglia(inv.esito_msg, 120) end, 'preventivo', true);
    elsif r.stato = 'nuova' and r.tipo = 'errore' then
      adesso := adesso || _voce_dg(r, r.aperta_il::date, 'Verifica l’errore segnalato da ' || nome_di(r.autore_id),
        r.titolo || ' · ' || cli || ' · ' || case when in_garanzia(r.progetto_id, r.aperta_il::date) then 'in garanzia' else 'fuori garanzia' end, null, null, true);
    elsif cur.stato = 'bozza' then
      settimana := settimana || _voce_dg(r, r.aperta_il::date, 'Invia il preventivo a ' || cli,
        r.titolo || ' · ' || case when cur.tipo = 'occasionale' then 'netto ' else 'totale ' end || eur(totale(cur)), null, 'preventivo', false);
    elsif r.stato = 'nuova' and cur.id is null then
      settimana := settimana || _voce_dg(r, r.aperta_il::date, 'Valuta la richiesta di ' || nome_di(r.autore_id), r.titolo || ' · ' || cli, null, null, false);
    elsif r.stato = 'accettata' then
      settimana := settimana || _voce_dg(r, case when inv.esito = 'accetta' then inv.esito_il else r.aperta_il::date end, 'Inizia «' || r.titolo || '»',
        cli || case when inv.esito = 'accetta' then ' · preventivo accettato il ' || data_it(inv.esito_il) else '' end, null, null, false);
    elsif stp = 'scaduto' then
      settimana := settimana || _voce_dg(r, scade_il(cur), 'Ricontatta ' || cli || ': il preventivo è scaduto', r.titolo || ' · scaduto il ' || data_it(scade_il(cur)), null, 'preventivo', false);
    elsif stp = 'inviato' then
      attesa := attesa || jsonb_build_object('tipo', 'preventivo', 'data', scade_il(cur), 'etichetta', 'scade', 'richiesta_id', r.id, 'sezione', 'preventivo',
        'azione', 'Preventivo n. ' || cur.numero || ' · ' || case when cur.tipo = 'occasionale' then 'Netto ' else 'Totale ' end || eur(totale(cur)),
        'contesto', r.titolo || ' · ' || cli || ' · risposta entro il ' || data_it(scade_il(cur)));
    end if;
  end loop;

  -- Rinnovi: entro 30 giorni nel loro gruppo, quelli già scaduti in "Adesso"
  for sx in select s.*, p.nome as progetto_nome, c2.nome as cliente_nome from scadenze s join progetti p on p.id = s.progetto_id
            join clienti c2 on c2.id = p.cliente_id where not p.archiviato and s.scade - oggi() <= 30 loop
    g := sx.scade - oggi();
    if g < 0 then
      adesso := adesso || jsonb_build_object('dal', sx.scade, 'giorni', -g, 'urgente', true, 'progetto_id', sx.progetto_id, 'tab', 'scadenze',
        'azione', 'Rinnova, è scaduta: ' || sx.nome, 'citazione', '',
        'contesto', sx.progetto_nome || ' · ' || sx.cliente_nome || ' · scaduta il ' || data_it(sx.scade) || ' · ' || case when sx.carico = 'cliente' then 'la paga il cliente' else 'la paghi tu' end);
    else
      rinnovi := rinnovi || jsonb_build_object('dal', sx.scade, 'giorni', g, 'urgente', false, 'progetto_id', sx.progetto_id, 'tab', 'scadenze',
        'azione', 'Da rinnovare: ' || sx.nome, 'citazione', '',
        'contesto', sx.progetto_nome || ' · ' || sx.cliente_nome || ' · scade il ' || data_it(sx.scade) || ' · ' || case when sx.carico = 'cliente' then 'la paga il cliente' else 'la paghi tu' end);
    end if;
  end loop;

  return jsonb_build_object(
    'oggi', oggi(),
    'adesso', (select coalesce(jsonb_agg(x order by x ->> 'dal'), '[]') from jsonb_array_elements(adesso) x),
    'settimana', (select coalesce(jsonb_agg(x order by x ->> 'dal'), '[]') from jsonb_array_elements(settimana) x),
    'rinnovi', (select coalesce(jsonb_agg(x order by x ->> 'dal'), '[]') from jsonb_array_elements(rinnovi) x),
    'attesa', (select coalesce(jsonb_agg(x order by x ->> 'data'), '[]') from jsonb_array_elements(attesa) x));
end $$;

-- Numero accanto a "Da gestire" nella barra in alto.
create or replace function conteggio_da_gestire() returns int
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from richieste r where r.archiviata_il is null and r.stato <> 'ritirata' and (
      da_rispondere(r) or (r.stato not in ('rifiutata', 'fatta') and (
        (r.stato = 'nuova' and (r.tipo = 'errore' or (pv_corrente(r.id)).id is null))
        or (pv_bozza(r.id)).id is not null
        or r.stato = 'accettata'
        or coalesce(stato_effettivo(pv_corrente(r.id)) in ('modifiche', 'scaduto'), false)))))
   + (select count(*)::int from scadenze s join progetti p on p.id = s.progetto_id where not p.archiviato and s.scade < oggi())
$$;

-- ─────────────────────────────────────────────────────────────
-- Clienti
-- ─────────────────────────────────────────────────────────────
create or replace function _economico(p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare g progetti; q richieste; inv preventivi; st text; v numeric;
  acc numeric := 0; att numeric := 0; comp numeric := 0; inc numeric := 0; n_acc int := 0; n_att int := 0; n_comp int := 0; n_inc int := 0;
  righe jsonb := '[]'; ra numeric; rt numeric; rc numeric; ri numeric; n int;
begin
  for g in select * from progetti where cliente_id = p_cliente order by archiviato, nome loop
    ra := 0; rt := 0; rc := 0; ri := 0; n := 0;
    for q in select * from richieste where progetto_id = g.id loop
      inv := pv_inviato(q.id);
      continue when inv.id is null;
      st := stato_effettivo(inv); v := valore(inv); n := n + 1;
      if st = 'accettato' then
        ra := ra + v; acc := acc + v; n_acc := n_acc + 1;
        if q.stato = 'fatta' then rc := rc + v; comp := comp + v; n_comp := n_comp + 1; end if;
        if exists (select 1 from pagamenti where richiesta_id = q.id) then ri := ri + v; inc := inc + v; n_inc := n_inc + 1; end if;
      elsif st = 'inviato' then
        rt := rt + v; att := att + v; n_att := n_att + 1;
      end if;
    end loop;
    if n > 0 then righe := righe || jsonb_build_object('nome', g.nome, 'accettato', ra, 'in_attesa', rt, 'completato', rc, 'incassato', ri); end if;
  end loop;
  return jsonb_build_object('accettato', acc, 'n_accettato', n_acc, 'in_attesa', att, 'n_in_attesa', n_att,
    'completato', comp, 'n_completato', n_comp, 'incassato', inc, 'n_incassato', n_inc, 'righe', righe);
end $$;

create or replace function elenco_clienti() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_admin();
begin
  return jsonb_build_object(
    'nuove', (select count(*) from richieste where stato = 'nuova'),
    'clienti', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'citta', c.citta,
      'referenti', (select count(*) from profili p where p.cliente_id = c.id),
      'progetti_attivi', (select count(*) from progetti g where g.cliente_id = c.id and not g.archiviato),
      'nuove', (select count(*) from richieste q join progetti g on g.id = q.progetto_id where g.cliente_id = c.id and q.stato = 'nuova'),
      'accettato', (_economico(c.id) ->> 'accettato')::numeric) order by c.nome) from clienti c), '[]'));
end $$;

create or replace function dettaglio_cliente(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_admin(); c clienti;
begin
  select * into c from clienti where id = p_id;
  if c.id is null then perform _errore('Cliente non trovato.'); end if;
  return jsonb_build_object(
    'cliente', to_jsonb(c) || jsonb_build_object('fiscale_completo', fiscale_completo(c), 'fiscale', fiscale_di(c), 'indirizzo_completo', indirizzo_di(c)),
    'progetti', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'descrizione', g.descrizione, 'archiviato', g.archiviato,
        'nuove', (select count(*) from richieste q where q.progetto_id = g.id and q.stato = 'nuova')) order by g.nome) from progetti g where g.cliente_id = c.id), '[]'),
    'referenti', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'cognome', p.cognome, 'email', p.email,
        'stato', case when not p.attivo then 'non_attivo' when p.invito_in_attesa then 'in_attesa' else 'attivo' end) order by p.nome, p.cognome)
        from profili p where p.cliente_id = c.id), '[]'),
    'note', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'testo', n.testo, 'scritta_il', n.scritta_il) order by n.scritta_il desc)
        from note_interne n where n.ambito = 'cliente' and n.cliente_id = c.id), '[]'),
    'economico', _economico(c.id));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Progetti
-- ─────────────────────────────────────────────────────────────
create or replace function miei_progetti() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_utente();
begin
  if me.ruolo <> 'cliente' then perform _errore('Pagina riservata ai referenti del cliente.'); end if;
  return jsonb_build_object(
    'cliente_nome', (select nome from clienti where id = me.cliente_id),
    'progetti', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'descrizione', g.descrizione, 'archiviato', g.archiviato,
        'ultima_novita', (select max(pubblicata_il) from novita n where n.progetto_id = g.id and n.stato = 'pubblicata'),
        'da_approvare', case when g.archiviato then 0 else (select count(*) from richieste q where q.progetto_id = g.id
                          and coalesce(stato_effettivo(pv_inviato(q.id)) = 'inviato', false)) end) order by g.archiviato, g.nome)
      from progetti g where g.cliente_id = me.cliente_id), '[]'));
end $$;

create or replace function dettaglio_progetto(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_utente(); g progetti; adm boolean := me.ruolo = 'admin'; c clienti;
begin
  select * into g from progetti where id = p_id;
  if g.id is null or not (adm or g.cliente_id = mio_cliente()) then perform _errore('Progetto non trovato.'); end if;
  select * into c from clienti where id = g.cliente_id;
  return jsonb_build_object(
    'progetto', jsonb_build_object('id', g.id, 'nome', g.nome, 'descrizione', g.descrizione, 'archiviato', g.archiviato,
      'cliente_id', c.id, 'cliente_nome', c.nome, 'garanzia_fino', g.garanzia_fino, 'garanzia_attiva', g.garanzia_fino is not null and oggi() <= g.garanzia_fino),
    'novita', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'titolo', n.titolo, 'stato', n.stato, 'pubblicata_il', n.pubblicata_il,
        'testo', n.testo,
        'incluse', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'titolo', q.titolo) order by q.aperta_il)
                             from novita_richieste nr join richieste q on q.id = nr.richiesta_id where nr.novita_id = n.id), '[]'))
        order by (n.stato = 'bozza') desc, n.pubblicata_il desc nulls last, n.creata_il desc)
      from novita n where n.progetto_id = g.id and (adm or n.stato = 'pubblicata')), '[]'),
    'richieste', coalesce((select jsonb_agg(x order by x ->> 'aperta_il' desc) from (
        select jsonb_build_object('id', q.id, 'titolo', q.titolo, 'stato', q.stato, 'tipo', q.tipo, 'aperta_il', q.aperta_il,
          'autore_id', q.autore_id, 'autore_nome', nome_di(q.autore_id), 'archiviata_il', q.archiviata_il,
          'n_messaggi', (select count(*) from messaggi m where m.richiesta_id = q.id),
          'da_rispondere', adm and da_rispondere(q),
          'pv_valore', valore(pv_inviato(q.id)), 'pv_stato', stato_effettivo(pv_inviato(q.id)),
          'pv_bozza', adm and (pv_bozza(q.id)).id is not null,
          'da_approvare', not g.archiviato and coalesce(stato_effettivo(pv_inviato(q.id)) = 'inviato', false),
          'archiviabile', adm and q.archiviata_il is null and q.stato in ('fatta', 'rifiutata', 'ritirata'),
          'eliminabile', adm and q.archiviata_il is not null and (pv_accettato(q.id)).id is null and not exists (select 1 from pagamenti where richiesta_id = q.id),
          'ultimo', (select jsonb_build_object('autore_id', m.autore_id, 'autore_nome', nome_di(m.autore_id), 'admin', pr.ruolo = 'admin', 'testo', m.testo, 'scritto_il', m.scritto_il)
                     from messaggi m join profili pr on pr.id = m.autore_id where m.richiesta_id = q.id order by m.scritto_il desc limit 1)) x
        from richieste q where q.progetto_id = g.id) t), '[]'),
    'scadenze', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'tipo', s.tipo, 'nome', s.nome, 'scade', s.scade, 'costo', s.costo,
        'carico', s.carico, 'visibile', s.visibile, 'avvisa', s.avvisa, 'avvisato_il', s.avvisato_il, 'giorni', s.scade - oggi(),
        'avviso_automatico_il', s.scade - 30) order by s.scade)
      from scadenze s where s.progetto_id = g.id and (adm or s.visibile)), '[]'),
    'link', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'tipo', l.tipo, 'etichetta', l.etichetta, 'url', l.url, 'visibile', l.visibile)
        order by array_position(array['app', 'ios', 'android', 'manuale', 'altro']::tipo_link[], l.tipo), l.etichetta)
      from link l where l.progetto_id = g.id and (adm or l.visibile)), '[]'));
end $$;

-- Editor delle novità: le richieste che si possono collegare.
create or replace function editor_novita(p_progetto uuid, p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_admin(); n novita; sel uuid[];
begin
  if p_id is not null then
    select * into n from novita where id = p_id;
    if n.id is null then perform _errore('Novità non trovata.'); end if;
    p_progetto := n.progetto_id;
  end if;
  select coalesce(array_agg(richiesta_id), '{}') into sel from novita_richieste where novita_id = n.id;
  return jsonb_build_object(
    'novita', case when n.id is null then null else to_jsonb(n) || jsonb_build_object('richieste', to_jsonb(sel)) end,
    'progetto', (select jsonb_build_object('id', g.id, 'nome', g.nome, 'cliente_id', g.cliente_id, 'cliente_nome', c.nome)
                 from progetti g join clienti c on c.id = g.cliente_id where g.id = p_progetto),
    'richieste', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'titolo', q.titolo, 'stato', q.stato, 'tipo', q.tipo, 'inclusa', q.id = any (sel))
        order by array_position(array['in_lavorazione', 'accettata', 'nuova', 'fatta']::stato_richiesta[], q.stato) nulls last, q.aperta_il desc)
      from richieste q where q.progetto_id = p_progetto and (q.stato in ('in_lavorazione', 'accettata', 'nuova', 'fatta') or q.id = any (sel))), '[]'));
end $$;

-- ─────────────────────────────────────────────────────────────
-- Richiesta
-- ─────────────────────────────────────────────────────────────
create or replace function cronologia(p_richiesta uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_utente(); r richieste := _richiesta(p_richiesta); adm boolean := me.ruolo = 'admin';
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'avvenuto_il', e.avvenuto_il,
      'chi', case when e.da_id is null then '' when (select ruolo from profili where id = e.da_id) = 'admin' then nome_admin() else nome_di(e.da_id) end,
      'testo', e.testo, 'solo_admin', not e.visibile_cliente,
      'email', case when adm then to_jsonb(e.email) else '[]'::jsonb end) order by e.avvenuto_il, e.id)
    from eventi e where e.richiesta_id = r.id and (adm or e.visibile_cliente)), '[]');
end $$;

create or replace function _pv_vista(p preventivi) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'id', p.id, 'versione', p.versione, 'stato', p.stato, 'stato_effettivo', stato_effettivo(p), 'numero', p.numero,
    'inviato_il', p.inviato_il, 'scade_il', scade_il(p), 'tipo', p.tipo,
    'dati', preventivo_json(p.id), 'vista', vista_preventivo(preventivo_json(p.id), p.inviato_il),
    'esito', case when p.esito is null then null else jsonb_build_object('tipo', p.esito, 'da_id', p.esito_da, 'da_nome', nome_di(p.esito_da),
               'il', p.esito_il, 'messaggio', p.esito_msg) end) end
$$;

create or replace function _allegati_json(p_richiesta uuid, p_messaggio uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nome', a.nome, 'dimensione', a.dimensione, 'mime', a.mime, 'percorso', a.percorso) order by a.caricato_il), '[]')
    from allegati a where a.richiesta_id = p_richiesta and a.messaggio_id is not distinct from p_messaggio
$$;

create or replace function dettaglio_richiesta(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profili := _richiedi_utente(); r richieste := _richiesta(p_id); adm boolean := me.ruolo = 'admin';
  g progetti; c clienti; bozza preventivi; inv preventivi; acc preventivi; pag pagamenti; risolta novita;
  mia boolean; sola_lettura text; msg_chiuso text; puo_scrivere boolean; dest text[]; pr profili; ric jsonb;
begin
  select * into g from progetti where id = r.progetto_id;
  select * into c from clienti where id = g.cliente_id;
  bozza := pv_bozza(r.id); inv := pv_inviato(r.id); acc := pv_accettato(r.id);
  select * into pag from pagamenti where richiesta_id = r.id;
  select n.* into risolta from novita n join novita_richieste nr on nr.novita_id = n.id
   where nr.richiesta_id = r.id and n.stato = 'pubblicata' order by n.pubblicata_il desc limit 1;
  mia := r.autore_id = me.id;

  -- cosa può fare il cliente
  if not adm and not (mia and r.stato = 'nuova' and not g.archiviato) then
    sola_lettura := case
      when g.archiviato then 'Il progetto è archiviato: puoi solo consultare questa richiesta.'
      when r.stato = 'nuova' then 'L’ha aperta ' || nome_di(r.autore_id) || ': solo chi apre una richiesta può modificarla o ritirarla.'
      when r.stato in ('accettata', 'in_lavorazione') then 'Non puoi più modificarla: è già stata presa in carico.'
      when r.stato = 'fatta' then 'Non puoi più modificarla: la richiesta è stata completata.'
      when r.stato = 'rifiutata' then 'Non puoi più modificarla: la richiesta è stata chiusa. Trovi il motivo nei messaggi.'
      else 'Questa richiesta è stata ritirata e non può essere riaperta.' end;
  end if;

  puo_scrivere := r.stato <> 'ritirata' and not g.archiviato and not (adm and r.archiviata_il is not null);
  if not puo_scrivere then
    msg_chiuso := case when r.stato = 'ritirata' then 'La richiesta è stata ritirata: non si possono aggiungere messaggi.'
      when adm and r.archiviata_il is not null then 'La richiesta è in archivio: ripristinala per scrivere al cliente.'
      else 'Il progetto è archiviato: i messaggi sono in sola lettura.' end;
  end if;

  -- chi riceverà un'email se scrivo
  if adm then
    select coalesce(array_agg(trim(nome || ' ' || cognome)), '{}') into dest from seguono(r.id, null);
  else
    dest := case when coalesce((select f.messaggi from preferenze f where f.profilo_id = (_admin()).id), true) then array[nome_admin()] else '{}' end;
    dest := dest || coalesce((select array_agg(trim(nome || ' ' || cognome)) from seguono(r.id, me.id)), '{}');
  end if;

  if pag.richiesta_id is not null and pag.ricevuta is not null then ric := documento_ricevuta(r.id); end if;

  return jsonb_build_object(
    'io', jsonb_build_object('id', me.id, 'ruolo', me.ruolo),
    'richiesta', jsonb_build_object('id', r.id, 'titolo', r.titolo, 'testo', r.testo, 'stato', r.stato, 'tipo', r.tipo,
      'aperta_il', r.aperta_il, 'archiviata_il', r.archiviata_il, 'autore_id', r.autore_id, 'autore_nome', nome_di(r.autore_id), 'mia', mia,
      'da_rispondere', adm and da_rispondere(r)),
    'progetto', jsonb_build_object('id', g.id, 'nome', g.nome, 'archiviato', g.archiviato, 'garanzia_fino', g.garanzia_fino,
      'garanzia_attiva', g.garanzia_fino is not null and oggi() <= g.garanzia_fino),
    'cliente', jsonb_build_object('id', c.id, 'nome', c.nome, 'fiscale_completo', fiscale_completo(c), 'sostituto', c.sostituto),
    'garanzia', case when r.tipo = 'errore' and g.garanzia_fino is not null then
        case when in_garanzia(g.id, r.aperta_il::date) then 'si' else 'no' end end,
    'permessi', jsonb_build_object(
      'puo_modificare', not adm and sola_lettura is null,
      'sola_lettura', sola_lettura,
      'puo_scrivere', puo_scrivere, 'messaggi_chiusi', msg_chiuso,
      'admin_modificabile', adm and r.stato <> 'ritirata' and r.archiviata_il is null,
      'puo_archiviare', adm and r.archiviata_il is null and r.stato in ('fatta', 'rifiutata', 'ritirata'),
      'eliminabile', adm and r.archiviata_il is not null and acc.id is null and pag.richiesta_id is null,
      'motivo_non_eliminabile', case when adm and acc.id is not null then 'Non si può eliminare: il preventivo accettato' || coalesce(' n. ' || acc.numero, '')
          || ' conta nel riepilogo economico del cliente' || case when acc.tipo = 'occasionale' and extract(year from acc.inviato_il) = extract(year from oggi())
            then ' e nel totale delle prestazioni occasionali del ' || extract(year from oggi()) else '' end || '.' end,
      'puo_lavorare_pv', adm and r.stato <> 'ritirata' and r.archiviata_il is null and pag.richiesta_id is null,
      'puo_rispondere_pv', not adm and not g.archiviato and coalesce(stato_effettivo(inv) = 'inviato', false)),
    'allegati', _allegati_json(r.id, null),
    'messaggi', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'autore_id', m.autore_id, 'autore_nome', trim(p.nome || ' ' || p.cognome),
        'admin', p.ruolo = 'admin', 'mio', m.autore_id = me.id, 'testo', m.testo, 'scritto_il', m.scritto_il,
        'allegati', _allegati_json(r.id, m.id)) order by m.scritto_il)
      from messaggi m join profili p on p.id = m.autore_id where m.richiesta_id = r.id), '[]'),
    'avviso_messaggio', case when array_length(dest, 1) > 0 then 'Riceveranno un’email: ' || array_to_string(dest, ', ') || '.'
      when adm then 'Nessun referente riceve email per questa richiesta: vedranno il messaggio al prossimo accesso.'
      else 'Nessuno riceve un’email: il messaggio resta nel portale.' end,
    'bozza', case when adm then _pv_vista(bozza) end,
    'inviato', _pv_vista(inv),
    'pagamento', case when pag.richiesta_id is null then null else jsonb_build_object('pagato_il', pag.pagato_il, 'metodo', pag.metodo,
        'ricevuta', pag.ricevuta, 'fattura', pag.fattura) end,
    'da_incassare', case when acc.id is not null and r.stato = 'fatta' and pag.richiesta_id is null then
        jsonb_build_object('importo', totale(acc), 'tipo', acc.tipo, 'lavoro_finito_il', _data_fatta(r)) end,
    'preventivo_accettato', case when acc.id is null then null else jsonb_build_object('id', acc.id, 'numero', acc.numero, 'tipo', acc.tipo, 'totale', totale(acc)) end,
    'ricevuta', ric,
    'risolta', case when risolta.id is null then null else jsonb_build_object('id', risolta.id, 'titolo', risolta.titolo, 'pubblicata_il', risolta.pubblicata_il) end,
    'note', case when adm then coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'testo', n.testo, 'scritta_il', n.scritta_il) order by n.scritta_il desc)
        from note_interne n where n.ambito = 'richiesta' and n.richiesta_id = r.id), '[]') end,
    'cronologia', cronologia(r.id),
    'occasionali_accettati_anno', case when adm then (select coalesce(sum(valore(p)), 0) from preventivi p where p.stato = 'inviato' and p.tipo = 'occasionale'
        and p.esito = 'accetta' and extract(year from p.inviato_il) = extract(year from oggi())) end,
    'manca_nel_pdf', case when adm then manca_nel_pdf(prestatore_attuale(), coalesce(bozza.tipo, inv.tipo)::text) end);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Documenti (preventivo e ricevuta in PDF)
-- ─────────────────────────────────────────────────────────────
create or replace function documento_preventivo(p_preventivo uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_utente(); p preventivi; r richieste; g progetti; c clienti; d jsonb;
begin
  select * into p from preventivi where id = p_preventivo;
  if p.id is null or not vede_richiesta(p.richiesta_id) or (me.ruolo <> 'admin' and p.stato <> 'inviato') then perform _errore('Preventivo non trovato.'); end if;
  select * into r from richieste where id = p.richiesta_id;
  select * into g from progetti where id = r.progetto_id;
  select * into c from clienti where id = g.cliente_id;
  d := preventivo_json(p.id);
  return vista_preventivo(d, p.inviato_il) || prestatore_doc(coalesce(p.prestatore, prestatore_attuale())) || jsonb_build_object(
    'numero', case when p.numero is not null then 'N. ' || p.numero else 'Bozza · numero assegnato all’invio' end,
    'versione', 'Versione ' || p.versione,
    'data', data_it(coalesce(p.inviato_il, oggi())),
    'scadenza', case when p.inviato_il is not null then data_it(p.inviato_il + p.validita) else p.validita || ' giorni dall’invio' end,
    'isOcc', p.tipo = 'occasionale', 'isNorm', p.tipo <> 'occasionale',
    'clienteNome', c.nome, 'clienteCitta', indirizzo_di(c), 'attenzione', 'Alla c.a. di ' || nome_di(r.autore_id),
    'oggetto', r.titolo || ' · ' || g.nome,
    'hasAccettazione', p.esito = 'accetta',
    'accettazione', case when p.esito = 'accetta' then 'Accettato online da ' || nome_di(p.esito_da) || ' il ' || data_it(p.esito_il) else '' end,
    'nomeFile', 'Preventivo-' || coalesce(p.numero, 'bozza') || '-v' || p.versione || '.pdf',
    'mancaNelPdf', case when me.ruolo = 'admin' then manca_nel_pdf(coalesce(p.prestatore, prestatore_attuale()), p.tipo::text) end);
end $$;

create or replace function documento_ricevuta(p_richiesta uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_utente(); r richieste := _richiesta(p_richiesta); pg pagamenti; p preventivi; g progetti; c jsonb; righe jsonb := '[]'; dich text[] := '{}';
  prd jsonb; anno int; rit_p text := costanti_fiscali() ->> 'ritenuta';
begin
  select * into pg from pagamenti where richiesta_id = r.id;
  if pg.richiesta_id is null or pg.ricevuta is null then perform _errore('Nessuna ricevuta per questa richiesta.'); end if;
  select * into p from preventivi where id = pg.preventivo_id;
  select * into g from progetti where id = r.progetto_id;
  c := calcola(preventivo_json(p.id));
  righe := righe || jsonb_build_object('label', 'Compenso lordo', 'value', eur((c ->> 'base')::numeric), 'kind', 'riga');
  if (c ->> 'ritenuta')::numeric > 0 then
    righe := righe || jsonb_build_object('label', 'Ritenuta d’acconto ' || rit_p || '%', 'value', '− ' || eur((c ->> 'ritenuta')::numeric), 'kind', 'riga');
  end if;
  righe := righe || jsonb_build_object('label', 'Netto', 'value', eur((c ->> 'base')::numeric - (c ->> 'ritenuta')::numeric), 'kind', 'sub');
  if (c ->> 'bollo')::numeric > 0 then
    righe := righe || jsonb_build_object('label', 'Rimborso marca da bollo', 'value', eur((c ->> 'bollo')::numeric), 'kind', 'riga');
  end if;
  righe := righe || jsonb_build_object('label', 'Totale ricevuto', 'value', eur((c ->> 'totale')::numeric), 'kind', 'tot');
  anno := extract(year from pg.pagato_il);
  dich := dich || 'Prestazione di lavoro autonomo occasionale (art. 2222 c.c.), senza vincolo di subordinazione e senza carattere di abitualità, fuori campo IVA ai sensi dell’art. 5 del DPR 633/1972.'::text;
  dich := dich || case when (c ->> 'ritenuta')::numeric > 0
    then 'Ritenuta d’acconto di ' || eur((c ->> 'ritenuta')::numeric) || ' trattenuta dal committente, sostituto d’imposta, da versare con F24 entro il ' || data_it(f24_entro(pg.pagato_il)) || '.'
    else 'Committente privato: non si applica la ritenuta d’acconto.' end;
  if (c ->> 'bollo')::numeric > 0 then dich := dich || 'Imposta di bollo da 2,00 € assolta sull’originale.'::text; end if;
  if incassato_occasionale_anno(anno, null) <= (costanti_fiscali() ->> 'soglia_inps')::numeric then
    dich := dich || ('Il prestatore dichiara che nel ' || anno || ' i compensi per prestazioni occasionali non superano 5.000 €.');
  end if;
  prd := prestatore_doc(coalesce(pg.prestatore, prestatore_attuale()));
  return prd || jsonb_build_object(
    'numero', 'N. ' || pg.ricevuta, 'data', data_it(pg.pagato_il), 'hasBollo', (c ->> 'bollo')::numeric > 0,
    'clienteNome', pg.committente ->> 'nome', 'clienteCitta', pg.committente ->> 'indirizzo',
    'clienteFiscale', coalesce(nullif(pg.committente ->> 'fiscale', ''), '[P.IVA O C.F. DEL COMMITTENTE]'),
    'oggetto', r.titolo || ' · ' || g.nome,
    'rifPv', 'Come da preventivo n. ' || p.numero || ' del ' || data_it(p.inviato_il) || coalesce(', accettato il ' || data_it(p.esito_il), ''),
    'voci', coalesce((select jsonb_agg(jsonb_build_object('descr', v.descrizione) order by v.posizione) from preventivo_voci v where v.preventivo_id = p.id and v.descrizione <> ''), '[]'),
    'righe', righe,
    'pagamento', 'Pagamento ricevuto il ' || data_it(pg.pagato_il) || ' con ' || case pg.metodo when 'bonifico' then 'bonifico' when 'contanti' then 'contanti' else 'un altro metodo' end || '.',
    'dichiarazioni', to_jsonb(dich),
    'luogoData', (prd ->> 'prestLuogo') || ', ' || data_it(pg.pagato_il),
    'nomeFile', 'Ricevuta-' || replace(pg.ricevuta, '/', '-') || '.pdf');
end $$;

-- Compensi occasionali incassati nell'anno (solo i pagamenti registrati nel portale).
create or replace function incassato_occasionale_anno(p_anno int, p_escludi uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(valore(p)), 0) from pagamenti pg join preventivi p on p.id = pg.preventivo_id
   where p.tipo = 'occasionale' and extract(year from pg.pagato_il) = p_anno and pg.richiesta_id is distinct from p_escludi
$$;

-- Cosa succede registrando il pagamento: numero della ricevuta, ritenuta, bollo, soglia dei 5.000 €.
create or replace function info_pagamento(p_richiesta uuid, p_il date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profili := _richiedi_admin(); r richieste := _richiesta(p_richiesta); acc preventivi := pv_accettato(p_richiesta); c jsonb; cl clienti;
  il date := coalesce(p_il, oggi()); v_anno int := extract(year from coalesce(p_il, oggi())); prossima int; gia numeric; oltre boolean; note text[] := '{}'; occ boolean;
begin
  if acc.id is null then perform _errore('Serve un preventivo accettato per registrare il pagamento.'); end if;
  c := calcola(preventivo_json(acc.id)); occ := acc.tipo = 'occasionale';
  select cl2.* into cl from progetti g join clienti cl2 on cl2.id = g.cliente_id where g.id = r.progetto_id;
  prossima := coalesce((select valore from contatori where contatori.chiave = 'ricevuta' and contatori.anno = v_anno), 0) + 1;
  gia := incassato_occasionale_anno(v_anno, r.id);
  oltre := occ and gia + (c ->> 'valore')::numeric > (costanti_fiscali() ->> 'soglia_inps')::numeric;
  if occ then
    note := note || ('Viene creata la ricevuta n. ' || prossima || '/' || v_anno || ' con i dati del preventivo n. ' || acc.numero || '. La vede anche il cliente, nella richiesta.');
    if (c ->> 'bollo')::numeric > 0 then note := note || 'Stampala, applica la marca da bollo da 2,00 € sull’originale e conservane una copia.'::text; end if;
    if (c ->> 'ritenuta')::numeric > 0 then note := note || ('Il cliente trattiene la ritenuta di ' || eur((c ->> 'ritenuta')::numeric) || ' e la versa con F24 entro il ' || data_it(f24_entro(il)) || '.'); end if;
    if not oltre then note := note || ('La ricevuta dichiara che nel ' || v_anno || ' non superi 5.000 € di compensi occasionali. Il conto si basa solo sui pagamenti registrati qui: se ne hai altri, controllalo tu.'); end if;
  end if;
  return jsonb_build_object('occasionale', occ, 'numero_preventivo', acc.numero, 'titolo', r.titolo, 'righe', righe_totali(c), 'note', to_jsonb(note),
    'oltre_soglia', oltre,
    'avviso_inps', case when oltre then 'Con questo pagamento i compensi occasionali registrati nel ' || v_anno || ' arrivano a ' || eur(gia + (c ->> 'valore')::numeric)
      || ': sopra 5.000 € sono dovuti i contributi INPS e la ricevuta deve indicarli. Chiedi al commercialista prima di emetterla.' end,
    'manca_fiscale_cliente', occ and not fiscale_completo(cl), 'cliente_id', cl.id, 'cliente_nome', cl.nome,
    'manca_prestatore', occ and not prestatore_completo(prestatore_attuale()));
end $$;
