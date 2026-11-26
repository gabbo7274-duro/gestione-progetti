-- Gestione progetti · schema
-- Tutte le scritture passano dalle funzioni in 0004_azioni.sql: le tabelle sono in sola lettura
-- per gli utenti (RLS), così le regole del portale valgono sempre, qualunque client si colleghi.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Tipi
-- ─────────────────────────────────────────────────────────────
create type ruolo_utente      as enum ('admin', 'cliente');
create type stato_richiesta   as enum ('nuova', 'accettata', 'in_lavorazione', 'fatta', 'rifiutata', 'ritirata');
create type tipo_richiesta    as enum ('errore', 'funzione');
create type stato_novita      as enum ('bozza', 'pubblicata');
create type stato_preventivo  as enum ('bozza', 'inviato');
create type tipo_preventivo   as enum ('occasionale', 'normale');
create type esito_preventivo  as enum ('accetta', 'modifiche', 'rifiuta');
create type metodo_pagamento  as enum ('bonifico', 'contanti', 'altro');
create type tipo_scadenza     as enum ('dominio', 'hosting', 'apple', 'google', 'altro');
create type carico_scadenza   as enum ('cliente', 'admin');
create type tipo_link         as enum ('app', 'ios', 'android', 'manuale', 'altro');
create type ambito_nota       as enum ('cliente', 'richiesta');
create type pref_richieste    as enum ('mie', 'tutte', 'nessuna');
create type frequenza_email   as enum ('subito', 'riepilogo');

-- ─────────────────────────────────────────────────────────────
-- Anagrafiche
-- ─────────────────────────────────────────────────────────────
create table clienti (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) > 0),
  citta       text not null default '',
  indirizzo   text not null default '',
  cap         text not null default '' check (cap = '' or cap ~ '^\d{5}$'),
  piva        text not null default '' check (piva = '' or piva ~ '^\d{11}$'),
  cf          text not null default '' check (cf = '' or cf ~ '^(\d{11}|[A-Z0-9]{16})$'),
  sostituto   boolean not null default true,   -- sostituto d'imposta: nei preventivi occasionali si applica la ritenuta
  creato_il   timestamptz not null default now()
);

-- Un profilo per ogni utente di Supabase Auth: l'amministratore o un referente di un cliente.
create table profili (
  id                uuid primary key references auth.users (id) on delete cascade,
  ruolo             ruolo_utente not null default 'cliente',
  cliente_id        uuid references clienti (id) on delete cascade,
  nome              text not null,
  cognome           text not null default '',
  email             text not null unique,
  attivo            boolean not null default true,
  invito_in_attesa  boolean not null default false,
  creato_il         timestamptz not null default now(),
  constraint profilo_cliente check ((ruolo = 'admin' and cliente_id is null) or (ruolo = 'cliente' and cliente_id is not null))
);
create index on profili (cliente_id);

-- I tuoi dati: intestazione di preventivi e ricevute (una sola riga).
create table prestatore (
  id         boolean primary key default true check (id),
  nome       text not null default '',
  indirizzo  text not null default '',
  cap        text not null default '' check (cap = '' or cap ~ '^\d{5}$'),
  citta      text not null default '',
  cf         text not null default '' check (cf = '' or cf ~ '^[A-Z0-9]{16}$'),
  piva       text not null default '' check (piva = '' or piva ~ '^\d{11}$'),
  email      text not null default ''
);
insert into prestatore (id) values (true);

create table preferenze (
  profilo_id        uuid primary key references profili (id) on delete cascade,
  -- cliente
  novita            boolean not null default true,
  richieste         pref_richieste not null default 'mie',
  preventivi        boolean not null default true,
  scadenze          boolean not null default true,
  -- admin
  nuove_richieste   boolean not null default true,
  messaggi          boolean not null default true,
  altre             boolean not null default true,
  frequenza         frequenza_email not null default 'subito'
);

-- ─────────────────────────────────────────────────────────────
-- Progetti
-- ─────────────────────────────────────────────────────────────
create table progetti (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clienti (id) on delete restrict,
  nome           text not null check (length(trim(nome)) > 0),
  descrizione    text not null default '',
  archiviato     boolean not null default false,
  garanzia_fino  date,
  creato_il      timestamptz not null default now()
);
create index on progetti (cliente_id);

