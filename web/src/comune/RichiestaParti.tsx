// Parti della pagina richiesta usate sia dall'admin sia dal cliente.
import { useRef, useState } from 'react';
import { useAzione, useDati } from '../lib/api';
import { caricaFile, controllaFile, linkFile, MAX_FILE, togliFile, type AllegatoSalvato, type FileCaricato } from '../lib/file';
import { data, iniziali, ora, plur, quando, taglia } from '../lib/formato';
import { Allegato } from '../componenti/Allegato';
import { Apribile, AvvisoRegola, AvvisoSolaLettura, ErroreCaricamento, ErroreRete, Finestra } from '../componenti/Base';
import { PreventivoPdf, RicevutaPdf, type DocPreventivo, type DocRicevuta, type VistaPreventivo } from '../componenti/Documenti';
import { IconaGraffetta, IconaPdf, IconaPosta } from '../componenti/Icone';
import { useToast } from './Toast';

export type Esito = { tipo: 'accetta' | 'modifiche' | 'rifiuta'; da_id: string; da_nome: string; il: string; messaggio: string };
export type PvVista = {
  id: string; versione: number; stato: 'bozza' | 'inviato'; stato_effettivo: string; numero: string | null; inviato_il: string | null; scade_il: string | null;
  tipo: 'occasionale' | 'normale'; dati: DatiPv; vista: VistaPreventivo & { calcolo: { totale: number; valore: number } }; esito: Esito | null;
};
export type DatiPv = { tipo: 'occasionale' | 'normale'; ritenuta: boolean; iva: number | string; tariffa: number | string; sconto: number | string; consegna: number | string; validita: number | string; note: string;
  voci: { descrizione: string; ore: number | string }[]; spese: { descrizione: string; importo: number | string }[] };
export type Messaggio = { id: string; autore_id: string; autore_nome: string; admin: boolean; mio: boolean; testo: string; scritto_il: string; allegati: AllegatoSalvato[] };
export type Evento = { id: string; tipo: string; avvenuto_il: string; chi: string; testo: string; solo_admin: boolean; email: string[] };
export type DettaglioRichiesta = {
  io: { id: string; ruolo: 'admin' | 'cliente' };
  richiesta: { id: string; titolo: string; testo: string; stato: string; tipo: string; aperta_il: string; archiviata_il: string | null; autore_id: string; autore_nome: string; mia: boolean; da_rispondere: boolean };
  progetto: { id: string; nome: string; archiviato: boolean; garanzia_fino: string | null; garanzia_attiva: boolean };
  cliente: { id: string; nome: string; fiscale_completo: boolean; sostituto: boolean };
  garanzia: 'si' | 'no' | null;
  permessi: { puo_modificare: boolean; sola_lettura: string | null; puo_scrivere: boolean; messaggi_chiusi: string | null; admin_modificabile: boolean;
    puo_archiviare: boolean; eliminabile: boolean; motivo_non_eliminabile: string | null; puo_lavorare_pv: boolean; puo_rispondere_pv: boolean };
  allegati: AllegatoSalvato[]; messaggi: Messaggio[]; avviso_messaggio: string;
  bozza: PvVista | null; inviato: PvVista | null;
  pagamento: { pagato_il: string; metodo: string; ricevuta: string | null; fattura: string } | null;
  da_incassare: { importo: number; tipo: string; lavoro_finito_il: string } | null;
  preventivo_accettato: { id: string; numero: string; tipo: string; totale: number } | null;
  ricevuta: DocRicevuta | null;
  risolta: { id: string; titolo: string; pubblicata_il: string } | null;
  note: { id: string; testo: string; scritta_il: string }[] | null;
  cronologia: Evento[]; occasionali_accettati_anno: number | null; manca_nel_pdf: string | null;
};

export const METODI: Record<string, string> = { bonifico: 'bonifico', contanti: 'contanti', altro: 'un altro metodo' };

