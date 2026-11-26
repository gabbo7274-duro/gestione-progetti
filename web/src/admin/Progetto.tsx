// Admin · progetto: garanzia, schede Novità / Richieste / Scadenze / Link.
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAzione, useDati } from '../lib/api';
import { data, eur, plur } from '../lib/formato';
import { togliFile } from '../lib/file';
import { AvvisoRegola, AvvisoSolaLettura, Caricamento, ErroreCaricamento, ErroreRete, Finestra, StatoBadge, TagTipo, Vuoto, NOMI_STATO } from '../componenti/Base';
import { IconaAvanti, IconaEsterno, IconaLucchetto, IconaMatita, IconaPiu, IconaPosta, IconaRinnova, IconaScudo } from '../componenti/Icone';
import { Percorso, TitoloPagina } from '../comune/Layout';
import { useToast } from '../comune/Toast';
import { useSessione } from '../comune/Sessione';
import { ModificaProgetto } from './Clienti';

export type RichiestaRiga = {
  id: string; titolo: string; stato: string; tipo: string; aperta_il: string; autore_id: string; autore_nome: string; archiviata_il: string | null;
  n_messaggi: number; da_rispondere: boolean; pv_valore: number | null; pv_stato: string | null; pv_bozza: boolean; da_approvare: boolean;
  archiviabile: boolean; eliminabile: boolean; ultimo: { autore_id: string; autore_nome: string; admin: boolean; testo: string; scritto_il: string } | null;
};
export type Scadenza = { id: string; tipo: string; nome: string; scade: string; costo: number | null; carico: 'cliente' | 'admin'; visibile: boolean; avvisa: boolean;
  avvisato_il: string | null; giorni: number; avviso_automatico_il: string };
export type LinkUtile = { id: string; tipo: string; etichetta: string; url: string; visibile: boolean };
export type DettaglioProgetto = {
  progetto: { id: string; nome: string; descrizione: string; archiviato: boolean; cliente_id: string; cliente_nome: string; garanzia_fino: string | null; garanzia_attiva: boolean };
  novita: { id: string; titolo: string; stato: 'bozza' | 'pubblicata'; pubblicata_il: string | null; testo: string; incluse: { id: string; titolo: string }[] }[];
  richieste: RichiestaRiga[]; scadenze: Scadenza[]; link: LinkUtile[];
};

export const TIPI_SCAD: Record<string, string> = { dominio: 'Dominio', hosting: 'Hosting', apple: 'Apple Developer', google: 'Google Play', altro: 'Altro' };
export const TIPI_LINK: Record<string, string> = { app: 'App', ios: 'App Store', android: 'Google Play', manuale: 'Manuale', altro: 'Altro' };
const AIUTO_SCAD: Record<string, string> = {
  apple: 'Apple Developer Program: 99 $ l’anno. Si rinnova dal sito Apple Developer, a partire da 30 giorni prima della scadenza.',
  google: 'L’account Google Play si paga una volta sola (25 $), non ogni anno. Ogni anno però, entro il 31 agosto, gli aggiornamenti dell’app devono usare il livello API richiesto da Google.',
};
const SEGNAPOSTO_SCAD: Record<string, string> = { dominio: 'Es. ortofruttabellin.it su Aruba', hosting: 'Es. server delle API, piano annuale', apple: 'Es. account Apple Developer del cliente', google: 'Es. aggiornamento al livello API richiesto', altro: 'Es. certificato, licenza, servizio esterno' };
const STATI = ['nuova', 'accettata', 'in_lavorazione', 'fatta', 'rifiutata', 'ritirata'];