create table novita (
  id            uuid primary key default gen_random_uuid(),
  progetto_id   uuid not null references progetti (id) on delete cascade,
  stato         stato_novita not null default 'bozza',
  pubblicata_il date,
  titolo        text not null check (length(trim(titolo)) > 0),
  testo         text not null default '',
  creata_il     timestamptz not null default now(),
  aggiornata_il timestamptz not null default now(),
  constraint pubblicata_con_data check (stato = 'bozza' or (pubblicata_il is not null and length(trim(testo)) > 0))
);
create index on novita (progetto_id);

create table scadenze (
  id           uuid primary key default gen_random_uuid(),
  progetto_id  uuid not null references progetti (id) on delete cascade,
  tipo         tipo_scadenza not null default 'altro',
  nome         text not null check (length(trim(nome)) > 0),
  scade        date not null,
  costo        numeric(10, 2) check (costo is null or costo >= 0),
  carico       carico_scadenza not null default 'cliente',
  visibile     boolean not null default true,
  avvisa       boolean not null default true,
  avvisato_il  date,
  constraint avvisa_solo_se_visibile check (visibile or not avvisa)
);
create index on scadenze (progetto_id);

create table link (
  id           uuid primary key default gen_random_uuid(),
  progetto_id  uuid not null references progetti (id) on delete cascade,
  tipo         tipo_link not null default 'altro',
  etichetta    text not null check (length(trim(etichetta)) > 0),
  url          text not null check (url ~ '^https?://[^\s/]+\.[^\s]+$'),
  visibile     boolean not null default true
);
create index on link (progetto_id);

-- ─────────────────────────────────────────────────────────────
-- Richieste
-- ─────────────────────────────────────────────────────────────
create table richieste (
  id             uuid primary key default gen_random_uuid(),
  progetto_id    uuid not null references progetti (id) on delete cascade,
  autore_id      uuid not null references profili (id) on delete restrict,
  aperta_il      timestamptz not null default now(),
  stato          stato_richiesta not null default 'nuova',
  tipo           tipo_richiesta not null default 'funzione',
  titolo         text not null check (length(trim(titolo)) > 0),
  testo          text not null check (length(trim(testo)) > 0),
  archiviata_il  date
);
create index on richieste (progetto_id);
create index on richieste (stato);

create table novita_richieste (
  novita_id    uuid not null references novita (id) on delete cascade,
  richiesta_id uuid not null references richieste (id) on delete cascade,
  primary key (novita_id, richiesta_id)
);
create index on novita_richieste (richiesta_id);

create table messaggi (
  id            uuid primary key default gen_random_uuid(),
  richiesta_id  uuid not null references richieste (id) on delete cascade,
  autore_id     uuid not null references profili (id) on delete restrict,
  testo         text not null default '',
  scritto_il    timestamptz not null default now()
);
create index on messaggi (richiesta_id, scritto_il);

-- File allegati a una richiesta (messaggio_id nullo) o a un messaggio. Il file sta nello Storage.
create table allegati (
  id            uuid primary key default gen_random_uuid(),
  richiesta_id  uuid not null references richieste (id) on delete cascade,
  messaggio_id  uuid references messaggi (id) on delete cascade,
  nome          text not null,
  dimensione    bigint not null check (dimensione > 0 and dimensione <= 10 * 1048576),
  mime          text not null,
  percorso      text not null unique,   -- chiave nel bucket "allegati"
  caricato_da   uuid not null references profili (id),
  caricato_il   timestamptz not null default now()
);
create index on allegati (richiesta_id);
create index on allegati (messaggio_id);

-- Preventivi: una riga per versione. La bozza in lavorazione ha stato 'bozza';
-- quelle inviate restano com'erano quando sono partite.
create table preventivi (
  id            uuid primary key default gen_random_uuid(),
  richiesta_id  uuid not null references richieste (id) on delete cascade,
  versione      int not null check (versione > 0),
  stato         stato_preventivo not null default 'bozza',
  numero        text,
  tipo          tipo_preventivo not null default 'occasionale',
  ritenuta      boolean not null default true,
  iva           numeric(5, 2) not null default 22 check (iva >= 0 and iva <= 100),
  tariffa       numeric(10, 2) not null default 45 check (tariffa >= 0),
  sconto        numeric(5, 2) not null default 0 check (sconto >= 0 and sconto <= 100),
  consegna      int not null default 10 check (consegna >= 0),   -- giorni lavorativi dall'accettazione
  validita      int not null default 30 check (validita > 0),    -- giorni dall'invio
  note          text not null default '',
  inviato_il    date,
  prestatore    jsonb,             -- i tuoi dati com'erano all'invio
  esito         esito_preventivo,
  esito_da      uuid references profili (id),
  esito_il      date,
  esito_msg     text not null default '',
  aggiornato_il timestamptz not null default now(),
  unique (richiesta_id, versione),
  constraint inviato_completo check (stato = 'bozza' or (numero is not null and inviato_il is not null)),
  constraint esito_solo_inviati check (esito is null or stato = 'inviato')
);
create unique index preventivi_una_bozza on preventivi (richiesta_id) where stato = 'bozza';