/** Apre un allegato: immagini in anteprima, il resto in una nuova scheda. */
export function useApriAllegato() {
  const [anteprima, setAnteprima] = useState<{ nome: string; url: string } | null>(null);
  const toast = useToast();
  async function apri(f: { nome: string; mime: string; percorso?: string; anteprima?: string }) {
    const url = f.anteprima ?? (f.percorso ? await linkFile(f.percorso) : null);
    if (!url) { toast('Non è stato possibile aprire il file: riprova.'); return; }
    if (f.mime.startsWith('image/')) setAnteprima({ nome: f.nome, url }); else window.open(url, '_blank', 'noopener');
  }
  const finestra = anteprima && (
    <Finestra titolo={anteprima.nome} onChiudi={() => setAnteprima(null)} larghezza="larga">
      <img src={anteprima.url} alt={anteprima.nome} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', alignSelf: 'center', borderRadius: 8 }} />
      <div className="azioni fine"><a className="btn" href={anteprima.url} download={anteprima.nome} target="_blank" rel="noopener noreferrer">Scarica</a><button type="button" className="btn primario" onClick={() => setAnteprima(null)}>Chiudi</button></div>
    </Finestra>
  );
  return { apri, finestra };
}

export function ElencoAllegati({ allegati, onApri }: { allegati: AllegatoSalvato[]; onApri: (f: AllegatoSalvato) => void }) {
  if (!allegati.length) return null;
  return <div className="allegati">{allegati.map((f) => <Allegato key={f.id} file={f} onApri={() => onApri(f)} />)}</div>;
}

