// Admin · dettaglio della richiesta: gestione, messaggi, preventivo, pagamento, note interne, cronologia.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { rpc, useAzione, useDati } from '../lib/api';
import { data, eur, oggiIso } from '../lib/formato';
import { togliFile } from '../lib/file';
import { AvvisoRegola, Caricamento, ErroreCaricamento, ErroreRete, Finestra, StatoBadge, TagGaranzia, TagTipo } from '../componenti/Base';
import { PreventivoRiepilogo, Totali, type Riga } from '../componenti/Documenti';
import { IconaLucchetto, IconaPdf, IconaPiu, IconaSpunta } from '../componenti/Icone';
import { Percorso } from '../comune/Layout';
import { useToast } from '../comune/Toast';
import { useSessione } from '../comune/Sessione';
import {
  BoxEsito, ElencoAllegati, FinestraPdf, FinestraRicevuta, rigaPagamento, SezioneCronologia, SezioneMessaggi, useApriAllegato,
  type DatiPv, type DettaglioRichiesta,
} from '../comune/RichiestaParti';
import { NoteInterne } from './Clienti';
import { ConfermaElimina } from './Progetto';

export function RichiestaAdmin() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const sezione = params.get('sezione');
  const { dati, errore, caricamento, ricarica } = useDati<DettaglioRichiesta>('dettaglio_richiesta', { p_id: id });
  const { aggiorna } = useSessione();
  const dopo = () => { void ricarica(); void aggiorna(); };
  if (caricamento && !dati) return <Caricamento />;
  if (errore || !dati) return <ErroreCaricamento messaggio={errore?.message ?? 'Richiesta non trovata.'} onRiprova={ricarica} />;
  return <Pagina key={dati.richiesta.id} d={dati} sezione={sezione} registra={params.has('registra')} onCambiata={dopo} />;
}

