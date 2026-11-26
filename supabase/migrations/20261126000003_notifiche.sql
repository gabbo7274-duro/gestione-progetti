-- Gestione progetti · destinatari delle email, coda di invio e cronologia
-- Le regole su chi riceve cosa sono quelle del prototipo: preferenze di ognuno, referenti attivi
-- (non in attesa di invito), "le mie richieste" / "tutte" / "nessuna", invio subito o nel riepilogo.

-- Ogni profilo nuovo ha le sue preferenze predefinite.
create or replace function _crea_preferenze() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into preferenze (profilo_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger profili_preferenze after insert on profili for each row execute function _crea_preferenze();

create or replace function nome_di(p uuid) returns text
language sql stable security definer set search_path = public as $$
  select trim(nome || ' ' || cognome) from profili where id = p
$$;

create or replace function _admin() returns profili
language sql stable security definer set search_path = public as $$
  select * from profili where ruolo = 'admin' and attivo order by creato_il limit 1
$$;

-- Nome con cui l'amministratore compare nei testi ("Gabriele ha pubblicato…").
create or replace function nome_admin() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nome from profili where ruolo = 'admin' and attivo order by creato_il limit 1), 'Lo sviluppatore')
$$;

create or replace function nome_completo_admin() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select trim(nome || ' ' || cognome) from profili where ruolo = 'admin' and attivo order by creato_il limit 1), 'Lo sviluppatore')
$$;

-- Referenti di un cliente che possono ricevere email.
create or replace function referenti_di(p_cliente uuid) returns setof profili
language sql stable security definer set search_path = public as $$
  select * from profili where cliente_id = p_cliente and ruolo = 'cliente' and attivo and not invito_in_attesa order by nome, cognome
$$;

-- Referenti che seguono una richiesta, secondo la preferenza "richieste".
create or replace function seguono(p_richiesta uuid, p_escludi uuid default null) returns setof profili
language sql stable security definer set search_path = public as $$
  select pr.* from richieste q
    join progetti g on g.id = q.progetto_id
    join profili pr on pr.cliente_id = g.cliente_id and pr.ruolo = 'cliente' and pr.attivo and not pr.invito_in_attesa
    join preferenze f on f.profilo_id = pr.id
   where q.id = p_richiesta
     and pr.id is distinct from p_escludi
     and (f.richieste = 'tutte' or (f.richieste = 'mie' and q.autore_id = pr.id))
   order by pr.nome, pr.cognome
$$;

-- Mette un'email in coda e restituisce il nome del destinatario.
create or replace function _mail(dest profili, oggetto text, paragrafi text[], card jsonb, cta text, percorso text, nota text default null)
returns text language plpgsql security definer set search_path = public as $$
declare cl text; f preferenze; piede text;
begin
  if dest.id is null then return null; end if;
  select * into f from preferenze where profilo_id = dest.id;
  if dest.ruolo = 'admin' then
    piede := 'Notifica di Gestione progetti. Puoi scegliere quali email ricevere dalla pagina Notifiche.';
  else
    select nome into cl from clienti where id = dest.cliente_id;
    piede := 'Ricevi questa email perché sei referente di ' || coalesce(cl, 'un cliente') || ' su Gestione progetti. Puoi scegliere quali email ricevere dalla pagina Notifiche del portale.';
  end if;
  insert into email_outbox (destinatario_id, a_email, a_nome, oggetto, contenuto, percorso, riepilogo)
  values (dest.id, dest.email, trim(dest.nome || ' ' || dest.cognome), oggetto,
    jsonb_build_object(
      'saluto', 'Ciao ' || dest.nome || ',',
      'paragrafi', (select coalesce(jsonb_agg(jsonb_build_object('testo', t)), '[]') from unnest(paragrafi) t),
      'hasCard', card is not null,
      'card', case when card is null then null else jsonb_build_object(
          'etichetta', coalesce(card ->> 'etichetta', ''), 'titolo', coalesce(card ->> 'titolo', ''),
          'sotto', coalesce(card ->> 'sotto', ''), 'hasSotto', coalesce(card ->> 'sotto', '') <> '',
          'citazione', coalesce(card ->> 'citazione', ''), 'hasCitazione', coalesce(card ->> 'citazione', '') <> '') end,
      'cta', coalesce(cta, 'Apri nel portale'),
      'hasNota', nota is not null, 'nota', coalesce(nota, ''),
      'piede', piede),
    percorso, coalesce(f.frequenza = 'riepilogo', false));
  return trim(dest.nome || ' ' || dest.cognome);