/** Scelta e caricamento dei file per un messaggio o una richiesta. */
export function useCaricaFile(gia = 0) {
  const [file, setFile] = useState<FileCaricato[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [carico, setCarico] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function scelti(lista: FileList | null) {
    const nuovi = Array.from(lista ?? []); if (input.current) input.current.value = '';
    if (!nuovi.length) return;
    setErrore(null); setCarico(true);
    const aggiunti: FileCaricato[] = [];
    for (const f of nuovi) {
      const e = controllaFile(f, gia + file.length + aggiunti.length);
      if (e) { setErrore(e); continue; }
      try { aggiunti.push(await caricaFile(f)); } catch (x) { setErrore((x as Error).message); }
    }
    setFile((p) => [...p, ...aggiunti]); setCarico(false);
  }
  async function togli(percorso: string) { setFile((p) => p.filter((f) => f.percorso !== percorso)); setErrore(null); await togliFile([percorso]); }
  const campo = <input ref={input} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={(e) => void scelti(e.target.files)} aria-label="Scegli i file da allegare" style={{ display: 'none' }} />;
  return { file, setFile, errore, setErrore, carico, campo, scegli: () => input.current?.click(), togli,
    perRpc: () => file.map(({ percorso, nome, dimensione, mime }) => ({ percorso, nome, dimensione, mime })) };
}

export function BottoneAllega({ onClick, carico }: { onClick: () => void; carico: boolean }) {
  return (
    <button type="button" className="btn stretto" onClick={onClick} disabled={carico}>
      <IconaGraffetta size={16} />{carico ? 'Caricamento…' : 'Allega file'}
    </button>
  );
}

// ── Messaggi ─────────────────────────────────────────────────
export function SezioneMessaggi({ d, aperto, onCambia, onInviato }: { d: DettaglioRichiesta; aperto: boolean; onCambia: (v: boolean) => void; onInviato: () => void }) {
  const admin = d.io.ruolo === 'admin';
  const [testo, setTesto] = useState('');
  const up = useCaricaFile();
  const az = useAzione(); const toast = useToast();
  const { apri, finestra } = useApriAllegato();
  const u = d.messaggi[d.messaggi.length - 1];
  const chiUltimo = u ? (u.mio ? 'Tu' : u.admin ? u.autore_nome.split(' ')[0] : u.autore_nome) : '';
  const riassunto = u ? `${chiUltimo}, ${data(u.scritto_il) === data(new Date().toISOString()) ? 'oggi' : data(u.scritto_il)}: ${taglia(u.testo || 'Allegato', 110)}`
    : admin ? 'Nessun messaggio: scrivi qui per chiedere chiarimenti' : 'Nessun messaggio';

  async function invia() {
    if (!testo.trim() && !up.file.length) { up.setErrore('Scrivi un messaggio o allega un file.'); return; }
    const r = await az.esegui('invia_messaggio', { p_richiesta: d.richiesta.id, p_testo: testo, p_allegati: up.perRpc() });
    if (r) { setTesto(''); up.setFile([]); toast(r.messaggio); onInviato(); }
  }

  return (
    <Apribile id="pan-msg" titolo="Messaggi" aperto={aperto} onCambia={onCambia} conta={d.messaggi.length} riassunto={riassunto}
      extra={d.richiesta.da_rispondere ? <span className="segnale">Da rispondere</span> : undefined}>
      {d.messaggi.length ? (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {d.messaggi.map((m) => (
            <li key={m.id} className="messaggio" style={{ gap: 10 }}>
              <span aria-hidden="true" className={`avatar ${m.admin ? 'admin' : ''}`}>{iniziali(m.autore_nome)}</span>
              <div className="corpo">
                <div className="chi"><strong>{m.autore_nome}{m.mio ? ' (tu)' : ''}</strong><span style={{ fontSize: 12 }}>{m.admin ? 'Sviluppatore' : d.cliente.nome} · {quando(m.scritto_il)}</span></div>
                <div className={`fumetto ${m.admin ? 'admin' : ''}`}>
                  {m.testo && <p>{m.testo}</p>}
                  <ElencoAllegati allegati={m.allegati} onApri={(f) => void apri(f)} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : <p style={{ margin: 0, fontSize: 14, color: 'var(--tenue)' }}>{admin ? 'Nessun messaggio. Scrivi qui per chiedere chiarimenti al cliente.' : 'Nessun messaggio. Se ci sono domande sulla richiesta, le trovi qui.'}</p>}
      {d.permessi.puo_scrivere ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--linea-2)', paddingTop: 16 }}>
          <label htmlFor="msg-testo" style={{ fontSize: 14, fontWeight: 600 }}>Scrivi un messaggio</label>
          <textarea id="msg-testo" className="input" rows={3} value={testo} onChange={(e) => { setTesto(e.target.value); up.setErrore(null); az.pulisci(); }}
            placeholder={admin ? 'Rispondi o chiedi un chiarimento…' : 'Aggiungi dettagli o rispondi…'} />
          {up.file.length > 0 && <div className="allegati">{up.file.map((f) => <Allegato key={f.percorso} file={f} onApri={() => void apri(f)} onRimuovi={() => void up.togli(f.percorso)} />)}</div>}
          {up.campo}
          {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
          <AvvisoRegola testo={up.errore ?? az.errore} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px' }}>
            <BottoneAllega onClick={up.scegli} carico={up.carico} />
            <span style={{ flex: '1 1 180px', fontSize: 12, color: 'var(--tenue)' }}>Immagini o PDF, fino a 10 MB · massimo {MAX_FILE} file</span>
            <button type="button" className="btn primario" disabled={az.occupato || up.carico} onClick={() => void invia()}>{az.occupato ? 'Invio…' : 'Invia'}</button>
          </div>
          <span style={{ fontSize: 13, color: 'var(--tenue)' }}>{d.avviso_messaggio}</span>
        </div>
      ) : d.permessi.messaggi_chiusi && <AvvisoSolaLettura>{d.permessi.messaggi_chiusi}</AvvisoSolaLettura>}
      {finestra}
    </Apribile>
  );
}

// ── Cronologia ───────────────────────────────────────────────
export function SezioneCronologia({ eventi, admin, aperto, onCambia }: { eventi: Evento[]; admin: boolean; aperto: boolean; onCambia: (v: boolean) => void }) {
  const ultimo = eventi[eventi.length - 1];
  const oggi = data(new Date().toISOString());
  return (
    <Apribile id="pan-cron" titolo="Cronologia" aperto={aperto} onCambia={onCambia} conta={eventi.length}
      riassunto={ultimo ? `${data(ultimo.avvenuto_il) === oggi ? 'oggi' : data(ultimo.avvenuto_il)}: ${ultimo.chi ? ultimo.chi + ' ' : ''}${ultimo.testo}` : 'Ancora niente'}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {eventi.map((e, i) => (
          <li key={e.id} style={{ display: 'grid', gridTemplateColumns: '88px minmax(0, 1fr)', gap: '0 14px', padding: '10px 0', borderTop: i ? '1px solid var(--linea-2)' : 'none' }}>
            <span style={{ display: 'flex', flexDirection: 'column', fontSize: 13, color: 'var(--tenue)' }} className="numeri"><span>{data(e.avvenuto_il)}</span><span>{ora(e.avvenuto_il)}</span></span>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{e.chi && <strong style={{ fontWeight: 600 }}>{e.chi}</strong>} {e.testo}</span>
              {admin && e.email.length > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--tenue)' }}><IconaPosta size={14} />Email a {e.email.join(', ')}</span>}
              {admin && e.solo_admin && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--avviso-testo)' }}>Solo tu lo vedi</span>}
            </span>
          </li>
        ))}
      </ol>
    </Apribile>
  );
}

// ── Esito del preventivo ─────────────────────────────────────
const STILE_ESITO: Record<string, string> = { accetta: 'ok', modifiche: 'attenzione', rifiuta: 'errore', scaduto: 'info' };

export function BoxEsito({ pv, lato, ioId, nomeAdmin }: { pv: PvVista | null; lato: 'admin' | 'cliente'; ioId: string; nomeAdmin?: string }) {
  if (!pv) return null;
  const e = pv.esito;
  let titolo: string | null = null; let stile = '';
  if (e) {
    const chi = e.da_nome + (lato === 'cliente' && e.da_id === ioId ? ' (tu)' : '');
    titolo = { accetta: `Accettato da ${chi} il ${data(e.il)}`, modifiche: `${chi} ha chiesto modifiche il ${data(e.il)}`, rifiuta: `Rifiutato da ${chi} il ${data(e.il)}` }[e.tipo];
    stile = STILE_ESITO[e.tipo];
  } else if (pv.stato_effettivo === 'scaduto') {
    titolo = lato === 'admin' ? `Offerta scaduta il ${data(pv.scade_il)}: il cliente non ha risposto.` : `Offerta scaduta il ${data(pv.scade_il)}. Contatta ${nomeAdmin ?? 'lo sviluppatore'} per riceverne una aggiornata.`;
    stile = 'info';
  }
  if (!titolo) return null;
  return (
    <div role="status" className={`avviso ${stile}`} style={{ flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
      <strong>{titolo}</strong>
      {e?.messaggio && <span style={{ whiteSpace: 'pre-line' }}>“{e.messaggio}”</span>}
    </div>
  );
}

// ── Anteprima dei documenti ──────────────────────────────────
export function FinestraPdf({ preventivoId, onChiudi }: { preventivoId: string; onChiudi: () => void }) {
  const { dati, errore } = useDati<DocPreventivo>('documento_preventivo', { p_preventivo: preventivoId });
  return (
    <Finestra titolo="Anteprima PDF" onChiudi={onChiudi} larghezza="larga">
      {errore && <ErroreCaricamento messaggio={errore.message} />}
      {dati?.mancaNelPdf && <div className="avviso attenzione">{dati.mancaNelPdf} Lo aggiungi nella pagina “I tuoi dati”.</div>}
      <div style={{ background: 'var(--grigio-sfondo)', padding: 16, borderRadius: 8, overflowX: 'auto' }}>{dati ? <PreventivoPdf d={dati} /> : <p role="status">Preparazione del documento…</p>}</div>
      <div className="azioni fine">
        <button type="button" className="btn" onClick={onChiudi}>Chiudi</button>
        <a className="btn primario" href={`/stampa/preventivo/${preventivoId}`} target="_blank" rel="noopener"><IconaPdf size={16} />Scarica PDF</a>
      </div>
    </Finestra>
  );
}

export function FinestraRicevuta({ d, richiestaId, onChiudi }: { d: DocRicevuta; richiestaId: string; onChiudi: () => void }) {
  return (
    <Finestra titolo={`Ricevuta ${d.numero.toLowerCase()}`} onChiudi={onChiudi} larghezza="larga">
      <div style={{ background: 'var(--grigio-sfondo)', padding: 16, borderRadius: 8, overflowX: 'auto' }}><RicevutaPdf d={d} /></div>
      <div className="azioni fine">
        <button type="button" className="btn" onClick={onChiudi}>Chiudi</button>
        <a className="btn primario" href={`/stampa/ricevuta/${richiestaId}`} target="_blank" rel="noopener"><IconaPdf size={16} />Scarica PDF</a>
      </div>
    </Finestra>
  );
}

export function rigaPagamento(d: DettaglioRichiesta): string {
  const pa = d.preventivo_accettato; const pg = d.pagamento;
  if (!pa) return '';
  if (pg) return `Pagato il ${data(pg.pagato_il)} con ${METODI[pg.metodo]}${pg.ricevuta ? ` · ricevuta n. ${pg.ricevuta}` : pg.fattura ? ` · fattura n. ${pg.fattura}` : ''}`;
  const imp = (pa.tipo === 'occasionale' ? 'Netto ' : 'Totale ') + new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(pa.totale);
  return d.richiesta.stato === 'fatta' && d.da_incassare ? `${imp} · lavoro finito il ${data(d.da_incassare.lavoro_finito_il)}` : `Lo segni quando la richiesta è “Fatta” · ${imp.toLowerCase()}`;
}

export const allegatiTesto = (n: number) => (n ? plur(n, 'allegato', 'allegati') : '');
