// Admin · elenco clienti e scheda del cliente (dati fiscali, note interne, riepilogo economico, progetti, referenti).
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAzione, useDati } from '../lib/api';
import { eur, plur, quando, taglia } from '../lib/formato';
import { Apribile, AvvisoRegola, Caricamento, ErroreCaricamento, ErroreRete, Finestra, Vuoto } from '../componenti/Base';
import { IconaAvanti, IconaCestino, IconaLucchetto, IconaMatita, IconaPiu } from '../componenti/Icone';
import { Percorso, TitoloPagina } from '../comune/Layout';
import { useToast } from '../comune/Toast';

type RigaCliente = { id: string; nome: string; citta: string; referenti: number; progetti_attivi: number; nuove: number; accettato: number };

export function Clienti() {
  const { dati, errore, caricamento, ricarica } = useDati<{ nuove: number; clienti: RigaCliente[] }>('elenco_clienti');
  const [nuovo, setNuovo] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <TitoloPagina titolo="Clienti" sotto={dati ? (dati.nuove ? plur(dati.nuove, 'richiesta nuova da gestire', 'richieste nuove da gestire') : 'Nessuna richiesta nuova da gestire') : ' '} />
        <button type="button" className="btn stretto" onClick={() => setNuovo(true)}><IconaPiu />Nuovo cliente</button>
      </div>
      {caricamento && !dati && <Caricamento />}
      {errore && <ErroreCaricamento messaggio={errore.message} onRiprova={ricarica} />}
      {dati && (dati.clienti.length === 0 ? <Vuoto titolo="Nessun cliente" testo="Aggiungi il primo cliente per creare i suoi progetti e invitare i referenti." /> : (
        <ul className="elenco">
          {dati.clienti.map((c) => (
            <li key={c.id}>
              <Link to={`/clienti/${c.id}`} className="riga" style={{ minHeight: 68 }}>
                <span className="riga-testo">
                  <span className="riga-titolo" style={{ fontSize: 16 }}>{c.nome}</span>
                  <span className="riga-meta">{c.citta}{c.citta ? ' · ' : ''}{c.referenti ? plur(c.referenti, 'referente', 'referenti') : 'nessun referente'}</span>
                </span>
                <span style={{ flex: '0 0 auto', minWidth: 190, display: 'flex', flexDirection: 'column', fontSize: 14, color: 'var(--testo-2)' }}>
                  <span>{c.progetti_attivi ? plur(c.progetti_attivi, 'progetto attivo', 'progetti attivi') : 'Nessun progetto attivo'}</span>
                  <span style={{ fontSize: 13, color: 'var(--tenue)' }}>{c.accettato ? 'Accettato ' + eur(c.accettato) : 'Nessun preventivo accettato'}</span>
                </span>
                <span style={{ flex: '0 0 auto', minWidth: 110, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                  {c.nuove > 0 ? <span className="segnale">{plur(c.nuove, 'nuova', 'nuove')}</span> : <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Nessuna nuova</span>}
                  <IconaAvanti className="chevron" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
      {nuovo && <NuovoCliente onChiudi={() => setNuovo(false)} />}
    </>
  );
}

function NuovoCliente({ onChiudi }: { onChiudi: () => void }) {
  const [nome, setNome] = useState(''); const [citta, setCitta] = useState('');
  const az = useAzione(); const naviga = useNavigate(); const toast = useToast();
  async function salva(e: FormEvent) {
    e.preventDefault();
    const r = await az.esegui('crea_cliente', { p_nome: nome, p_citta: citta });
    if (r?.id) { toast(r.messaggio); naviga(`/clienti/${r.id}?fiscali=1`); }
  }
  return (
    <Finestra titolo="Nuovo cliente" onChiudi={onChiudi}>
      <form onSubmit={(e) => void salva(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="campo"><label htmlFor="nc-nome">Ragione sociale o nome</label><input id="nc-nome" className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="organization" /></div>
        <div className="campo"><label htmlFor="nc-citta">Città e provincia</label><input id="nc-citta" className="input" value={citta} onChange={(e) => setCitta(e.target.value)} placeholder="Es. Thiene (VI)" /></div>
        <p style={{ fontSize: 14 }}>Dopo puoi completare i dati fiscali, creare i progetti e invitare i referenti.</p>
        {az.erroreRete && <ErroreRete />}
        <AvvisoRegola testo={az.errore} />
        <div className="azioni fine"><button type="button" className="btn" onClick={onChiudi}>Annulla</button><button type="submit" className="btn primario" disabled={az.occupato}>{az.occupato ? 'Salvataggio…' : 'Crea cliente'}</button></div>
      </form>
    </Finestra>
  );
}

// ─────────────────────────────────────────────────────────────
type DettaglioCliente = {
  cliente: { id: string; nome: string; citta: string; indirizzo: string; cap: string; piva: string; cf: string; sostituto: boolean; fiscale_completo: boolean; fiscale: string; indirizzo_completo: string };
  progetti: { id: string; nome: string; descrizione: string; archiviato: boolean; nuove: number }[];
  referenti: { id: string; nome: string; cognome: string; email: string; stato: 'attivo' | 'in_attesa' | 'non_attivo' }[];
  note: { id: string; testo: string; scritta_il: string }[];
  economico: { accettato: number; n_accettato: number; in_attesa: number; n_in_attesa: number; completato: number; n_completato: number; incassato: number; n_incassato: number;
    righe: { nome: string; accettato: number; in_attesa: number; completato: number; incassato: number }[] };
};

export function Cliente() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { dati, errore, caricamento, ricarica } = useDati<DettaglioCliente>('dettaglio_cliente', { p_id: id });
  const [apertoFisc, setApertoFisc] = useState(params.has('fiscali'));
  const [modificaFisc, setModificaFisc] = useState(params.has('fiscali'));
  const [apertoNote, setApertoNote] = useState(false);
  const [invita, setInvita] = useState(false);
  const [nuovoProgetto, setNuovoProgetto] = useState(false);
  const ritorno = params.get('ritorno');

  if (caricamento && !dati) return <Caricamento />;
  if (errore || !dati) return <ErroreCaricamento messaggio={errore?.message ?? 'Cliente non trovato.'} onRiprova={ricarica} />;
  const c = dati.cliente; const e = dati.economico;
  const attivi = dati.progetti.filter((p) => !p.archiviato), archiviati = dati.progetti.filter((p) => p.archiviato);

  return (
    <>
      <Percorso voci={[{ label: 'Clienti', a: '/clienti' }, { label: c.nome }]} />
      <TitoloPagina titolo={c.nome} sotto={c.citta} />

      <Apribile id="pan-fisc" titolo="Dati fiscali" aperto={apertoFisc} onCambia={setApertoFisc}
        extra={!c.fiscale_completo ? <span className="segnale">Da completare</span> : undefined}
        riassunto={c.fiscale_completo ? `${c.fiscale} · ${c.indirizzo_completo}` : 'Servono per le ricevute delle prestazioni occasionali'}>
        {modificaFisc
          ? <FormFiscali c={c} ritorno={ritorno} onFatto={() => { setModificaFisc(false); void ricarica(); }} />
          : (
            <>
              <dl className="dl">
                {[
                  ['Ragione sociale', c.nome],
                  ['Indirizzo', c.indirizzo ? c.indirizzo_completo : 'Da inserire'],
                  ['Partita IVA', c.piva || 'Da inserire'],
                  ['Codice fiscale', c.cf || (c.piva ? 'Uguale alla partita IVA' : 'Da inserire')],
                  ['Ritenuta d’acconto', c.sostituto ? 'Sì, è sostituto d’imposta: nei nuovi preventivi la ritenuta è già selezionata' : 'No: nei nuovi preventivi la ritenuta parte tolta'],
                ].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
              <div><button type="button" className="btn piccolo" onClick={() => setModificaFisc(true)}><IconaMatita />Modifica</button></div>
            </>
          )}
      </Apribile>

      <NoteInterne id="pan-note-cli" ambito="cliente" rif={c.id} note={dati.note} aperto={apertoNote} onCambia={setApertoNote} onCambiate={ricarica}
        segnaposto="Es. pagano a 60 giorni, preferisce essere chiamato al mattino…" />

      <section aria-labelledby="sez-economico" className="sez" style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '4px 12px' }}>
          <h2 id="sez-economico" className="h2">Riepilogo economico</h2>
          <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Importi senza IVA e al lordo della ritenuta · dai preventivi inviati</span>
        </div>
        {e.righe.length === 0 ? <span style={{ fontSize: 14, color: 'var(--tenue)' }}>Nessun preventivo inviato a questo cliente.</span> : (
          <>
            <div className="cifre">
              {[
                { l: 'Accettato', v: e.accettato, s: plur(e.n_accettato, 'preventivo', 'preventivi') },
                { l: 'In attesa di risposta', v: e.in_attesa, s: plur(e.n_in_attesa, 'preventivo', 'preventivi') },
                { l: 'Lavoro completato', v: e.completato, s: 'accettato e con richiesta “Fatta”' },
                { l: 'Incassato', v: e.incassato, s: e.completato - e.incassato > 0.004 ? 'da incassare ' + eur(e.completato - e.incassato) : e.n_incassato ? plur(e.n_incassato, 'pagamento', 'pagamenti') : 'nessun pagamento registrato' },
              ].map((k) => <div key={k.l} className="cifra"><span className="etichetta">{k.l}</span><span className="valore">{eur(k.v)}</span><span className="sotto">{k.s}</span></div>)}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div className="tabella" style={{ minWidth: 640 }}>
                {[{ nome: 'Progetto', testa: true } as const, ...e.righe].map((r, i) => (
                  <div key={i} className={'testa' in r ? 'testa' : 'numeri'} aria-hidden={'testa' in r ? true : undefined}
                    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px 110px 110px 110px', gap: 8, padding: '8px 12px' }}>
                    {'testa' in r
                      ? <><span>Progetto</span><span className="destra">Accettato</span><span className="destra">In attesa</span><span className="destra">Completato</span><span className="destra">Incassato</span></>
                      : <><span style={{ fontWeight: 600 }}>{r.nome}</span><span className="destra">{eur(r.accettato)}</span><span className="destra">{eur(r.in_attesa)}</span><span className="destra">{eur(r.completato)}</span><span className="destra">{eur(r.incassato)}</span></>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <section aria-labelledby="sez-progetti" style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 id="sez-progetti" className="h2" style={{ lineHeight: '44px' }}>Progetti attivi</h2>
            <button type="button" className="btn stretto" onClick={() => setNuovoProgetto(true)}><IconaPiu />Nuovo progetto</button>
          </div>
          {attivi.length ? <ElencoProgetti progetti={attivi} /> : <Vuoto icona titolo="Nessun progetto attivo" testo="Quando inizi un progetto per questo cliente, comparirà qui." />}
          {archiviati.length > 0 && (
            <>
              <h2 className="h2" style={{ margin: '8px 0 0', lineHeight: '44px' }}>Archiviati</h2>
              <ElencoProgetti progetti={archiviati} archiviati />
            </>
          )}
        </section>
        <section aria-labelledby="sez-referenti" style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h2 id="sez-referenti" className="h2" style={{ lineHeight: '44px' }}>Referenti</h2>
            <button type="button" className="btn stretto" onClick={() => setInvita(true)}><IconaPiu />Invita referente</button>
          </div>
          {dati.referenti.length === 0 ? <Vuoto titolo="Nessun referente" testo="Invita la prima persona del cliente: riceverà un’email per impostare la password." /> : (
            <ul className="elenco">
              {dati.referenti.map((r) => <Referente key={r.id} r={r} onCambiato={ricarica} />)}
            </ul>
          )}
        </section>
      </div>
      {invita && <InvitaReferente clienteId={c.id} onChiudi={() => setInvita(false)} onFatto={() => { setInvita(false); void ricarica(); }} />}
      {nuovoProgetto && <ModificaProgetto clienteId={c.id} onChiudi={() => setNuovoProgetto(false)} />}
    </>
  );
}

function ElencoProgetti({ progetti, archiviati = false }: { progetti: DettaglioCliente['progetti']; archiviati?: boolean }) {
  return (
    <ul className={`elenco ${archiviati ? 'tenue' : ''}`}>
      {progetti.map((p) => (
        <li key={p.id}>
          <Link to={`/progetti/${p.id}`} className="riga" style={{ flexWrap: 'nowrap', gap: 12 }}>
            <span className="riga-testo" style={{ flex: '1 1 auto' }}>
              <span className="riga-titolo" style={{ color: archiviati ? 'var(--testo-2)' : undefined }}>{p.nome}</span>
              <span className="riga-meta">{p.descrizione}</span>
            </span>
            {archiviati ? <span className="pill spento">Archiviato</span> : p.nuove > 0 && <span className="segnale">{plur(p.nuove, 'nuova', 'nuove')}</span>}
            <IconaAvanti className="chevron" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Referente({ r, onCambiato }: { r: DettaglioCliente['referenti'][number]; onCambiato: () => void }) {
  const az = useAzione(); const toast = useToast();
  async function cambia(attivo: boolean) {
    const x = await az.esegui('imposta_referente_attivo', { p_id: r.id, p_attivo: attivo });
    if (x) { toast(x.messaggio); onCambiato(); }
  }
  return (
    <li style={{ padding: '14px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px' }}>
      <span style={{ flex: '1 1 180px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 600 }}>{r.nome} {r.cognome}</span>
        <span style={{ fontSize: 13, color: 'var(--tenue)', overflowWrap: 'anywhere' }}>{r.email}</span>
      </span>
      {r.stato === 'attivo' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--ok-testo)' }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#2E9447' }} />Attivo: sì</span>}
      {r.stato === 'non_attivo' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--tenue)' }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid #9A9DA3' }} />Attivo: no</span>}
      {r.stato === 'in_attesa' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#7F4D00' }}><span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: '#D98A00' }} />Invito in attesa</span>}
      <button type="button" className="link tenue" style={{ fontSize: 13, minHeight: 44 }} disabled={az.occupato} onClick={() => void cambia(r.stato === 'non_attivo')}>
        {r.stato === 'non_attivo' ? 'Riattiva' : 'Disattiva'}
      </button>
      {az.errore && <span style={{ flexBasis: '100%' }}><AvvisoRegola testo={az.errore} /></span>}
    </li>
  );
}

function FormFiscali({ c, ritorno, onFatto }: { c: DettaglioCliente['cliente']; ritorno: string | null; onFatto: () => void }) {
  const [f, setF] = useState({ nome: c.nome, indirizzo: c.indirizzo, cap: c.cap, citta: c.citta, piva: c.piva, cf: c.cf, sostituto: c.sostituto });
  const az = useAzione(); const toast = useToast(); const naviga = useNavigate();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: k === 'sostituto' ? e.target.checked : e.target.value }); az.pulisci(); };
  async function salva() {
    const r = await az.esegui('salva_dati_fiscali', { p_cliente: c.id, p_nome: f.nome, p_indirizzo: f.indirizzo, p_cap: f.cap, p_citta: f.citta, p_piva: f.piva, p_cf: f.cf, p_sostituto: f.sostituto });
    if (!r) return;
    if (ritorno) { naviga(`/richieste/${ritorno}?sezione=pagamento&registra=1`, { state: { toast: 'Dati fiscali salvati: ora puoi creare la ricevuta' } }); return; }
    toast(r.messaggio); onFatto();
  }
  return (
    <>
      {ritorno && <p role="note" className="avviso nota" style={{ margin: 0 }}>Quando salvi torni alla richiesta e puoi creare la ricevuta.</p>}
      <div className="campo"><label htmlFor="df-nome">Ragione sociale o nome</label><input id="df-nome" className="input" value={f.nome} onChange={set('nome')} autoComplete="organization" /></div>
      <div className="campi">
        <div className="campo" style={{ flex: '2 1 280px' }}><label htmlFor="df-indirizzo">Indirizzo</label><input id="df-indirizzo" className="input" value={f.indirizzo} onChange={set('indirizzo')} placeholder="Via e numero civico" autoComplete="street-address" /></div>
        <div className="campo" style={{ flex: '1 1 100px' }}><label htmlFor="df-cap">CAP</label><input id="df-cap" className="input" inputMode="numeric" maxLength={5} value={f.cap} onChange={set('cap')} autoComplete="postal-code" /></div>
        <div className="campo" style={{ flex: '2 1 220px' }}><label htmlFor="df-citta">Città e provincia</label><input id="df-citta" className="input" value={f.citta} onChange={set('citta')} placeholder="Es. Thiene (VI)" /></div>
      </div>
      <div className="campi">
        <div className="campo"><label htmlFor="df-piva">Partita IVA</label><input id="df-piva" className="input numeri" inputMode="numeric" maxLength={11} value={f.piva} onChange={set('piva')} /></div>
        <div className="campo"><label htmlFor="df-cf">Codice fiscale</label><input id="df-cf" className="input" maxLength={16} value={f.cf} onChange={set('cf')} placeholder="Vuoto se è uguale alla partita IVA" style={{ textTransform: 'uppercase' }} /></div>
      </div>
      <label className="spunta"><input type="checkbox" checked={f.sostituto} onChange={set('sostituto')} />
        <span className="testi"><strong>È sostituto d’imposta: applica la ritenuta d’acconto del 20%</strong><span>Di solito sì per aziende e professionisti, no per i privati. Vale come scelta di partenza nei nuovi preventivi.</span></span></label>
      {az.erroreRete && <ErroreRete />}
      <AvvisoRegola testo={az.errore} />
      <div className="azioni fine">
        <button type="button" className="btn piccolo" onClick={onFatto}>Annulla</button>
        <button type="button" className="btn piccolo primario" disabled={az.occupato} onClick={() => void salva()}>{az.occupato ? 'Salvataggio…' : 'Salva'}</button>
      </div>
    </>
  );
}

function InvitaReferente({ clienteId, onChiudi, onFatto }: { clienteId: string; onChiudi: () => void; onFatto: () => void }) {
  const [v, setV] = useState({ nome: '', cognome: '', email: '' });
  const [errore, setErrore] = useState<string | null>(null);
  const [rete, setRete] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const toast = useToast();
  async function invia(e: FormEvent) {
    e.preventDefault();
    setOccupato(true); setErrore(null); setRete(false);
    const { data, error } = await supabase.functions.invoke('invita-referente', {
      body: { cliente_id: clienteId, nome: v.nome, cognome: v.cognome, email: v.email, redirect: window.location.origin + '/nuova-password?modo=invito' },
    });
    setOccupato(false);
    if (error) {
      let msg: string | null = null;
      try { msg = (await (error as { context?: Response }).context?.json())?.errore ?? null; } catch { /* niente */ }
      if (msg) setErrore(msg); else setRete(true);
      return;
    }
    toast(`Invito inviato a ${(data as { email: string }).email}`);
    onFatto();
  }
  return (
    <Finestra titolo="Invita referente" onChiudi={onChiudi}>
      <form onSubmit={(e) => void invia(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p>Riceverà un’email con un link per scegliere la password. Il link vale 24 ore.</p>
        <div className="campi">
          <div className="campo"><label htmlFor="inv-nome">Nome</label><input id="inv-nome" className="input" value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} autoComplete="given-name" /></div>
          <div className="campo"><label htmlFor="inv-cognome">Cognome</label><input id="inv-cognome" className="input" value={v.cognome} onChange={(e) => setV({ ...v, cognome: e.target.value })} autoComplete="family-name" /></div>
        </div>
        <div className="campo"><label htmlFor="inv-email">Email</label><input id="inv-email" className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} autoComplete="email" /></div>
        {rete && <ErroreRete />}
        <AvvisoRegola testo={errore} />
        <div className="azioni fine"><button type="button" className="btn" onClick={onChiudi}>Annulla</button><button type="submit" className="btn primario" disabled={occupato}>{occupato ? 'Invio…' : 'Invia invito'}</button></div>
      </form>
    </Finestra>
  );
}

/** Crea o modifica un progetto (nome, descrizione, archiviato). */
export function ModificaProgetto({ clienteId, progetto, onChiudi, onFatto }: {
  clienteId: string; progetto?: { id: string; nome: string; descrizione: string; archiviato: boolean }; onChiudi: () => void; onFatto?: () => void;
}) {
  const [f, setF] = useState({ nome: progetto?.nome ?? '', descrizione: progetto?.descrizione ?? '', archiviato: progetto?.archiviato ?? false });
  const az = useAzione(); const naviga = useNavigate(); const toast = useToast();
  async function salva(e: FormEvent) {
    e.preventDefault();
    const r = await az.esegui('salva_progetto', { p_id: progetto?.id ?? null, p_cliente: clienteId, p_nome: f.nome, p_descrizione: f.descrizione, p_archiviato: f.archiviato });
    if (!r) return;
    toast(r.messaggio);
    if (progetto) onFatto?.(); else naviga(`/progetti/${r.id}`);
  }
  return (
    <Finestra titolo={progetto ? 'Modifica progetto' : 'Nuovo progetto'} onChiudi={onChiudi}>
      <form onSubmit={(e) => void salva(e)} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="campo"><label htmlFor="pr-nome">Nome del progetto</label><input id="pr-nome" className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
        <div className="campo"><label htmlFor="pr-descr">Descrizione</label><textarea id="pr-descr" className="input" rows={3} value={f.descrizione} onChange={(e) => setF({ ...f, descrizione: e.target.value })} placeholder="Una riga che il cliente riconosce, es. App per tablet degli agenti" /></div>
        {progetto && (
          <label className="spunta"><input type="checkbox" checked={f.archiviato} onChange={(e) => setF({ ...f, archiviato: e.target.checked })} />
            <span className="testi"><strong>Progetto archiviato</strong><span>Il cliente lo vede in sola lettura e non può aprire nuove richieste.</span></span></label>
        )}
        {az.erroreRete && <ErroreRete />}
        <AvvisoRegola testo={az.errore} />
        <div className="azioni fine"><button type="button" className="btn" onClick={onChiudi}>Annulla</button><button type="submit" className="btn primario" disabled={az.occupato}>{az.occupato ? 'Salvataggio…' : progetto ? 'Salva' : 'Crea progetto'}</button></div>
      </form>
    </Finestra>
  );
}

/** Note interne (solo admin) di un cliente o di una richiesta. */
export function NoteInterne({ id, ambito, rif, note, aperto, onCambia, onCambiate, segnaposto }: {
  id: string; ambito: 'cliente' | 'richiesta'; rif: string; note: { id: string; testo: string; scritta_il: string }[];
  aperto: boolean; onCambia: (v: boolean) => void; onCambiate: () => void; segnaposto: string;
}) {
  const [testo, setTesto] = useState('');
  const az = useAzione(); const toast = useToast();
  async function aggiungi() {
    const r = await az.esegui('aggiungi_nota', { p_ambito: ambito, p_rif: rif, p_testo: testo });
    if (r) { setTesto(''); toast(r.messaggio); onCambiate(); }
  }
  async function elimina(nid: string) {
    const r = await az.esegui('elimina_nota', { p_id: nid });
    if (r) { toast(r.messaggio); onCambiate(); }
  }
  return (
    <Apribile id={id} aperto={aperto} onCambia={onCambia} conta={note.length}
      titolo={<><IconaLucchetto size={16} />Note interne</>}
      extra={<span className="solo-tu">Solo tu le vedi</span>}
      riassunto={note.length ? `${quando(note[0].scritta_il)}: ${taglia(note[0].testo, 110)}` : 'Accordi a voce, dettagli tecnici, promemoria'}>
      <div className="riquadro-note">
        {note.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {note.map((n) => (
              <li key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#fff', border: '1px solid var(--nota-bordo)', borderRadius: 8, padding: '10px 6px 10px 12px' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 12, color: 'var(--avviso-testo)' }}>{quando(n.scritta_il)}</span>
                  <p style={{ margin: 0, fontSize: 14, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{n.testo}</p>
                </div>
                <button type="button" className="icona-btn" aria-label="Elimina nota" title="Elimina nota" onClick={() => void elimina(n.id)}><IconaCestino /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="campo">
          <label htmlFor={`${id}-testo`}>Aggiungi una nota</label>
          <textarea id={`${id}-testo`} className="input" rows={2} style={{ minHeight: 72 }} value={testo} onChange={(e) => { setTesto(e.target.value); az.pulisci(); }} placeholder={segnaposto} />
        </div>
        {az.erroreRete && <ErroreRete />}
        <AvvisoRegola testo={az.errore} />
        <div className="azioni tra">
          <span style={{ fontSize: 12, color: 'var(--avviso-testo)' }}>{ambito === 'cliente' ? 'Il cliente non vede mai queste note.' : 'Il cliente non vede mai queste note, nemmeno nella cronologia.'}</span>
          <button type="button" className="btn" disabled={az.occupato} onClick={() => void aggiungi()}>{az.occupato ? 'Salvataggio…' : 'Salva nota'}</button>
        </div>
      </div>
    </Apribile>
  );
}