end $$;

create or replace function _allegati_txt(n int) returns text
language sql immutable as $$ select case when coalesce(n, 0) = 0 then '' when n = 1 then 'Con 1 allegato' else 'Con ' || n || ' allegati' end $$;

-- Crea le email per un evento e restituisce i nomi dei destinatari.
-- d: { richiesta_id, autore_id, stato, testo, n_allegati, preventivo_id, novita_id, scadenza_id, escludi[] }
create or replace function notifica(tipo text, d jsonb) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  r richieste; g progetti; cl clienti; adm profili; ap preferenze;
  x profili; pv preventivi; c jsonb; nv novita; sx scadenze;
  out text[] := '{}'; card jsonb; percorso text; percorso_msg text; percorso_pv text;
  chi text; admin_nome text := nome_admin(); oggetto text; frase text; incl text[]; gg int;
  escludi uuid[] := coalesce((select array_agg(value::uuid) from jsonb_array_elements_text(d -> 'escludi')), '{}');
  autore uuid := nullif(d ->> 'autore_id', '')::uuid;
begin
  if d ? 'richiesta_id' then
    select * into r from richieste where id = (d ->> 'richiesta_id')::uuid;
    select * into g from progetti where id = r.progetto_id;
  elsif d ? 'progetto_id' then
    select * into g from progetti where id = (d ->> 'progetto_id')::uuid;
  end if;
  select * into cl from clienti where id = g.cliente_id;
  adm := _admin();
  select * into ap from preferenze where profilo_id = adm.id;
  chi := coalesce(nome_di(autore), '');
  if r.id is not null then
    percorso := '/richieste/' || r.id;
    percorso_msg := percorso || '?sezione=messaggi';
    percorso_pv := percorso || '?sezione=preventivo';
    card := jsonb_build_object('etichetta', 'Richiesta · ' || g.nome, 'titolo', r.titolo,
      'sotto', 'Aperta da ' || nome_di(r.autore_id) || ' il ' || data_it(r.aperta_il::date));
  end if;

  if tipo = 'novita' then
    select * into nv from novita where id = (d ->> 'novita_id')::uuid;
    select array_agg('«' || q.titolo || '»' order by q.aperta_il) into incl
      from novita_richieste nr join richieste q on q.id = nr.richiesta_id where nr.novita_id = nv.id;
    for x in select p.* from referenti_di(g.cliente_id) p join preferenze f on f.profilo_id = p.id where f.novita loop
      out := out || _mail(x, 'Novità su ' || g.nome || ': ' || nv.titolo,
        array[admin_nome || ' ha pubblicato una novità sul progetto ' || g.nome || '.'] || case when incl is null then '{}'::text[]
          else array[(case when array_length(incl, 1) = 1 then 'Comprende la richiesta ' else 'Comprende le richieste ' end) || array_to_string(incl, ', ') || '.'] end,
        jsonb_build_object('etichetta', 'Novità · ' || g.nome, 'titolo', nv.titolo, 'sotto', data_it(nv.pubblicata_il), 'citazione', estratto(nv.testo, 200)),
        'Leggi la novità', '/progetti/' || g.id || '?tab=novita');
    end loop;

  elsif tipo = 'stato' then
    for x in select * from seguono(r.id, null) loop
      continue when x.id = any (escludi);
      out := out || _mail(x, 'Richiesta «' || r.titolo || '»: ' || etichetta_stato_richiesta((d ->> 'stato')::stato_richiesta),
        array['La richiesta è passata allo stato “' || etichetta_stato_richiesta((d ->> 'stato')::stato_richiesta) || '”.'],
        card, 'Apri la richiesta', percorso);
    end loop;

  elsif tipo = 'msgAdmin' then
    for x in select * from seguono(r.id, null) loop
      out := out || _mail(x, 'Nuovo messaggio su «' || r.titolo || '»',
        array[admin_nome || ' ha scritto sulla richiesta “' || r.titolo || '”.'],
        jsonb_build_object('etichetta', 'Messaggio di ' || nome_completo_admin(), 'titolo', r.titolo,
          'sotto', _allegati_txt((d ->> 'n_allegati')::int), 'citazione', estratto(d ->> 'testo', 300)),
        'Rispondi nel portale', percorso_msg);
    end loop;

  elsif tipo = 'msgCliente' then
    for x in select * from profili where id = adm.id and coalesce(ap.messaggi, true) union all select * from seguono(r.id, autore) loop
      out := out || _mail(x, 'Messaggio di ' || chi || ' su «' || r.titolo || '»',
        array[chi || ' di ' || cl.nome || ' ha scritto sulla richiesta “' || r.titolo || '”.'],
        jsonb_build_object('etichetta', 'Messaggio · ' || g.nome, 'titolo', r.titolo,
          'sotto', _allegati_txt((d ->> 'n_allegati')::int), 'citazione', estratto(d ->> 'testo', 300)),
        'Rispondi nel portale', percorso_msg);
    end loop;

  elsif tipo = 'preventivo' then
    select * into pv from preventivi where id = (d ->> 'preventivo_id')::uuid;
    c := calcola(preventivo_json(pv.id));
    for x in select p.* from referenti_di(g.cliente_id) p join preferenze f on f.profilo_id = p.id where f.preventivi loop
      out := out || _mail(x, 'Preventivo per «' || r.titolo || '»: ' || eur((c ->> 'totale')::numeric),
        array[admin_nome || ' ti ha mandato il preventivo n. ' || pv.numero || ' per la richiesta “' || r.titolo || '”.',
              'Puoi accettarlo, chiedere modifiche o rifiutarlo dal portale entro il ' || data_it(pv.inviato_il + pv.validita) || '.'],
        jsonb_build_object('etichetta', 'Preventivo · versione ' || pv.versione,
          'titolo', case when pv.tipo = 'occasionale' then 'Netto da pagare ' else 'Totale ' end || eur((c ->> 'totale')::numeric),
          'sotto', 'Consegna stimata: ' || pv.consegna || ' giorni lavorativi dall’accettazione'),
        'Vedi il preventivo', percorso_pv);
    end loop;

  elsif tipo = 'esito' then
    select * into pv from preventivi where id = (d ->> 'preventivo_id')::uuid;
    oggetto := case pv.esito when 'accetta' then 'Preventivo accettato: «' || r.titolo || '»'
      when 'modifiche' then chi || ' chiede modifiche al preventivo «' || r.titolo || '»'
      else 'Preventivo rifiutato: «' || r.titolo || '»' end;
    frase := case pv.esito when 'accetta' then ' ha accettato' when 'modifiche' then ' ha chiesto modifiche al' else ' ha rifiutato' end;
    for x in select * from profili where id = adm.id and coalesce(ap.preventivi, true)
             union all select p.* from referenti_di(g.cliente_id) p join preferenze f on f.profilo_id = p.id
                        where f.preventivi and p.id is distinct from autore loop
      out := out || _mail(x, oggetto, array[chi || frase || ' il preventivo n. ' || pv.numero || '.'],
        card || jsonb_build_object('citazione', case when pv.esito_msg <> '' then estratto(pv.esito_msg, 300) else '' end),
        'Apri la richiesta', percorso_pv);
    end loop;

  elsif tipo = 'nuovaRichiesta' then
    for x in select * from profili where id = adm.id and coalesce(ap.nuove_richieste, true)
             union all select p.* from referenti_di(g.cliente_id) p join preferenze f on f.profilo_id = p.id
                        where p.id is distinct from autore and f.richieste = 'tutte' loop
      out := out || _mail(x, case when r.tipo = 'errore' then 'Errore segnalato da ' else 'Nuova richiesta da ' end || chi || ': «' || r.titolo || '»',
        array[chi || ' di ' || cl.nome || ' ha aperto una richiesta sul progetto ' || g.nome || '.'],
        card || jsonb_build_object('sotto', coalesce(nullif(_allegati_txt((select count(*)::int from allegati where richiesta_id = r.id and messaggio_id is null)), ''), card ->> 'sotto'),
                                   'citazione', estratto(r.testo, 240)),
        'Apri la richiesta', percorso);
    end loop;

  elsif tipo = 'modificata' then
    if coalesce(ap.altre, true) then
      out := out || _mail(adm, chi || ' ha modificato «' || r.titolo || '»',
        array[chi || ' ha cambiato titolo, descrizione o allegati della richiesta, che è ancora “Nuova”.'],
        card || jsonb_build_object('citazione', estratto(r.testo, 240)), 'Apri la richiesta', percorso);
    end if;

  elsif tipo = 'ritirata' then
    for x in select * from profili where id = adm.id and coalesce(ap.altre, true) union all select * from seguono(r.id, autore) loop
      out := out || _mail(x, 'Richiesta ritirata: «' || r.titolo || '»',
        array[chi || ' ha ritirato la richiesta: non serve fare altro.'], card, 'Apri la richiesta', percorso);
    end loop;

  elsif tipo = 'ricevuta' then
    select * into pv from preventivi where id = (d ->> 'preventivo_id')::uuid;
    c := calcola(preventivo_json(pv.id));
    for x in select p.* from referenti_di(g.cliente_id) p join preferenze f on f.profilo_id = p.id where f.preventivi loop
      out := out || _mail(x, 'Ricevuta n. ' || (d ->> 'ricevuta') || ' per «' || r.titolo || '»',
        array[admin_nome || ' ha registrato il pagamento del ' || (d ->> 'pagato_il') || ' per la richiesta “' || r.titolo || '”.',
              'La ricevuta n. ' || (d ->> 'ricevuta') || ' è nella richiesta, alla voce Pagamento.'],
        jsonb_build_object('etichetta', 'Ricevuta · ' || g.nome, 'titolo', 'Totale ricevuto ' || eur((c ->> 'totale')::numeric), 'sotto', 'Preventivo n. ' || pv.numero),
        'Vedi la ricevuta', percorso || '?sezione=pagamento');
    end loop;

  elsif tipo = 'scadenza' then
    select * into sx from scadenze where id = (d ->> 'scadenza_id')::uuid;
    gg := sx.scade - oggi();
    for x in select p.* from referenti_di(g.cliente_id) p join preferenze f on f.profilo_id = p.id where f.scadenze loop
      out := out || _mail(x, case when gg < 0 then 'Scaduto il ' else 'Scade il ' end || data_it(sx.scade) || ': ' || sx.nome,
        array[case when gg > 0 then 'Tra ' || plur(gg, 'giorno', 'giorni') || ' scade ' when gg = 0 then 'Oggi scade ' else 'Il ' || data_it(sx.scade) || ' è scaduto ' end
                || sx.nome || ', per il progetto ' || g.nome || '.',
              case when sx.carico = 'cliente' then 'Il rinnovo è a carico vostro: ricordatevi di farlo prima della scadenza.'
                   else 'Del rinnovo si occupa ' || admin_nome || ': non dovete fare niente.' end],
        jsonb_build_object('etichetta', 'Scadenza · ' || g.nome, 'titolo', sx.nome,
          'sotto', 'Scade il ' || data_it(sx.scade) || case when coalesce(sx.costo, 0) > 0 then ' · ' || eur(sx.costo) || ' l’anno' else '' end),
        'Vedi le scadenze', '/progetti/' || g.id || '?tab=scadenze');
    end loop;
  else
    raise exception 'Tipo di notifica sconosciuto: %', tipo;
  end if;

  return array_remove(out, null);
