-- Gestione progetti · formattazione, controlli fiscali e calcolo dei preventivi
-- Il calcolo vive solo qui: editor, PDF, email e riepiloghi usano le stesse funzioni.

-- ─────────────────────────────────────────────────────────────
-- Formattazione all'italiana
-- ─────────────────────────────────────────────────────────────
create or replace function eur(v numeric) returns text
language sql immutable as $$
  select case when v < 0 then '−' else '' end
    || translate(to_char(abs(round(coalesce(v, 0), 2)), 'FM999,999,999,990.00'), ',.', '.,') || ' €'
$$;

-- 10 → "10", 1.5 → "1,5", 0.25 → "0,25"
create or replace function num_it(v numeric) returns text
language sql immutable as $$
  select replace(rtrim(rtrim(to_char(round(coalesce(v, 0), 2), 'FM999999990.00'), '0'), '.'), '.', ',')
$$;

create or replace function ore_it(v numeric) returns text
language sql immutable as $$ select num_it(v) || ' h' $$;

create or replace function data_it(d date) returns text
language sql immutable as $$ select to_char(d, 'DD/MM/YYYY') $$;

create or replace function plur(n int, uno text, molti text) returns text
language sql immutable as $$ select case when n = 1 then '1 ' || uno else n || ' ' || molti end $$;