export const testoGaranzia = (g: string | null, attiva: boolean) => (!g ? 'Nessuna garanzia impostata' : attiva ? `In garanzia fino al ${data(g)}` : `Garanzia scaduta il ${data(g)}`);
export const hostDi = (u: string) => u.replace(/^https?:\/\//, '').split('/')[0];
export const segnaleScadenza = (g: number) => (g < 0 ? `Scaduta da ${plur(-g, 'giorno', 'giorni')}` : g === 0 ? 'Scade oggi' : `Scade tra ${plur(g, 'giorno', 'giorni')}`);

type Scheda = 'novita' | 'richieste' | 'scadenze' | 'link';

export function ProgettoAdmin() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const scheda = (params.get('tab') as Scheda) || 'novita';
  const vaiScheda = (t: Scheda) => setParams({ tab: t }, { replace: true });
  const { dati, errore, caricamento, ricarica } = useDati<DettaglioProgetto>('dettaglio_progetto', { p_id: id });
  const [modifica, setModifica] = useState(false);

  if (caricamento && !dati) return <Caricamento />;
  if (errore || !dati) return <ErroreCaricamento messaggio={errore?.message ?? 'Progetto non trovato.'} onRiprova={ricarica} />;
  const p = dati.progetto;
  const attive = dati.richieste.filter((r) => !r.archiviata_il);

  return (
    <>
      <Percorso voci={[{ label: 'Clienti', a: '/clienti' }, { label: p.cliente_nome, a: `/clienti/${p.cliente_id}` }, { label: p.nome }]} />
      <TitoloPagina titolo={p.nome} sotto={p.descrizione} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', fontSize: 14 }}>
        <Garanzia progetto={p} onCambiata={ricarica} />
        <span aria-hidden="true" style={{ color: 'var(--spento)' }}>·</span>
        <button type="button" className="link" onClick={() => setModifica(true)}>Modifica progetto</button>
      </div>
      {p.archiviato && <AvvisoSolaLettura>Progetto archiviato: il cliente lo vede in sola lettura e non può aprire nuove richieste.</AvvisoSolaLettura>}
      <div role="tablist" aria-label="Sezioni del progetto" className="schede" style={{ gap: 22, overflowX: 'auto' }}>
        {([['novita', 'Novità', dati.novita.length], ['richieste', 'Richieste', attive.length], ['scadenze', 'Scadenze', dati.scadenze.length], ['link', 'Link', dati.link.length]] as const).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" className="scheda" aria-selected={scheda === k} onClick={() => vaiScheda(k)}>{l} · {n}</button>
        ))}
      </div>
      {scheda === 'novita' && <SchedaNovita d={dati} />}
      {scheda === 'richieste' && <SchedaRichieste d={dati} onCambiate={ricarica} />}
      {scheda === 'scadenze' && <SchedaScadenze d={dati} onCambiate={ricarica} />}
      {scheda === 'link' && <SchedaLink d={dati} onCambiate={ricarica} />}
      {modifica && <ModificaProgetto clienteId={p.cliente_id} progetto={p} onChiudi={() => setModifica(false)} onFatto={() => { setModifica(false); void ricarica(); }} />}
    </>
  );
}

function Garanzia({ progetto: p, onCambiata }: { progetto: DettaglioProgetto['progetto']; onCambiata: () => void }) {
  const [modifica, setModifica] = useState(false);
  const [val, setVal] = useState(p.garanzia_fino ?? '');
  const az = useAzione(); const toast = useToast();
  async function salva() {
    const r = await az.esegui('salva_garanzia', { p_progetto: p.id, p_fino: val || null });
    if (r) { toast(r.messaggio); setModifica(false); onCambiata(); }
  }
  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: p.garanzia_attiva ? 'var(--ok-testo)' : 'var(--tenue)' }}><IconaScudo />{testoGaranzia(p.garanzia_fino, p.garanzia_attiva)}</span>
      {!modifica ? <button type="button" className="link" onClick={() => { setVal(p.garanzia_fino ?? ''); setModifica(true); }}>Modifica</button> : (
        <>
          <label htmlFor="gar-data" style={{ fontWeight: 600 }}>Fine garanzia</label>
          <input id="gar-data" type="date" className="input" style={{ width: 'auto', minHeight: 40, padding: '6px 10px', fontSize: 14 }} value={val} onChange={(e) => setVal(e.target.value)} />
          <button type="button" className="btn stretto primario" disabled={az.occupato} onClick={() => void salva()}>Salva</button>
          <button type="button" className="link" onClick={() => setModifica(false)}>Annulla</button>
          <span style={{ fontSize: 12, color: 'var(--tenue)' }}>Lascia vuoto se il progetto non ha garanzia.</span>
          {(az.errore || az.erroreRete) && <span style={{ flexBasis: '100%' }}>{az.erroreRete ? <ErroreRete /> : <AvvisoRegola testo={az.errore} />}</span>}
        </>
      )}
    </>
  );
}