end $$;

create or replace function etichetta_stato_richiesta(s stato_richiesta) returns text
language sql immutable as $$
  select case s when 'nuova' then 'Nuova' when 'accettata' then 'Accettata' when 'in_lavorazione' then 'In lavorazione'
    when 'fatta' then 'Fatta' when 'rifiutata' then 'Rifiutata' when 'ritirata' then 'Ritirata' end
$$;

create or replace function etichetta_tipo(t tipo_richiesta) returns text
language sql immutable as $$ select case t when 'errore' then 'Errore' else 'Nuova funzione' end $$;

-- Registra un evento nella cronologia della richiesta.
create or replace function _evento(p_richiesta uuid, p_tipo text, p_testo text, p_da uuid, p_email text[] default '{}',
                                   p_visibile boolean default true, p_stato stato_richiesta default null)
returns void language sql security definer set search_path = public as $$
  insert into eventi (richiesta_id, tipo, testo, da_id, email, visibile_cliente, stato_a)
  values (p_richiesta, p_tipo, p_testo, p_da, coalesce(p_email, '{}'), p_visibile, p_stato)
$$;

-- Testo da mostrare dopo un'azione: "· 2 email inviate, 1 email nel riepilogo di stasera"
create or replace function riepilogo_invio(nomi text[]) returns text
language sql stable security definer set search_path = public as $$
  with u as (select riepilogo from email_outbox where creata_il = now() and inviata_il is null)
  select case when coalesce(array_length(nomi, 1), 0) = 0 then '' else
    ' · ' || concat_ws(', ',
      nullif(plur((select count(*)::int from u where not riepilogo), 'email inviata', 'email inviate'), '0 email inviate'),
      nullif(plur((select count(*)::int from u where riepilogo), 'email nel riepilogo di stasera', 'email nel riepilogo di stasera'), '0 email nel riepilogo di stasera'))
  end
$$;