-- "1,5", "1.5", 3, null → numeric (0 se non è un numero)
create or replace function num_da(x jsonb) returns numeric
language plpgsql immutable as $$
declare t text;
begin
  if x is null or jsonb_typeof(x) = 'null' then return 0; end if;
  if jsonb_typeof(x) = 'number' then return (x #>> '{}')::numeric; end if;
  t := replace(trim(x #>> '{}'), ',', '.');
  if t ~ '^-?\d+(\.\d+)?$' then return t::numeric; end if;
  return 0;
end $$;

-- Toglie la formattazione dal testo delle novità e dei messaggi (per le anteprime nelle email).
create or replace function estratto(t text, n int default 160) returns text
language plpgsql immutable as $$
declare x text;
begin
  x := regexp_replace(coalesce(t, ''), '\*\*(.+?)\*\*', '\1', 'g');
  x := regexp_replace(x, '\[([^\]]+)\]\([^)]+\)', '\1', 'g');
  x := regexp_replace(x, '^[-*] ', '', 'gn');
  x := trim(regexp_replace(x, '\s+', ' ', 'g'));
  if length(x) > n then
    x := regexp_replace(left(x, n), '\s+\S*$', '') || '…';
  end if;
  return x;
end $$;

create or replace function taglia(t text, n int) returns text
language sql immutable as $$
  select case when length(coalesce(t, '')) > n then regexp_replace(left(t, n), '\s+\S*$', '') || '…' else coalesce(t, '') end
$$;

-- ─────────────────────────────────────────────────────────────
-- Controlli su partita IVA e codice fiscale
-- ─────────────────────────────────────────────────────────────
create or replace function piva_valida(p text) returns boolean
language plpgsql immutable as $$
declare t int := 0; c int;
begin
  if p !~ '^\d{11}$' then return false; end if;
  for i in 0..9 loop
    c := substr(p, i + 1, 1)::int;
    if i % 2 = 1 then c := c * 2; if c > 9 then c := c - 9; end if; end if;
    t := t + c;
  end loop;
  return (10 - t % 10) % 10 = substr(p, 11, 1)::int;
end $$;

-- Codice fiscale di una persona: formato e carattere di controllo.
create or replace function cf_persona_valido(cf text) returns boolean
language plpgsql immutable as $$
declare
  dispari int[] := array[1,0,5,7,9,13,15,17,19,21,2,4,18,20,11,3,6,8,12,14,16,10,22,25,24,23]; -- A..Z
  dispari_cifre int[] := array[1,0,5,7,9,13,15,17,19,21];                                     -- 0..9
  t int := 0; ch text; v int;
begin
  if cf !~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$' then return false; end if;
  for i in 0..14 loop
    ch := substr(cf, i + 1, 1);
    if i % 2 = 0 then
      v := case when ch ~ '\d' then dispari_cifre[ch::int + 1] else dispari[ascii(ch) - 64] end;
    else
      v := case when ch ~ '\d' then ch::int else ascii(ch) - 65 end;
    end if;
    t := t + v;
  end loop;
  return chr(65 + t % 26) = substr(cf, 16, 1);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Calcolo del preventivo
-- Lo sconto vale solo sul lavoro; le spese entrano nel compenso.
-- occasionale: fuori campo IVA, ritenuta d'acconto 20% se il cliente è sostituto d'imposta,
--              marca da bollo da 2 € sopra 77,47 €, addebitata fuori dalla base della ritenuta.
-- normale:     IVA (es. 22%) oppure senza IVA (forfettario, con marca da bollo sopra 77,47 €).
-- ─────────────────────────────────────────────────────────────
create or replace function costanti_fiscali() returns jsonb
language sql immutable as $$
  select jsonb_build_object('soglia_bollo', 77.47, 'bollo', 2, 'ritenuta', 20, 'soglia_inps', 5000)
$$;

-- Dati del preventivo in forma comune: { tipo, ritenuta, iva, tariffa, sconto, consegna, validita, note,
--   voci: [{descrizione, ore}], spese: [{descrizione, importo}] }
create or replace function calcola(d jsonb) returns jsonb
language plpgsql immutable as $$
declare
  k jsonb := costanti_fiscali();
  tipo text := coalesce(d ->> 'tipo', 'occasionale');
  tariffa numeric := num_da(d -> 'tariffa');
  ore numeric := 0; spese numeric := 0; lavoro numeric; sc_p numeric; sconto numeric; base numeric;
  iva_p numeric := 0; iva numeric := 0; rit numeric := 0; bollo numeric := 0; totale numeric;
  x jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(d -> 'voci', '[]')) loop ore := ore + num_da(x -> 'ore'); end loop;
  for x in select * from jsonb_array_elements(coalesce(d -> 'spese', '[]')) loop spese := spese + num_da(x -> 'importo'); end loop;
  lavoro := ore * tariffa;
  sc_p := least(100, greatest(0, num_da(d -> 'sconto')));
  sconto := lavoro * sc_p / 100;
  base := lavoro - sconto + spese;
  if tipo = 'occasionale' then
    if coalesce((d ->> 'ritenuta')::boolean, true) then rit := base * (k ->> 'ritenuta')::numeric / 100; end if;
    if base > (k ->> 'soglia_bollo')::numeric then bollo := (k ->> 'bollo')::numeric; end if;
    totale := base - rit + bollo;
  else
    iva_p := num_da(d -> 'iva');
    iva := base * iva_p / 100;
    if iva_p = 0 and base > (k ->> 'soglia_bollo')::numeric then bollo := (k ->> 'bollo')::numeric; end if;
    totale := base + iva + bollo;
  end if;
  return jsonb_build_object(
    'tipo', tipo, 'tariffa', round(tariffa, 2), 'ore', ore, 'lavoro', round(lavoro, 2), 'sconto_p', sc_p,
    'sconto', round(sconto, 2), 'spese', round(spese, 2), 'base', round(base, 2), 'iva_p', iva_p,
    'iva', round(iva, 2), 'ritenuta', round(rit, 2), 'bollo', bollo, 'totale', round(totale, 2),
    'valore', round(base, 2)   -- valore del lavoro: senza IVA, al lordo della ritenuta
  );
end $$;

-- Righe dei totali come compaiono nel riepilogo, nel PDF e nella ricevuta. kind: riga | sub | tot
create or replace function righe_totali(c jsonb) returns jsonb
language plpgsql immutable as $$
declare r jsonb := '[]'; rit_p text := (costanti_fiscali() ->> 'ritenuta');
begin
  r := r || jsonb_build_object('label', 'Lavoro (' || ore_it((c ->> 'ore')::numeric) || ' × ' || eur((c ->> 'tariffa')::numeric) || '/h)',
                               'value', eur((c ->> 'lavoro')::numeric), 'kind', 'riga');
  if (c ->> 'sconto')::numeric > 0 then
    r := r || jsonb_build_object('label', 'Sconto ' || num_it((c ->> 'sconto_p')::numeric) || '% sul lavoro', 'value', '− ' || eur((c ->> 'sconto')::numeric), 'kind', 'riga');
  end if;
  if (c ->> 'spese')::numeric > 0 then
    r := r || jsonb_build_object('label', 'Spese', 'value', eur((c ->> 'spese')::numeric), 'kind', 'riga');
  end if;
  if c ->> 'tipo' = 'occasionale' then
    r := r || jsonb_build_object('label', 'Compenso lordo', 'value', eur((c ->> 'base')::numeric), 'kind', 'sub');
    if (c ->> 'ritenuta')::numeric > 0 then
      r := r || jsonb_build_object('label', 'Ritenuta d’acconto ' || rit_p || '%', 'value', '− ' || eur((c ->> 'ritenuta')::numeric), 'kind', 'riga');
    end if;
    if (c ->> 'bollo')::numeric > 0 then
      r := r || jsonb_build_object('label', 'Marca da bollo', 'value', eur((c ->> 'bollo')::numeric), 'kind', 'riga');
    end if;
    r := r || jsonb_build_object('label', 'Netto da pagare', 'value', eur((c ->> 'totale')::numeric), 'kind', 'tot');
  else
    if (c ->> 'iva_p')::numeric > 0 or (c ->> 'bollo')::numeric > 0 then
      r := r || jsonb_build_object('label', 'Imponibile', 'value', eur((c ->> 'base')::numeric), 'kind', 'sub');
    end if;
    if (c ->> 'iva_p')::numeric > 0 then
      r := r || jsonb_build_object('label', 'IVA ' || num_it((c ->> 'iva_p')::numeric) || '%', 'value', eur((c ->> 'iva')::numeric), 'kind', 'riga');
    end if;
    if (c ->> 'bollo')::numeric > 0 then
      r := r || jsonb_build_object('label', 'Marca da bollo', 'value', eur((c ->> 'bollo')::numeric), 'kind', 'riga');
    end if;
    r := r || jsonb_build_object('label', 'Totale', 'value', eur((c ->> 'totale')::numeric), 'kind', 'tot');
  end if;
  return r;
end $$;

create or replace function note_fiscali(c jsonb) returns jsonb
language plpgsql immutable as $$
declare n text[] := '{}';
begin
  if c ->> 'tipo' = 'occasionale' then
    n := n || 'Prestazione di lavoro autonomo occasionale, fuori campo IVA (art. 5 DPR 633/1972). Il compenso sarà documentato con ricevuta.'::text;
    if (c ->> 'ritenuta')::numeric > 0 then
      n := n || ('La ritenuta d’acconto di ' || eur((c ->> 'ritenuta')::numeric) || ' è trattenuta dal committente, sostituto d’imposta, e versata con F24 entro il 16 del mese successivo al pagamento.');
    else
      n := n || 'Committente privato: nessuna ritenuta d’acconto.'::text;
    end if;
  elsif (c ->> 'iva_p')::numeric = 0 then
    n := n || 'Operazione senza IVA, regime forfettario (art. 1, commi 54–89, L. 190/2014).'::text;
  end if;
  if (c ->> 'bollo')::numeric > 0 then
    n := n || 'Marca da bollo da 2,00 € dovuta perché l’importo supera 77,47 €.'::text;
  end if;
  return to_jsonb(n);
end $$;

-- Un preventivo salvato, nella forma comune usata da calcola().
-- Gira con i permessi di chi chiama: un cliente non può leggere così una bozza.
create or replace function preventivo_json(p_id uuid) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'tipo', p.tipo, 'ritenuta', p.ritenuta, 'iva', p.iva, 'tariffa', p.tariffa, 'sconto', p.sconto,
    'consegna', p.consegna, 'validita', p.validita, 'note', p.note,
    'voci', coalesce((select jsonb_agg(jsonb_build_object('descrizione', v.descrizione, 'ore', v.ore) order by v.posizione)
                      from preventivo_voci v where v.preventivo_id = p.id), '[]'),
    'spese', coalesce((select jsonb_agg(jsonb_build_object('descrizione', s.descrizione, 'importo', s.importo) order by s.posizione)
                       from preventivo_spese s where s.preventivo_id = p.id), '[]'))
  from preventivi p where p.id = p_id
$$;

-- Campi calcolati, leggibili anche da PostgREST: select *, totale, valore, stato_effettivo, scade_il from preventivi
create or replace function calcolo(p preventivi) returns jsonb
language sql stable as $$ select calcola(preventivo_json(p.id)) $$;

create or replace function totale(p preventivi) returns numeric
language sql stable as $$ select (calcola(preventivo_json(p.id)) ->> 'totale')::numeric $$;

create or replace function valore(p preventivi) returns numeric
language sql stable as $$ select (calcola(preventivo_json(p.id)) ->> 'valore')::numeric $$;

create or replace function scade_il(p preventivi) returns date
language sql stable as $$ select case when p.inviato_il is null then null else p.inviato_il + p.validita end $$;

-- bozza · inviato (in attesa) · accettato · modifiche · rifiutato · scaduto
create or replace function stato_effettivo(p preventivi) returns text
language sql stable as $$
  select case
    when p.stato = 'bozza' then 'bozza'
    when p.esito = 'accetta' then 'accettato'
    when p.esito = 'modifiche' then 'modifiche'
    when p.esito = 'rifiuta' then 'rifiutato'
    when p.inviato_il + p.validita < oggi() then 'scaduto'
    else 'inviato' end
$$;

create or replace function etichetta_stato_pv(s text) returns text
language sql immutable as $$
  select case s when 'bozza' then 'in bozza' when 'inviato' then 'in attesa di risposta' when 'accettato' then 'accettato'
    when 'modifiche' then 'modifiche richieste' when 'rifiutato' then 'rifiutato' when 'scaduto' then 'scaduto' end
$$;

-- Ultima versione inviata e bozza in corso di una richiesta.
create or replace function pv_inviato(p_richiesta uuid) returns preventivi
language sql stable security definer set search_path = public as $$
  select * from preventivi where richiesta_id = p_richiesta and stato = 'inviato' order by versione desc limit 1
$$;

create or replace function pv_bozza(p_richiesta uuid) returns preventivi
language sql stable security definer set search_path = public as $$
  select * from preventivi where richiesta_id = p_richiesta and stato = 'bozza' limit 1
$$;

-- Il preventivo "corrente" di una richiesta: la bozza se c'è, altrimenti l'ultimo inviato.
create or replace function pv_corrente(p_richiesta uuid) returns preventivi
language sql stable security definer set search_path = public as $$
  select * from preventivi where richiesta_id = p_richiesta order by (stato = 'bozza') desc, versione desc limit 1
$$;

create or replace function pv_accettato(p_richiesta uuid) returns preventivi
language sql stable security definer set search_path = public as $$
  select p.* from preventivi p where p.richiesta_id = p_richiesta and p.stato = 'inviato'
    and p.versione = (select max(versione) from preventivi where richiesta_id = p_richiesta and stato = 'inviato')
    and p.esito = 'accetta'
$$;

-- Dati per il componente PreventivoRiepilogo: voci, spese, totali, note fiscali, consegna, validità.
create or replace function vista_preventivo(d jsonb, inviato_il date default null) returns jsonb
language plpgsql stable as $$
declare c jsonb := calcola(d); voci jsonb; spese jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('descr', coalesce(nullif(trim(v ->> 'descrizione'), ''), '—'),
           'ore', ore_it(num_da(v -> 'ore')), 'importo', eur(num_da(v -> 'ore') * (c ->> 'tariffa')::numeric))), '[]')
    into voci from jsonb_array_elements(coalesce(d -> 'voci', '[]')) v
   where trim(coalesce(v ->> 'descrizione', '')) <> '' or num_da(v -> 'ore') <> 0;
  select coalesce(jsonb_agg(jsonb_build_object('descr', coalesce(nullif(trim(x ->> 'descrizione'), ''), '—'),
           'importo', eur(num_da(x -> 'importo')))), '[]')
    into spese from jsonb_array_elements(coalesce(d -> 'spese', '[]')) x
   where trim(coalesce(x ->> 'descrizione', '')) <> '' or num_da(x -> 'importo') <> 0;
  return jsonb_build_object(
    'voci', voci, 'spese', spese, 'totali', righe_totali(c), 'noteFiscali', note_fiscali(c),
    'consegna', 'Consegna stimata: ' || num_da(d -> 'consegna')::int || ' giorni lavorativi dall’accettazione',
    'validita', case when inviato_il is not null then 'Offerta valida fino al ' || data_it(inviato_il + num_da(d -> 'validita')::int)
                     else 'Offerta valida ' || num_da(d -> 'validita')::int || ' giorni dall’invio' end,
    'note', trim(coalesce(d ->> 'note', '')),
    'calcolo', c);