function Pagina({ d, sezione, registra, onCambiata }: { d: DettaglioRichiesta; sezione: string | null; registra: boolean; onCambiata: () => void }) {
  const r = d.richiesta; const naviga = useNavigate(); const toast = useToast();
  const [apertoMsg, setApertoMsg] = useState(sezione === 'messaggi');
  const [apertoPv, setApertoPv] = useState(sezione === 'preventivo');
  const [apertoNote, setApertoNote] = useState(false);
  const [apertoCron, setApertoCron] = useState(false);
  const [elimina, setElimina] = useState(false);
  const [ricevuta, setRicevuta] = useState(false);
  const [pagamento, setPagamento] = useState(registra && !!d.da_incassare);
  const az = useAzione();
  const { apri, finestra } = useApriAllegato();
  const pagRef = useRef<HTMLElement>(null);
  useEffect(() => { if (sezione === 'pagamento') pagRef.current?.scrollIntoView({ block: 'center' }); }, [sezione]);

  async function azione(fn: string) {
    const x = await az.esegui(fn, { p_id: r.id });
    if (!x) return;
    if (fn === 'elimina_richiesta') { await togliFile(x.file_tolti); naviga(`/progetti/${d.progetto.id}?tab=richieste`, { state: { toast: x.messaggio } }); return; }
    toast(x.messaggio); onCambiata();
  }

  return (
    <>
      <Percorso voci={[{ label: 'Clienti', a: '/clienti' }, { label: d.cliente.nome, a: `/clienti/${d.cliente.id}` }, { label: d.progetto.nome, a: `/progetti/${d.progetto.id}?tab=richieste` }, { label: 'Richiesta' }]} />
      {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
      <AvvisoRegola testo={az.errore} />
      {r.stato === 'ritirata' && !r.archiviata_il && (
        <div role="status" className="avviso info" style={{ alignItems: 'center', padding: '12px 16px' }}><IconaLucchetto stroke="#6A6E75" />
          <span><strong>Sola lettura.</strong> Il cliente ha ritirato questa richiesta: non puoi cambiarne lo stato né scrivere messaggi.</span></div>
      )}
      {r.archiviata_il && (
        <div role="status" className="avviso info" style={{ flexWrap: 'wrap', alignItems: 'center', gap: '10px 16px', padding: '12px 16px' }}>
          <IconaLucchetto stroke="#6A6E75" />
          <span style={{ flex: '1 1 300px' }}><strong>In archivio dal {data(r.archiviata_il)}.</strong> Non compare tra le richieste attive, ma il cliente la vede ancora. {d.permessi.motivo_non_eliminabile ? d.permessi.motivo_non_eliminabile + ' ' : ''}Per cambiarne lo stato o scrivere al cliente, ripristinala.</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" className="btn stretto" disabled={az.occupato} onClick={() => void azione('ripristina_richiesta')}>Ripristina</button>
            {d.permessi.eliminabile && <button type="button" className="btn stretto pericolo-leggero" disabled={az.occupato} onClick={() => setElimina(true)}>Elimina</button>}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <article style={{ flex: '999 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
            <h1 className="h1 medio">{r.titolo}</h1>
            <StatoBadge stato={r.stato} /><TagTipo tipo={r.tipo} /><TagGaranzia g={d.garanzia} />
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--tenue)' }}>Aperta da {r.autore_nome} il {data(r.aperta_il)} · {d.progetto.nome}</p>
          <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{r.testo}</p>
          {d.risolta && (
            <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 6px', fontSize: 14, color: 'var(--ok-testo)' }}>
              <IconaSpunta size={16} /><span>Inclusa nella novità</span><Link to={`/novita/${d.risolta.id}`} className="link-utile" style={{ minHeight: 0 }}>{d.risolta.titolo}</Link><span>del {data(d.risolta.pubblicata_il)}</span>
            </p>
          )}
          {d.allegati.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--testo-2)' }}>Allegati</span>
              <ElencoAllegati allegati={d.allegati} onApri={(f) => void apri(f)} />
            </div>
          )}
        </article>
        <Gestione d={d} onCambiata={onCambiata} onArchivia={() => void azione('archivia_richiesta')} occupato={az.occupato} />
      </div>

      <SezioneMessaggi d={d} aperto={apertoMsg} onCambia={setApertoMsg} onInviato={onCambiata} />
      <SezionePreventivo d={d} aperto={apertoPv} onCambia={setApertoPv} onCambiata={onCambiata} />

      {d.preventivo_accettato && (
        <section ref={pagRef} aria-label="Pagamento" className="sez">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', minHeight: 56, padding: '12px 0' }}>
            <h2 className="h2 grande" style={{ flexShrink: 0 }}>Pagamento</h2>
            {d.da_incassare && <span className="segnale">Da incassare</span>}
            <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 14, color: 'var(--tenue)' }}>{rigaPagamento(d)}</span>
            {d.da_incassare && <button type="button" className="btn stretto primario" onClick={() => setPagamento(true)}>Segna come pagato</button>}
            {d.ricevuta && <button type="button" className="btn stretto" onClick={() => setRicevuta(true)}><IconaPdf size={16} />Vedi ricevuta</button>}
          </div>
        </section>
      )}

      <NoteInterne id="pan-note-req" ambito="richiesta" rif={r.id} note={d.note ?? []} aperto={apertoNote} onCambia={setApertoNote} onCambiate={onCambiata}
        segnaposto="Es. accordi a voce, dettagli tecnici, cosa chiedere al cliente…" />
      <SezioneCronologia eventi={d.cronologia} admin aperto={apertoCron} onCambia={setApertoCron} />

      {elimina && <ConfermaElimina titolo={r.titolo} incluse={d.risolta ? [d.risolta.titolo] : []} onChiudi={() => setElimina(false)} onConferma={() => { setElimina(false); void azione('elimina_richiesta'); }} />}
      {ricevuta && d.ricevuta && <FinestraRicevuta d={d.ricevuta} richiestaId={r.id} onChiudi={() => setRicevuta(false)} />}
      {pagamento && <FinestraPagamento d={d} onChiudi={() => setPagamento(false)} onFatto={() => { setPagamento(false); onCambiata(); }} />}
      {finestra}
    </>
  );
}