create table preventivo_voci (
  id            uuid primary key default gen_random_uuid(),
  preventivo_id uuid not null references preventivi (id) on delete cascade,
  posizione     int not null,
  descrizione   text not null default '',
  ore           numeric(8, 2) not null default 0 check (ore >= 0)
);
create index on preventivo_voci (preventivo_id, posizione);

create table preventivo_spese (
  id            uuid primary key default gen_random_uuid(),
  preventivo_id uuid not null references preventivi (id) on delete cascade,
  posizione     int not null,
  descrizione   text not null default '',
  importo       numeric(10, 2) not null default 0 check (importo >= 0)
);
create index on preventivo_spese (preventivo_id, posizione);

create table pagamenti (
  richiesta_id   uuid primary key references richieste (id) on delete restrict,
  preventivo_id  uuid not null references preventivi (id) on delete restrict,
  pagato_il      date not null,
  metodo         metodo_pagamento not null,
  ricevuta       text unique,        -- "1/2026" per le prestazioni occasionali
  fattura        text not null default '',
  committente    jsonb,              -- dati fiscali del cliente al momento della ricevuta
  prestatore     jsonb,              -- i tuoi dati al momento della ricevuta
  registrato_il  timestamptz not null default now()
);

create table note_interne (
  id            uuid primary key default gen_random_uuid(),
  ambito        ambito_nota not null,
  cliente_id    uuid references clienti (id) on delete cascade,
  richiesta_id  uuid references richieste (id) on delete cascade,
  testo         text not null check (length(trim(testo)) > 0),
  scritta_il    timestamptz not null default now(),
  constraint riferimento check ((ambito = 'cliente' and cliente_id is not null and richiesta_id is null)
                             or (ambito = 'richiesta' and richiesta_id is not null and cliente_id is null))
);

-- Cronologia di ogni richiesta: chi ha fatto cosa e a chi è partita un'email.
create table eventi (
  id                uuid primary key default gen_random_uuid(),
  richiesta_id      uuid not null references richieste (id) on delete cascade,
  tipo              text not null,
  avvenuto_il       timestamptz not null default now(),
  da_id             uuid references profili (id),   -- null = evento automatico
  testo             text not null,
  visibile_cliente  boolean not null default true,
  email             text[] not null default '{}',   -- nomi dei destinatari della notifica collegata
  stato_a           stato_richiesta
);
create index on eventi (richiesta_id, avvenuto_il);

-- Numerazione di preventivi e ricevute, per anno.
create table contatori (
  chiave  text not null,
  anno    int not null,
  valore  int not null default 0,
  primary key (chiave, anno)
);

-- Coda delle email: la riempiono le funzioni del database, la svuota la Edge Function "invia-email".
create table email_outbox (
  id              uuid primary key default gen_random_uuid(),
  destinatario_id uuid references profili (id) on delete cascade,
  a_email         text not null,
  a_nome          text not null,
  oggetto         text not null,
  contenuto       jsonb not null,     -- saluto, paragrafi, card, cta, nota, piede (modello EmailNotifica)
  percorso        text not null,      -- pagina del portale aperta dal pulsante
  riepilogo       boolean not null default false,   -- parte con il riepilogo delle 18:00
  creata_il       timestamptz not null default now(),
  inviata_il      timestamptz,
  tentativi       int not null default 0,
  errore          text
);
create index email_da_inviare on email_outbox (creata_il) where inviata_il is null;

-- ─────────────────────────────────────────────────────────────
-- Funzioni di base
-- ─────────────────────────────────────────────────────────────
create or replace function oggi() returns date
language sql stable as $$ select (now() at time zone 'Europe/Rome')::date $$;