end $$;

-- ─────────────────────────────────────────────────────────────
-- Indirizzi e dati fiscali
-- ─────────────────────────────────────────────────────────────
create or replace function indirizzo_di(c clienti) returns text
language sql immutable as $$
  select case when c.indirizzo <> '' then c.indirizzo || ', ' || case when c.cap <> '' then c.cap || ' ' else '' end || c.citta else c.citta end
$$;

create or replace function fiscale_di(c clienti) returns text
language sql immutable as $$
  select case
    when c.piva <> '' and (c.cf = '' or c.cf = c.piva) then 'P.IVA e C.F. ' || c.piva
    else concat_ws(' · ', nullif('P.IVA ' || nullif(c.piva, ''), ''), nullif('C.F. ' || nullif(c.cf, ''), '')) end
$$;

create or replace function fiscale_completo(c clienti) returns boolean
language sql immutable as $$ select (c.piva <> '' or c.cf <> '') and c.indirizzo <> '' and c.cap <> '' and c.citta <> '' $$;

create or replace function prestatore_completo(p jsonb) returns boolean
language sql immutable as $$
  select coalesce(p ->> 'nome', '') <> '' and coalesce(p ->> 'indirizzo', '') <> '' and coalesce(p ->> 'cap', '') <> ''
     and coalesce(p ->> 'citta', '') <> '' and coalesce(p ->> 'cf', '') <> ''