function Gestione({ d, onCambiata, onArchivia, occupato }: { d: DettaglioRichiesta; onCambiata: () => void; onArchivia: () => void; occupato: boolean }) {
  const [stato, setStato] = useState(d.richiesta.stato);
  const [tipo, setTipo] = useState(d.richiesta.tipo);
  const az = useAzione(); const toast = useToast();
  const bloccata = !d.permessi.admin_modificabile;
  async function salva() {
    const x = await az.esegui('aggiorna_richiesta', { p_id: d.richiesta.id, p_stato: stato, p_tipo: tipo });
    if (x) { toast(x.messaggio); onCambiata(); }
  }
  return (
    <section aria-labelledby="sez-gestione" className="sez" style={{ flex: '1 1 300px', minWidth: 0, paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 id="sez-gestione" className="h2">Gestione</h2>
      <div className="campo"><label htmlFor="ad-tipo">Tipo</label>
        <select id="ad-tipo" className="input" value={tipo} disabled={bloccata} onChange={(e) => setTipo(e.target.value)}><option value="errore">Errore</option><option value="funzione">Nuova funzione</option></select></div>
      <div className="campo"><label htmlFor="ad-stato">Stato</label>
        <select id="ad-stato" className="input" value={stato} disabled={bloccata} onChange={(e) => setStato(e.target.value)}>
          <option value="nuova">Nuova</option><option value="accettata">Accettata</option><option value="in_lavorazione">In lavorazione</option>
          <option value="fatta">Fatta</option><option value="rifiutata">Rifiutata</option><option value="ritirata" disabled>Ritirata (solo dal cliente)</option>
        </select></div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--tenue)' }}>Per rispondere al cliente usa i messaggi qui sotto.</p>
      {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
      <AvvisoRegola testo={az.errore} />
      {!bloccata && <button type="button" className="btn primario" disabled={az.occupato} onClick={() => void salva()}>{az.occupato ? 'Salvataggio…' : 'Salva stato'}</button>}
      {d.permessi.puo_archiviare && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--linea-2)', paddingTop: 12 }}>
          <button type="button" className="btn" disabled={occupato} onClick={onArchivia}>Archivia richiesta</button>
          <span style={{ fontSize: 13, color: 'var(--tenue)' }}>La togli dall’elenco delle attive. Il cliente la vede ancora.</span>
        </div>
      )}
    </section>
  );
}

// ── Preventivo ───────────────────────────────────────────────
type Bozza = { tipo: 'occasionale' | 'normale'; ritenuta: boolean; iva: string; tariffa: string; sconto: string; consegna: string; validita: string; note: string;
  voci: { k: number; descrizione: string; ore: string }[]; spese: { k: number; descrizione: string; importo: string }[] };
let chiave = 0;
const daDati = (x: DatiPv): Bozza => ({
  tipo: x.tipo, ritenuta: x.ritenuta, iva: String(Number(x.iva)), tariffa: String(x.tariffa ?? ''), sconto: String(x.sconto ?? ''), consegna: String(x.consegna ?? ''),
  validita: String(x.validita ?? ''), note: x.note ?? '',
  voci: x.voci.map((v) => ({ k: ++chiave, descrizione: v.descrizione, ore: v.ore === '' ? '' : String(v.ore).replace('.', ',') })),
  spese: x.spese.map((s) => ({ k: ++chiave, descrizione: s.descrizione, importo: String(s.importo).replace('.', ',') })),
});
const perRpc = (b: Bozza) => ({ ...b, voci: b.voci.map(({ descrizione, ore }) => ({ descrizione, ore })), spese: b.spese.map(({ descrizione, importo }) => ({ descrizione, importo })) });