create or replace function io() returns profili
language sql stable security definer set search_path = public as $$
  select * from profili where id = auth.uid() and attivo
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profili where id = auth.uid() and ruolo = 'admin' and attivo)
$$;

create or replace function mio_cliente() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from profili where id = auth.uid() and ruolo = 'cliente' and attivo and not invito_in_attesa
$$;

create or replace function cliente_di_progetto(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from progetti where id = p
$$;

create or replace function cliente_di_richiesta(r uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select pr.cliente_id from richieste q join progetti pr on pr.id = q.progetto_id where q.id = r
$$;

create or replace function vede_richiesta(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin() or (mio_cliente() is not null and cliente_di_richiesta(r) = mio_cliente())
$$;

-- ─────────────────────────────────────────────────────────────
-- Permessi: lettura con RLS, nessuna scrittura diretta
-- ─────────────────────────────────────────────────────────────
alter table clienti           enable row level security;
alter table profili           enable row level security;
alter table prestatore        enable row level security;
alter table preferenze        enable row level security;
alter table progetti          enable row level security;
alter table novita            enable row level security;
alter table novita_richieste  enable row level security;
alter table scadenze          enable row level security;
alter table link              enable row level security;
alter table richieste         enable row level security;
alter table messaggi          enable row level security;
alter table allegati          enable row level security;
alter table preventivi        enable row level security;
alter table preventivo_voci   enable row level security;
alter table preventivo_spese  enable row level security;
alter table pagamenti         enable row level security;
alter table note_interne      enable row level security;
alter table eventi            enable row level security;
alter table contatori         enable row level security;
alter table email_outbox      enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant select on clienti, profili, prestatore, preferenze, progetti, novita, novita_richieste, scadenze, link,
  richieste, messaggi, allegati, preventivi, preventivo_voci, preventivo_spese, pagamenti, note_interne
  to authenticated;
-- eventi: si leggono con la funzione cronologia(), che nasconde i destinatari delle email al cliente.

create policy clienti_lettura on clienti for select to authenticated
  using (is_admin() or id = mio_cliente());

create policy profili_lettura on profili for select to authenticated
  using (is_admin() or id = auth.uid() or ruolo = 'admin' or (cliente_id is not null and cliente_id = mio_cliente()));

create policy prestatore_lettura on prestatore for select to authenticated using (is_admin());

create policy preferenze_lettura on preferenze for select to authenticated using (profilo_id = auth.uid());

create policy progetti_lettura on progetti for select to authenticated
  using (is_admin() or cliente_id = mio_cliente());

create policy novita_lettura on novita for select to authenticated
  using (is_admin() or (stato = 'pubblicata' and cliente_di_progetto(progetto_id) = mio_cliente()));

create policy novita_richieste_lettura on novita_richieste for select to authenticated
  using (is_admin() or exists (select 1 from novita n where n.id = novita_id and n.stato = 'pubblicata'
                               and cliente_di_progetto(n.progetto_id) = mio_cliente()));

create policy scadenze_lettura on scadenze for select to authenticated
  using (is_admin() or (visibile and cliente_di_progetto(progetto_id) = mio_cliente()));

create policy link_lettura on link for select to authenticated
  using (is_admin() or (visibile and cliente_di_progetto(progetto_id) = mio_cliente()));

create policy richieste_lettura on richieste for select to authenticated
  using (is_admin() or cliente_di_progetto(progetto_id) = mio_cliente());

create policy messaggi_lettura on messaggi for select to authenticated using (vede_richiesta(richiesta_id));
create policy allegati_lettura on allegati for select to authenticated using (vede_richiesta(richiesta_id));

-- Il cliente vede solo le versioni inviate, mai le bozze.
create policy preventivi_lettura on preventivi for select to authenticated
  using (is_admin() or (stato = 'inviato' and vede_richiesta(richiesta_id)));

create policy voci_lettura on preventivo_voci for select to authenticated
  using (exists (select 1 from preventivi p where p.id = preventivo_id));
create policy spese_lettura on preventivo_spese for select to authenticated
  using (exists (select 1 from preventivi p where p.id = preventivo_id));

create policy pagamenti_lettura on pagamenti for select to authenticated using (vede_richiesta(richiesta_id));

create policy note_lettura on note_interne for select to authenticated using (is_admin());