$$;

create or replace function prestatore_attuale() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(p) - 'id' from prestatore p
$$;

-- Intestazione per i documenti: dove manca un dato resta il segnaposto tra parentesi quadre.
create or replace function prestatore_doc(p jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'prestNome', coalesce(nullif(p ->> 'nome', ''), '[NOME E COGNOME]'),
    'prestIndirizzo', case when coalesce(p ->> 'indirizzo', '') <> ''
        then (p ->> 'indirizzo') || ', ' || case when coalesce(p ->> 'cap', '') <> '' then (p ->> 'cap') || ' ' else '' end || coalesce(p ->> 'citta', '')
        else '[INDIRIZZO, CAP CITTÀ]' end,
    'prestCf', case when coalesce(p ->> 'cf', '') <> '' then 'C.F. ' || upper(p ->> 'cf') else 'C.F. [CODICE FISCALE]' end,
    'prestPiva', case when coalesce(p ->> 'piva', '') <> '' then 'P.IVA ' || (p ->> 'piva') else 'P.IVA [PARTITA IVA]' end,
    'hasPrestPiva', coalesce(p ->> 'piva', '') <> '',
    'prestEmail', coalesce(p ->> 'email', ''),
    'prestLuogo', case when coalesce(p ->> 'citta', '') <> '' then regexp_replace(p ->> 'citta', '\s*\([A-Za-z]{2}\)\s*$', '') else '[CITTÀ]' end)