function SezionePreventivo({ d, aperto, onCambia, onCambiata }: { d: DettaglioRichiesta; aperto: boolean; onCambia: (v: boolean) => void; onCambiata: () => void }) {
  const corrente = d.bozza ?? d.inviato;
  const [bozza, setBozza] = useState<Bozza | null>(d.bozza ? daDati(d.bozza.dati) : null);
  const [pdf, setPdf] = useState<string | null>(null);
  const [conferma, setConferma] = useState(false);
  const az = useAzione(); const toast = useToast();
  const p = d.permessi;

  async function crea() {
    const x = await az.esegui<DatiPv>('preventivo_predefinito', { p_richiesta: d.richiesta.id });
    if (x) { setBozza(daDati(x)); onCambia(true); }
  }
  async function salva(silenzioso = false) {
    if (!bozza) return null;
    const x = await az.esegui('salva_bozza_preventivo', { p_richiesta: d.richiesta.id, p_dati: perRpc(bozza) });
    if (x && !silenzioso) { toast(x.messaggio); onCambiata(); }
    return x;
  }
  async function invia() {
    setConferma(false);
    if (!(await salva(true))) return;
    const x = await az.esegui('invia_preventivo', { p_richiesta: d.richiesta.id });
    if (x) { toast(x.messaggio); setBozza(null); onCambiata(); }
  }
  async function nuovaVersione() {
    const x = await az.esegui('nuova_versione_preventivo', { p_richiesta: d.richiesta.id });
    if (x) { toast(x.messaggio); onCambiata(); }
  }
  async function anteprimaPdf() {
    if (bozza) { const x = await salva(true); if (!x?.id) return; setPdf(x.id as string); onCambiata(); }
    else if (corrente) setPdf(corrente.id);
  }

  // Senza preventivo
  if (!corrente && !bozza) {
    return (
      <section aria-label="Preventivo" className="sez">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', minHeight: 56, padding: '12px 0' }}>
          <h2 className="h2 grande" style={{ flexShrink: 0 }}>Preventivo</h2>
          <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 14, color: 'var(--tenue)' }}>
            {!p.puo_lavorare_pv ? 'Nessun preventivo' : d.garanzia === 'si' ? 'Errore in garanzia: di solito non serve un preventivo' : 'Nessun preventivo: il cliente lo vede solo quando lo invii'}
          </span>
          {p.puo_lavorare_pv && <button type="button" className="btn stretto" disabled={az.occupato} onClick={() => void crea()}><IconaPiu />Crea preventivo</button>}
        </div>
        <AvvisoRegola testo={az.errore} />
      </section>
    );
  }

  const inModifica = !!bozza && p.puo_lavorare_pv;
  const totale = (x: typeof corrente) => (x ? (x.tipo === 'occasionale' ? 'Netto ' : 'Totale ') + eur(x.vista.calcolo.totale) : '');
  const riassunto = corrente
    ? `${totale(corrente)} · versione ${corrente.versione}${corrente.stato === 'inviato' ? ` · inviato il ${data(corrente.inviato_il)}` : d.inviato ? ` · il cliente vede ancora la versione ${d.inviato.versione}` : ' · non ancora inviato'}`
    : 'Nuova bozza · non ancora salvata';

  return (
    <section aria-label="Preventivo" className="sez">
      <h2 className="h2" style={{ margin: 0 }}>
        <button type="button" className="apribile" aria-expanded={aperto} aria-controls="pan-pv" onClick={() => onCambia(!aperto)}>
          <span style={{ flexShrink: 0 }}>Preventivo</span>
          <StatoBadge stato={corrente ? corrente.stato_effettivo : 'bozza'} />
          <span className="riassunto">{riassunto}</span>
          <span aria-hidden="true" className={`freccia ${aperto ? 'aperta' : ''}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg></span>
        </button>
      </h2>
      {aperto && (
        <div id="pan-pv" className="pannello" style={{ gap: 18 }}>
          {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
          {inModifica && bozza ? (
            <EditorPreventivo d={d} bozza={bozza} setBozza={setBozza} errore={az.errore} occupato={az.occupato}
              onPdf={() => void anteprimaPdf()} onSalva={() => void salva()} onInvia={() => {
                if (!(Number(bozza.tariffa.replace(',', '.')) > 0)) { az.setErrore('Inserisci la tariffa oraria.'); return; }
                if (!bozza.voci.some((v) => v.descrizione.trim() && Number(v.ore.replace(',', '.')) > 0)) { az.setErrore('Aggiungi almeno un’attività con descrizione e ore.'); return; }
                az.pulisci(); setConferma(true);
              }} />
          ) : corrente && (
            <>
              <BoxEsito pv={corrente} lato="admin" ioId={d.io.id} />
              <PreventivoRiepilogo dati={corrente.vista} />
              <AvvisoRegola testo={az.errore} />
              <div className="azioni fine">
                <button type="button" className="btn piccolo" onClick={() => setPdf(corrente.id)}><IconaPdf size={16} />Scarica PDF</button>
                {p.puo_lavorare_pv && <button type="button" className="btn piccolo" disabled={az.occupato} onClick={() => void nuovaVersione()}>Crea nuova versione</button>}
              </div>
            </>
          )}
        </div>
      )}
      {pdf && <FinestraPdf preventivoId={pdf} onChiudi={() => setPdf(null)} />}
      {conferma && bozza && (
        <FinestraInvio d={d} bozza={bozza} onChiudi={() => setConferma(false)} onConferma={() => void invia()} />
      )}
    </section>
  );
}

function FinestraInvio({ d, bozza, onChiudi, onConferma }: { d: DettaglioRichiesta; bozza: Bozza; onChiudi: () => void; onConferma: () => void }) {
  const [totale, setTotale] = useState<string>('');
  useEffect(() => { rpc<{ totale: string }>('anteprima_preventivo', { p_dati: perRpc(bozza) }).then((x) => setTotale(x.totale)).catch(() => setTotale('')); }, [bozza]);
  return (
    <Finestra titolo="Inviare il preventivo?" onChiudi={onChiudi}>
      <p>Il cliente lo vedrà nella richiesta “{d.richiesta.titolo}”{totale ? `, con un totale di ${totale}` : ''}.</p>
      {d.inviato && <p style={{ fontSize: 14, color: 'var(--tenue)' }}>Sostituisce la versione che il cliente vede adesso.</p>}
      {d.manca_nel_pdf && <p role="note" className="avviso attenzione" style={{ margin: 0 }}>{d.manca_nel_pdf} Puoi inviarlo così o aggiungere i dati prima nella pagina “I tuoi dati”.</p>}
      <div className="azioni fine"><button type="button" className="btn" onClick={onChiudi}>Annulla</button><button type="button" className="btn primario" onClick={onConferma}>Invia preventivo</button></div>
    </Finestra>
  );
}

const testaGriglia: React.CSSProperties = { display: 'grid', gap: 8, padding: '8px 10px', background: 'var(--grigio-sfondo)', fontSize: 12, fontWeight: 600, color: 'var(--tenue)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const rigaGriglia: React.CSSProperties = { display: 'grid', gap: 8, alignItems: 'center', padding: '6px 10px', borderTop: '1px solid var(--linea-2)' };
const inputCella: React.CSSProperties = { minHeight: 40, padding: '6px 10px' };

function EditorPreventivo({ d, bozza: b, setBozza, errore, occupato, onPdf, onSalva, onInvia }: {
  d: DettaglioRichiesta; bozza: Bozza; setBozza: (b: Bozza) => void; errore: string | null; occupato: boolean; onPdf: () => void; onSalva: () => void; onInvia: () => void;
}) {
  const [calc, setCalc] = useState<{ totali: Riga[]; importi: string[]; calcolo: { iva_p: number } } | null>(null);
  const set = (x: Partial<Bozza>) => setBozza({ ...b, ...x });
  // I totali li calcola il database, mentre scrivi
  useEffect(() => {
    const t = window.setTimeout(() => { rpc<typeof calc>('anteprima_preventivo', { p_dati: perRpc(b) }).then(setCalc).catch(() => {}); }, 250);
    return () => window.clearTimeout(t);
  }, [b]);
  const occ = b.tipo === 'occasionale';
  return (
    <>
      {d.bozza && d.inviato && <div role="note" className="avviso info">Il cliente vede ancora la versione {d.inviato.versione} inviata il {data(d.inviato.inviato_il)}, con un totale di {eur(d.inviato.vista.calcolo.totale)}.</div>}
      <BoxEsito pv={d.inviato} lato="admin" ioId={d.io.id} />
      <fieldset style={{ border: '1px solid var(--bordo-card)', borderRadius: 8, margin: 0, padding: '8px 14px 10px', display: 'flex', flexWrap: 'wrap', gap: '0 20px' }}>
        <legend style={{ fontSize: 14, fontWeight: 600, padding: '0 6px' }}>Tipo di preventivo</legend>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}><input type="radio" name="pv-tipo" checked={occ} onChange={() => set({ tipo: 'occasionale' })} style={{ width: 18, height: 18, margin: 0 }} />Prestazione occasionale <span style={{ color: 'var(--tenue)', fontSize: 13 }}>(senza Partita IVA)</span></label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}><input type="radio" name="pv-tipo" checked={!occ} onChange={() => set({ tipo: 'normale' })} style={{ width: 18, height: 18, margin: 0 }} />Normale <span style={{ color: 'var(--tenue)', fontSize: 13 }}>(con Partita IVA)</span></label>
      </fieldset>
      <div className="campi">
        <div className="campo" style={{ flex: '1 1 150px' }}><label htmlFor="pv-tariffa">Tariffa oraria (€)</label><input id="pv-tariffa" className="input" inputMode="decimal" value={b.tariffa} onChange={(e) => set({ tariffa: e.target.value })} /></div>
        <div className="campo" style={{ flex: '1 1 150px' }}><label htmlFor="pv-sconto">Sconto sul lavoro (%)</label><input id="pv-sconto" className="input" inputMode="decimal" value={b.sconto} onChange={(e) => set({ sconto: e.target.value })} /></div>
        {!occ && <div className="campo" style={{ flex: '1 1 200px' }}><label htmlFor="pv-iva">IVA</label><select id="pv-iva" className="input" value={b.iva} onChange={(e) => set({ iva: e.target.value })}><option value="22">22%</option><option value="0">Senza IVA (regime forfettario)</option></select></div>}
        {occ && (
          <div className="campo" style={{ flex: '1 1 260px' }}><span className="etichetta">Ritenuta d’acconto</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}><input type="checkbox" checked={b.ritenuta} onChange={(e) => set({ ritenuta: e.target.checked })} style={{ width: 18, height: 18, margin: 0 }} />Il cliente è un’azienda o un professionista (applica il 20%)</label></div>
        )}
        <div className="campo" style={{ flex: '1 1 150px' }}><label htmlFor="pv-consegna">Consegna (giorni lavorativi)</label><input id="pv-consegna" className="input" inputMode="numeric" value={b.consegna} onChange={(e) => set({ consegna: e.target.value })} /></div>
        <div className="campo" style={{ flex: '1 1 150px' }}><label htmlFor="pv-validita">Validità offerta (giorni)</label><input id="pv-validita" className="input" inputMode="numeric" value={b.validita} onChange={(e) => set({ validita: e.target.value })} /></div>
      </div>
      {occ && <p style={{ margin: '-6px 0 0', fontSize: 13, color: 'var(--tenue)' }}>Senza IVA. Marca da bollo da 2 € se il compenso supera 77,47 €. Oltre 5.000 € di compensi occasionali nell’anno scattano i contributi INPS: quest’anno hai {eur(d.occasionali_accettati_anno ?? 0)} di preventivi occasionali accettati.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Attività</h3>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 540, border: '1px solid var(--bordo-card)', borderRadius: 8, overflow: 'hidden' }}>
            <div aria-hidden="true" style={{ ...testaGriglia, gridTemplateColumns: 'minmax(0, 1fr) 96px 120px 44px' }}><span>Descrizione</span><span>Ore</span><span className="destra">Importo</span><span /></div>
            {b.voci.map((v, i) => (
              <div key={v.k} style={{ ...rigaGriglia, gridTemplateColumns: 'minmax(0, 1fr) 96px 120px 44px' }}>
                <input className="input" style={inputCella} aria-label={`Descrizione attività ${i + 1}`} value={v.descrizione} placeholder="Es. Schermata di esportazione"
                  onChange={(e) => set({ voci: b.voci.map((x) => (x.k === v.k ? { ...x, descrizione: e.target.value } : x)) })} />
                <input className="input" style={inputCella} inputMode="decimal" aria-label={`Ore attività ${i + 1}`} value={v.ore}
                  onChange={(e) => set({ voci: b.voci.map((x) => (x.k === v.k ? { ...x, ore: e.target.value } : x)) })} />
                <span className="destra numeri">{calc?.importi[i] ?? ''}</span>
                <button type="button" className="icona-btn" aria-label={`Rimuovi attività ${i + 1}`} onClick={() => set({ voci: b.voci.filter((x) => x.k !== v.k) })} style={{ fontSize: 18 }}>×</button>
              </div>
            ))}
          </div>
        </div>
        <button type="button" className="btn stretto" style={{ alignSelf: 'flex-start' }} onClick={() => set({ voci: [...b.voci, { k: ++chiave, descrizione: '', ore: '' }] })}><IconaPiu />Aggiungi attività</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Spese</h3>
        {b.spese.length ? (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: 420, border: '1px solid var(--bordo-card)', borderRadius: 8, overflow: 'hidden' }}>
              <div aria-hidden="true" style={{ ...testaGriglia, gridTemplateColumns: 'minmax(0, 1fr) 140px 44px' }}><span>Descrizione</span><span>Importo (€)</span><span /></div>
              {b.spese.map((s, i) => (
                <div key={s.k} style={{ ...rigaGriglia, gridTemplateColumns: 'minmax(0, 1fr) 140px 44px' }}>
                  <input className="input" style={inputCella} aria-label={`Descrizione spesa ${i + 1}`} value={s.descrizione} placeholder="Es. Licenza, hosting, servizio esterno"
                    onChange={(e) => set({ spese: b.spese.map((x) => (x.k === s.k ? { ...x, descrizione: e.target.value } : x)) })} />
                  <input className="input" style={inputCella} inputMode="decimal" aria-label={`Importo spesa ${i + 1}`} value={s.importo}
                    onChange={(e) => set({ spese: b.spese.map((x) => (x.k === s.k ? { ...x, importo: e.target.value } : x)) })} />
                  <button type="button" className="icona-btn" aria-label={`Rimuovi spesa ${i + 1}`} onClick={() => set({ spese: b.spese.filter((x) => x.k !== s.k) })} style={{ fontSize: 18 }}>×</button>
                </div>
              ))}
            </div>
          </div>
        ) : <span style={{ fontSize: 14, color: 'var(--tenue)' }}>Nessuna spesa. Aggiungi licenze, hosting o servizi esterni da rifatturare al cliente.</span>}
        <button type="button" className="btn stretto" style={{ alignSelf: 'flex-start' }} onClick={() => set({ spese: [...b.spese, { k: ++chiave, descrizione: '', importo: '' }] })}><IconaPiu />Aggiungi spesa</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <div className="campo" style={{ flex: '999 1 320px' }}>
          <label htmlFor="pv-note">Note per il cliente</label>
          <textarea id="pv-note" className="input" rows={5} value={b.note} onChange={(e) => set({ note: e.target.value })} placeholder="Condizioni, cosa è escluso, come verrà consegnato…" />
        </div>
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', background: 'var(--grigio-sfondo)', border: '1px solid var(--bordo-card)', borderRadius: 8, fontSize: 14 }}>
          <span className="etichetta-sez">Riepilogo</span>
          {calc && <Totali righe={calc.totali} />}
          {calc && !occ && Number(calc.calcolo.iva_p) === 0 && <span style={{ fontSize: 12, color: 'var(--tenue)', textAlign: 'right' }}>IVA non applicata</span>}
        </div>
      </div>
      <AvvisoRegola testo={errore} />
      <div className="azioni fine" style={{ borderTop: '1px solid var(--linea-2)', paddingTop: 16 }}>
        <button type="button" className="btn piccolo" disabled={occupato} onClick={onPdf}><IconaPdf size={16} />Anteprima PDF</button>
        <button type="button" className="btn piccolo" disabled={occupato} onClick={onSalva}>{occupato ? 'Salvataggio…' : 'Salva bozza'}</button>
        <button type="button" className="btn piccolo primario" disabled={occupato} onClick={onInvia}>Invia al cliente</button>
      </div>
    </>
  );
}

// ── Pagamento ────────────────────────────────────────────────
type InfoPagamento = { occasionale: boolean; numero_preventivo: string; titolo: string; righe: Riga[]; note: string[]; oltre_soglia: boolean; avviso_inps: string | null;
  manca_fiscale_cliente: boolean; cliente_id: string; cliente_nome: string; manca_prestatore: boolean };

function FinestraPagamento({ d, onChiudi, onFatto }: { d: DettaglioRichiesta; onChiudi: () => void; onFatto: () => void }) {
  const [il, setIl] = useState(oggiIso());
  const [metodo, setMetodo] = useState('bonifico');
  const [fattura, setFattura] = useState('');
  const { dati: info } = useDati<InfoPagamento>('info_pagamento', { p_richiesta: d.richiesta.id, p_il: il || null });
  const az = useAzione(); const toast = useToast(); const naviga = useNavigate();
  const bloccato = !!info && (info.manca_fiscale_cliente || info.manca_prestatore);
  async function conferma() {
    const x = await az.esegui('registra_pagamento', { p_richiesta: d.richiesta.id, p_il: il || null, p_metodo: metodo, p_fattura: fattura });
    if (x) { toast(x.messaggio); onFatto(); }
  }
  return (
    <Finestra titolo="Registrare il pagamento?" onChiudi={onChiudi} larghezza="media">
      <p>“{d.richiesta.titolo}” · preventivo n. {info?.numero_preventivo ?? d.preventivo_accettato?.numero}</p>
      {info && <div style={{ padding: '12px 14px', background: 'var(--grigio-sfondo)', border: '1px solid var(--bordo-card)', borderRadius: 8, fontSize: 14 }}><Totali righe={info.righe} /></div>}
      <div className="campi">
        <div className="campo" style={{ flex: '1 1 180px' }}><label htmlFor="pag-data">Data del pagamento</label><input id="pag-data" type="date" className="input" max={oggiIso()} value={il} onChange={(e) => { setIl(e.target.value); az.pulisci(); }} /></div>
        <div className="campo" style={{ flex: '1 1 180px' }}><label htmlFor="pag-metodo">Come ha pagato</label><select id="pag-metodo" className="input" value={metodo} onChange={(e) => setMetodo(e.target.value)}><option value="bonifico">Bonifico</option><option value="contanti">Contanti</option><option value="altro">Altro</option></select></div>
      </div>
      {info && !info.occasionale && (
        <>
          <div className="campo"><label htmlFor="pag-fattura">Numero della fattura (facoltativo)</label><input id="pag-fattura" className="input" value={fattura} onChange={(e) => setFattura(e.target.value)} /></div>
          <p style={{ fontSize: 13, color: 'var(--tenue)' }}>Per un preventivo normale la fattura la emetti con il tuo programma di fatturazione: qui registri solo il pagamento.</p>
        </>
      )}
      {info?.occasionale && <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, color: 'var(--testo-2)' }}>{info.note.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      {info?.manca_prestatore && (
        <div role="alert" className="avviso attenzione" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <span>Mancano i tuoi dati: per la ricevuta servono il tuo indirizzo e il tuo codice fiscale.</span>
          <button type="button" className="btn stretto" onClick={() => naviga(`/i-tuoi-dati?ritorno=${d.richiesta.id}`)}>Completa i tuoi dati</button>
        </div>
      )}
      {info?.manca_fiscale_cliente && (
        <div role="alert" className="avviso attenzione" style={{ flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <span>Mancano i dati fiscali di {info.cliente_nome}: per la ricevuta servono l’indirizzo e la partita IVA o il codice fiscale.</span>
          <button type="button" className="btn stretto" onClick={() => naviga(`/clienti/${info.cliente_id}?fiscali=1&ritorno=${d.richiesta.id}`)}>Completa i dati del cliente</button>
        </div>
      )}
      {info?.oltre_soglia && <div role="alert" className="avviso errore">{info.avviso_inps}</div>}
      {az.erroreRete && <ErroreRete />}
      <AvvisoRegola testo={az.errore} />
      <div className="azioni fine">
        <button type="button" className="btn" onClick={onChiudi}>Annulla</button>
        <button type="button" className="btn primario" disabled={bloccato || az.occupato} aria-disabled={bloccato} onClick={() => void conferma()}>
          {az.occupato ? 'Salvataggio…' : info?.occasionale ? 'Registra e crea la ricevuta' : 'Registra il pagamento'}
        </button>
      </div>
    </Finestra>
  );
}