// ── Novità ───────────────────────────────────────────────────
function SchedaNovita({ d }: { d: DettaglioProgetto }) {
  const pubbl = d.novita.filter((n) => n.stato === 'pubblicata').length, bozze = d.novita.length - pubbl;
  const naviga = useNavigate();
  return (
    <>
      <div className="azioni tra">
        <span style={{ fontSize: 14, color: 'var(--tenue)' }}>{plur(pubbl, 'pubblicata', 'pubblicate')} · {plur(bozze, 'bozza', 'bozze')}</span>
        {!d.progetto.archiviato && <button type="button" className="btn primario" onClick={() => naviga(`/progetti/${d.progetto.id}/novita/nuova`)}><IconaPiu />Nuova novità</button>}
      </div>
      {d.novita.length === 0 ? <Vuoto icona titolo="Nessuna novità ancora" testo="Pubblica la prima novità per tenere aggiornato il cliente sul progetto." /> : (
        <ul className="elenco">
          {d.novita.map((n) => (
            <li key={n.id}>
              <Link to={`/novita/${n.id}`} className="riga">
                <span className="riga-testo">
                  <span className="riga-titolo">{n.titolo}</span>
                  <span className="riga-meta">{n.stato === 'pubblicata' ? `Pubblicata il ${data(n.pubblicata_il)}` : 'Bozza · non ancora pubblicata'}{n.incluse.length ? ' · ' + plur(n.incluse.length, 'richiesta inclusa', 'richieste incluse') : ''}</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><StatoBadge stato={n.stato} /><IconaAvanti className="chevron" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ── Richieste ────────────────────────────────────────────────
function metaRichiesta(r: RichiestaRiga) {
  return [
    `${r.autore_nome} · ${data(r.aperta_il)}`,
    r.n_messaggi ? plur(r.n_messaggi, 'messaggio', 'messaggi') : null,
    r.pv_stato ? `Preventivo ${eur(r.pv_valore)}, ${{ bozza: 'in bozza', inviato: 'in attesa di risposta', accettato: 'accettato', modifiche: 'modifiche richieste', rifiutato: 'rifiutato', scaduto: 'scaduto' }[r.pv_stato]}` : r.pv_bozza ? 'Preventivo in bozza' : null,
    r.archiviata_il ? `archiviata il ${data(r.archiviata_il)}` : null,
  ].filter(Boolean).join(' · ');
}

function SchedaRichieste({ d, onCambiate }: { d: DettaglioProgetto; onCambiate: () => void }) {
  const [filtro, setFiltro] = useState<string>('tutte');
  const [elimina, setElimina] = useState<RichiestaRiga | null>(null);
  const az = useAzione(); const toast = useToast(); const { aggiorna } = useSessione();
  const attive = d.richieste.filter((r) => !r.archiviata_il);
  const archivio = d.richieste.filter((r) => r.archiviata_il).sort((a, b) => (b.archiviata_il ?? '').localeCompare(a.archiviata_il ?? ''));
  const inArchivio = filtro === 'archivio';
  const elenco = inArchivio ? archivio : filtro === 'tutte' ? attive : attive.filter((r) => r.stato === filtro);

  async function azione(fn: string, rid: string) {
    const r = await az.esegui(fn, { p_id: rid });
    if (r) { toast(r.messaggio); await togliFile(r.file_tolti); onCambiate(); void aggiorna(); }
  }

  return (
    <>
      <div role="group" aria-label="Filtra le richieste" className="filtri" style={{ alignItems: 'center' }}>
        {['tutte', ...STATI].map((k) => (
          <button key={k} type="button" className="filtro" aria-pressed={filtro === k} onClick={() => setFiltro(k)}>
            {k === 'tutte' ? 'Tutte' : NOMI_STATO[k]} ({k === 'tutte' ? attive.length : attive.filter((r) => r.stato === k).length})
          </button>
        ))}
        <span aria-hidden="true" style={{ width: 1, height: 24, background: 'var(--bordo)', margin: '0 4px' }} />
        <button type="button" className="filtro" aria-pressed={inArchivio} onClick={() => setFiltro('archivio')}><IconaArchivio />Archivio ({archivio.length})</button>
      </div>
      {inArchivio && archivio.length > 0 && (
        <p style={{ margin: 0, fontSize: 14, color: 'var(--tenue)' }}>
          Queste richieste non compaiono più tra le attive, ma il cliente le vede ancora. Se il cliente scrive in una di queste, torna tra le attive.
          {archivio.some((r) => !r.eliminabile) ? ' Quelle con un preventivo accettato non si possono eliminare, perché contano nel riepilogo economico.' : ''}
        </p>
      )}
      {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
      <AvvisoRegola testo={az.errore} />
      {elenco.length === 0 ? (
        <Vuoto icona
          titolo={inArchivio ? 'L’archivio è vuoto' : filtro === 'tutte' ? 'Nessuna richiesta aperta' : `Nessuna richiesta “${NOMI_STATO[filtro]}”`}
          testo={inArchivio ? 'Archivia le richieste fatte, rifiutate o ritirate per toglierle dall’elenco delle attive.' : filtro === 'tutte' ? 'Le richieste dei referenti per questo progetto compariranno qui.' : 'Prova a scegliere un altro stato o “Tutte”.'} />
      ) : (
        <ul className="elenco">
          {elenco.map((r) => (
            <li key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 }}>
              <Link to={`/richieste/${r.id}`} className="riga" style={{ flex: '1 1 440px', minWidth: 0 }}>
                <span className="riga-testo"><span className="riga-titolo">{r.titolo}</span><span className="riga-meta">{metaRichiesta(r)}</span></span>
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 10px' }}>
                  <TagTipo tipo={r.tipo} />
                  {r.da_rispondere && <span className="segnale">Da rispondere</span>}
                  <StatoBadge stato={r.stato} />
                  <IconaAvanti className="chevron" />
                </span>
              </Link>
              {r.archiviabile && <button type="button" className="btn annulla" style={{ fontSize: 13, padding: '0 10px' }} aria-label={`Archivia “${r.titolo}”`} disabled={az.occupato} onClick={() => void azione('archivia_richiesta', r.id)}><IconaArchivio />Archivia</button>}
              {r.archiviata_il && (
                <span style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="btn annulla" style={{ fontSize: 13, padding: '0 10px' }} aria-label={`Ripristina “${r.titolo}”`} disabled={az.occupato} onClick={() => void azione('ripristina_richiesta', r.id)}><IconaRipristina />Ripristina</button>
                  {r.eliminabile
                    ? <button type="button" className="btn annulla" style={{ fontSize: 13, padding: '0 10px', color: 'var(--rosso)' }} aria-label={`Elimina “${r.titolo}”`} onClick={() => setElimina(r)}><IconaCestinoP />Elimina</button>
                    : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 10px', fontSize: 13, fontWeight: 600, color: 'var(--tenue)' }}><IconaLucchetto size={16} />Non eliminabile</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {elimina && (
        <ConfermaElimina titolo={elimina.titolo} incluse={d.novita.filter((n) => n.incluse.some((x) => x.id === elimina.id)).map((n) => n.titolo)}
          onChiudi={() => setElimina(null)} onConferma={async () => { const id = elimina.id; setElimina(null); await azione('elimina_richiesta', id); }} />
      )}
    </>
  );
}

export function ConfermaElimina({ titolo, incluse, onChiudi, onConferma }: { titolo: string; incluse: string[]; onChiudi: () => void; onConferma: () => void }) {
  return (
    <Finestra titolo="Eliminare la richiesta?" onChiudi={onChiudi}>
      <p>“{titolo}” verrà eliminata per sempre, con messaggi, allegati, note interne e preventivo. Nemmeno il cliente la vedrà più. Non si può annullare.</p>
      {incluse.length > 0 && <p style={{ fontSize: 14, color: 'var(--tenue)' }}>{incluse.length === 1 ? `La novità “${incluse[0]}” non la elencherà più tra le richieste incluse.` : `Le novità ${incluse.map((t) => `“${t}”`).join(', ')} non la elencheranno più tra le richieste incluse.`}</p>}
      <div className="azioni fine"><button type="button" className="btn" onClick={onChiudi}>Annulla</button><button type="button" className="btn pericolo" onClick={onConferma}>Elimina per sempre</button></div>
    </Finestra>
  );
}

const IconaArchivio = () => <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" /><path d="M10 13h4" /></svg>;
const IconaRipristina = () => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>;
const IconaCestinoP = () => <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V4h6v3" /></svg>;

// ── Scadenze ─────────────────────────────────────────────────
type FormScad = { id: string | null; tipo: string; nome: string; scade: string; costo: string; carico: 'cliente' | 'admin'; visibile: boolean; avvisa: boolean };

function SchedaScadenze({ d, onCambiate }: { d: DettaglioProgetto; onCambiate: () => void }) {
  const [f, setF] = useState<FormScad | null>(null);
  const az = useAzione(); const toast = useToast(); const { aggiorna } = useSessione();
  const apri = (x?: Scadenza) => { az.pulisci(); setF(x ? { id: x.id, tipo: x.tipo, nome: x.nome, scade: x.scade, costo: x.costo != null ? String(x.costo).replace('.', ',') : '', carico: x.carico, visibile: x.visibile, avvisa: x.avvisa }
    : { id: null, tipo: 'dominio', nome: '', scade: '', costo: '', carico: 'cliente', visibile: true, avvisa: true }); };
  const fatto = (r: { messaggio?: string } | null) => { if (r) { toast(r.messaggio); setF(null); onCambiate(); void aggiorna(); } };

  return (
    <>
      <div className="azioni tra">
        <span style={{ fontSize: 14, color: 'var(--tenue)' }}>{d.scadenze.length ? 'Rinnovi di dominio, hosting e account. Quelli entro 30 giorni li trovi anche in Da gestire.' : ''}</span>
        {!f && <button type="button" className="btn piccolo" onClick={() => apri()}><IconaPiu />Aggiungi scadenza</button>}
      </div>
      {f && (
        <div className="sez" style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2 grande">{f.id ? 'Modifica scadenza' : 'Nuova scadenza'}</h2>
          <div className="campi">
            <div className="campo"><label htmlFor="sf-tipo">Tipo</label>
              <select id="sf-tipo" className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                <option value="dominio">Dominio</option><option value="hosting">Hosting</option><option value="apple">Account Apple Developer</option><option value="google">Google Play</option><option value="altro">Altro</option>
              </select></div>
            <div className="campo" style={{ flex: '2 1 280px' }}><label htmlFor="sf-nome">Cosa scade</label><input id="sf-nome" className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder={SEGNAPOSTO_SCAD[f.tipo]} /></div>
          </div>
          {AIUTO_SCAD[f.tipo] && <p className="avviso nota" style={{ margin: 0 }}>{AIUTO_SCAD[f.tipo]}</p>}
          <div className="campi">
            <div className="campo"><label htmlFor="sf-data">Scade il</label><input id="sf-data" type="date" className="input" value={f.scade} onChange={(e) => setF({ ...f, scade: e.target.value })} /></div>
            <div className="campo"><label htmlFor="sf-costo">Costo all’anno (€)</label><input id="sf-costo" className="input" inputMode="decimal" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} placeholder="Facoltativo" /></div>
          </div>
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0 20px' }}>
            <legend style={{ fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 2 }}>Chi la paga</legend>
            {([['cliente', 'Il cliente'], ['admin', 'Tu']] as const).map(([v, l]) => (
              <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, cursor: 'pointer' }}>
                <input type="radio" name="sf-carico" checked={f.carico === v} onChange={() => setF({ ...f, carico: v })} style={{ width: 18, height: 18, margin: 0 }} />{l}
              </label>
            ))}
          </fieldset>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label className="spunta" style={{ alignItems: 'center' }}><input type="checkbox" checked={f.visibile} onChange={(e) => setF({ ...f, visibile: e.target.checked, avvisa: e.target.checked && f.avvisa })} style={{ margin: 0 }} />Il cliente la vede nella scheda Scadenze</label>
            <label className="spunta" style={{ alignItems: 'center', opacity: f.visibile ? 1 : 0.55 }}><input type="checkbox" checked={f.visibile && f.avvisa} disabled={!f.visibile} onChange={(e) => setF({ ...f, avvisa: e.target.checked })} style={{ margin: 0 }} />Avvisa il cliente via email 30 giorni prima</label>
          </div>
          {az.erroreRete && <ErroreRete />}
          <AvvisoRegola testo={az.errore} />
          <div className="azioni">
            {f.id && <button type="button" className="btn annulla" style={{ padding: 0, fontSize: 13, color: 'var(--rosso)' }} onClick={async () => fatto(await az.esegui('elimina_scadenza', { p_id: f.id }))}>Elimina</button>}
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" className="btn piccolo" onClick={() => setF(null)}>Annulla</button>
            <button type="button" className="btn piccolo primario" disabled={az.occupato} onClick={async () => fatto(await az.esegui('salva_scadenza', {
              p_id: f.id, p_progetto: d.progetto.id, p_tipo: f.tipo, p_nome: f.nome, p_scade: f.scade || null, p_costo: f.costo, p_carico: f.carico, p_visibile: f.visibile, p_avvisa: f.avvisa }))}>Salva</button>
          </div>
        </div>
      )}
      {!f && az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
      {!f && <AvvisoRegola testo={az.errore} />}
      {d.scadenze.length === 0 ? <Vuoto titolo="Nessuna scadenza" testo="Aggiungi dominio, hosting e account degli store: 30 giorni prima li trovi in Da gestire e, se vuoi, il cliente riceve un avviso." /> : (
        <ul className="elenco">
          {d.scadenze.map((x) => {
            const meta = [`Scade il ${data(x.scade)}`, x.costo ? `${eur(x.costo)} l’anno` : null, x.carico === 'cliente' ? 'La paga il cliente' : 'La paghi tu', x.visibile ? 'Il cliente la vede' : 'Solo tu la vedi'].filter(Boolean).join(' · ');
            const nota = x.visibile && x.avvisa ? (x.avvisato_il ? `Avviso inviato al cliente il ${data(x.avvisato_il)}` : x.giorni > 30 ? `Avviso automatico al cliente il ${data(x.avviso_automatico_il)}` : 'Avviso al cliente non ancora inviato') : '';
            return (
              <li key={x.id} style={{ padding: '14px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
                <span style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px' }}>
                    <span className="tag">{TIPI_SCAD[x.tipo]}</span><strong style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{x.nome}</strong>
                    {x.giorni <= 30 && <span className="segnale">{segnaleScadenza(x.giorni)}</span>}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--tenue)' }}>{meta}</span>
                  {nota && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--tenue)' }}><IconaPosta size={14} />{nota}</span>}
                </span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <button type="button" className="btn annulla" style={{ fontSize: 13, padding: '0 10px' }} aria-label={`Segna come rinnovata: ${x.nome}`} disabled={az.occupato} onClick={async () => fatto(await az.esegui('rinnova_scadenza', { p_id: x.id }))}><IconaRinnova />Rinnovata</button>
                  {x.visibile && <button type="button" className="btn annulla" style={{ fontSize: 13, padding: '0 10px' }} aria-label={`Avvisa il cliente adesso: ${x.nome}`} disabled={az.occupato} onClick={async () => fatto(await az.esegui('avvisa_scadenza', { p_id: x.id }))}><IconaPosta size={14} />Avvisa ora</button>}
                  <button type="button" className="btn annulla" style={{ fontSize: 13, padding: '0 10px' }} aria-label={`Modifica: ${x.nome}`} onClick={() => apri(x)}><IconaMatita />Modifica</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ── Link utili ───────────────────────────────────────────────
function SchedaLink({ d, onCambiate }: { d: DettaglioProgetto; onCambiate: () => void }) {
  const [f, setF] = useState<{ id: string | null; tipo: string; etichetta: string; url: string; visibile: boolean } | null>(null);
  const az = useAzione(); const toast = useToast();
  const fatto = (r: { messaggio?: string } | null) => { if (r) { toast(r.messaggio); setF(null); onCambiate(); } };
  return (
    <>
      <div className="azioni tra">
        <span style={{ flex: '1 1 320px', display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14, color: 'var(--tenue)' }}>
          <IconaLucchetto size={16} style={{ marginTop: 2, flexShrink: 0 }} /><span>Qui vanno gli indirizzi da aprire, non le credenziali: password e codici di accesso tienili in un gestore di password.</span>
        </span>
        {!f && <button type="button" className="btn piccolo" onClick={() => { az.pulisci(); setF({ id: null, tipo: 'app', etichetta: '', url: 'https://', visibile: true }); }}><IconaPiu />Aggiungi link</button>}
      </div>
      {f && (
        <div className="sez" style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 className="h2 grande">{f.id ? 'Modifica link' : 'Nuovo link'}</h2>
          <div className="campi">
            <div className="campo"><label htmlFor="lf-tipo">Tipo</label>
              <select id="lf-tipo" className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                <option value="app">App</option><option value="ios">App Store</option><option value="android">Google Play</option><option value="manuale">Manuale</option><option value="altro">Altro</option>
              </select></div>
            <div className="campo" style={{ flex: '2 1 280px' }}><label htmlFor="lf-etichetta">Nome del link</label><input id="lf-etichetta" className="input" value={f.etichetta} onChange={(e) => setF({ ...f, etichetta: e.target.value })} placeholder="Es. App per gli agenti" /></div>
          </div>
          <div className="campo"><label htmlFor="lf-url">Indirizzo</label><input id="lf-url" type="url" className="input" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://" /></div>
          <label className="spunta" style={{ alignItems: 'center' }}><input type="checkbox" checked={f.visibile} onChange={(e) => setF({ ...f, visibile: e.target.checked })} style={{ margin: 0 }} />Il cliente lo vede in cima al progetto</label>
          {az.erroreRete && <ErroreRete />}
          <AvvisoRegola testo={az.errore} />
          <div className="azioni">
            {f.id && <button type="button" className="btn annulla" style={{ padding: 0, fontSize: 13, color: 'var(--rosso)' }} onClick={async () => fatto(await az.esegui('elimina_link', { p_id: f.id }))}>Elimina</button>}
            <span style={{ flex: '1 1 auto' }} />
            <button type="button" className="btn piccolo" onClick={() => setF(null)}>Annulla</button>
            <button type="button" className="btn piccolo primario" disabled={az.occupato} onClick={async () => fatto(await az.esegui('salva_link', { p_id: f.id, p_progetto: d.progetto.id, p_tipo: f.tipo, p_etichetta: f.etichetta, p_url: f.url, p_visibile: f.visibile }))}>Salva</button>
          </div>
        </div>
      )}
      {d.link.length === 0 ? <Vuoto titolo="Nessun link" testo="Aggiungi l’indirizzo dell’app, le pagine sugli store e il manuale: il cliente li trova in cima al progetto." /> : (
        <ul className="elenco">
          {d.link.map((l) => (
            <li key={l.id} style={{ padding: '10px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 16px' }}>
              <span style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 10px' }}>
                  <span className="tag">{TIPI_LINK[l.tipo]}</span>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="link-utile">{l.etichetta}<IconaEsterno size={13} /></a>
                </span>
                <span style={{ fontSize: 13, color: 'var(--tenue)', overflowWrap: 'anywhere' }}>{hostDi(l.url)} · {l.visibile ? 'Il cliente lo vede' : 'Solo tu lo vedi'}</span>
              </span>
              <button type="button" className="btn annulla" style={{ fontSize: 13, padding: '0 10px' }} aria-label={`Modifica il link ${l.etichetta}`} onClick={() => { az.pulisci(); setF({ ...l }); }}><IconaMatita />Modifica</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