$$;

-- Cosa manca nei tuoi dati per un PDF completo (null se non manca niente).
create or replace function manca_nel_pdf(p jsonb, tipo text) returns text
language plpgsql immutable as $$
declare m text[] := '{}'; n int;
begin
  if not (coalesce(p ->> 'indirizzo', '') <> '' and coalesce(p ->> 'cap', '') <> '' and coalesce(p ->> 'citta', '') <> '') then m := m || 'il tuo indirizzo'::text; end if;
  if coalesce(p ->> 'cf', '') = '' then m := m || 'il tuo codice fiscale'::text; end if;
  if tipo is not null and tipo <> 'occasionale' and coalesce(p ->> 'piva', '') = '' then m := m || 'la tua partita IVA'::text; end if;
  n := coalesce(array_length(m, 1), 0);
  if n = 0 then return null; end if;
  if n = 1 then return 'Nel PDF manca ancora ' || m[1] || '.'; end if;
  return 'Nel PDF mancano ancora ' || array_to_string(m[1:n - 1], ', ') || ' e ' || m[n] || '.';
end $$;

-- La ritenuta si versa con F24 entro il 16 del mese dopo il pagamento.
create or replace function f24_entro(il date) returns date
language sql immutable as $$ select (date_trunc('month', il) + interval '1 month' + interval '15 days')::date $$;
