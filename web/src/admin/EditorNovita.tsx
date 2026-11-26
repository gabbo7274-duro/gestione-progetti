// Admin · scrivere, salvare e pubblicare una novità, con le richieste incluse.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAzione, useDati } from '../lib/api';
import { data, oggiIso } from '../lib/formato';
import { AvvisoRegola, Caricamento, ErroreCaricamento, ErroreRete, Finestra, StatoBadge, TagTipo, TestoFormattato } from '../componenti/Base';
import { IconaElenco, IconaGrassetto, IconaLink, IconaSpunta } from '../componenti/Icone';
import { Percorso } from '../comune/Layout';
import { useToast } from '../comune/Toast';

type DatiEditor = {
  novita: { id: string; titolo: string; testo: string; stato: 'bozza' | 'pubblicata'; pubblicata_il: string | null; richieste: string[] } | null;
  progetto: { id: string; nome: string; cliente_id: string; cliente_nome: string };
  richieste: { id: string; titolo: string; stato: string; tipo: string; inclusa: boolean }[];
};

export function EditorNovita() {
  const { id: idProgetto } = useParams(); // /progetti/:id/novita/nuova oppure /novita/:id
  const nuova = window.location.pathname.endsWith('/nuova');
  const { dati, errore, caricamento, ricarica } = useDati<DatiEditor>('editor_novita', nuova ? { p_progetto: idProgetto, p_id: null } : { p_progetto: null, p_id: idProgetto });
  if (caricamento && !dati) return <Caricamento />;
  if (errore || !dati) return <ErroreCaricamento messaggio={errore?.message ?? 'Novità non trovata.'} onRiprova={ricarica} />;
  return <Editor key={dati.novita?.id ?? 'nuova'} d={dati} />;
}

function Editor({ d }: { d: DatiEditor }) {
  const naviga = useNavigate(); const toast = useToast(); const az = useAzione();
  const [id, setId] = useState(d.novita?.id ?? null);
  const [titolo, setTitolo] = useState(d.novita?.titolo ?? '');
  const [testo, setTesto] = useState(d.novita?.testo ?? '');
  const [incluse, setIncluse] = useState<string[]>(d.novita?.richieste ?? []);
  const [scheda, setScheda] = useState<'scrivi' | 'anteprima'>('scrivi');
  const [segnaFatte, setSegnaFatte] = useState(true);
  const [conferma, setConferma] = useState(false);
  const [errForm, setErrForm] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const selezione = useRef<[number, number] | null>(null);
  const pubblicata = d.novita?.stato === 'pubblicata';
  const p = d.progetto;
  const daSegnare = d.richieste.filter((r) => incluse.includes(r.id) && ['nuova', 'accettata', 'in_lavorazione'].includes(r.stato)).length;

  useEffect(() => {
    if (selezione.current && ta.current) { ta.current.focus(); ta.current.setSelectionRange(...selezione.current); selezione.current = null; }
  }, [testo]);

  // Formattazione: inserisce **grassetto**, "- " per l'elenco, [testo](https://) per il link
  function formatta(tipo: 'b' | 'ul' | 'l') {
    const el = ta.current; const t = testo;
    const a = el ? el.selectionStart : t.length, b = el ? el.selectionEnd : t.length;
    const sel = t.slice(a, b); let ins: string; let cs: number; let ce: number;
    if (tipo === 'b') { const x = sel || 'testo in grassetto'; ins = `**${x}**`; cs = a + 2; ce = cs + x.length; }
    else if (tipo === 'l') { const y = sel || 'testo del link'; ins = `[${y}](https://)`; cs = a + y.length + 3; ce = cs + 8; }
    else {
      const righe = (sel || 'voce dell’elenco').split('\n').map((l) => '- ' + l.replace(/^[-*] /, ''));
      const pre = a > 0 && t[a - 1] !== '\n' ? '\n' : '';
      ins = pre + righe.join('\n'); cs = a + pre.length + 2; ce = a + ins.length;
    }
    selezione.current = [cs, ce];
    setTesto(t.slice(0, a) + ins + t.slice(b));
  }

  async function salva() {
    setErrForm(null);
    const r = await az.esegui('salva_novita', { p_id: id, p_progetto: p.id, p_titolo: titolo, p_testo: testo, p_richieste: incluse });
    if (r) { toast(r.messaggio); if (!id && r.id) { setId(r.id); naviga(`/novita/${r.id}`, { replace: true }); } }
  }
  function chiediPubblica() {
    if (!titolo.trim() || !testo.trim()) { setErrForm('Per pubblicare servono titolo e testo.'); return; }
    setErrForm(null); setConferma(true);
  }
  async function pubblica() {
    setConferma(false);
    const r = await az.esegui('pubblica_novita', { p_id: id, p_progetto: p.id, p_titolo: titolo, p_testo: testo, p_richieste: incluse, p_segna_fatte: segnaFatte });
    if (r) naviga(`/progetti/${p.id}?tab=novita`, { state: { toast: r.messaggio } });
  }

  return (
    <>
      <Percorso voci={[{ label: 'Clienti', a: '/clienti' }, { label: p.cliente_nome, a: `/clienti/${p.cliente_id}` }, { label: p.nome, a: `/progetti/${p.id}?tab=novita` }, { label: id ? 'Modifica novità' : 'Nuova novità' }]} />
      {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
      <AvvisoRegola testo={errForm ?? az.errore} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
        <h1 className="h1">{id ? 'Modifica novità' : 'Nuova novità'}</h1>
        <StatoBadge stato={d.novita?.stato ?? 'bozza'} />
      </div>
      <div className="sez" style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="campo">
          <label htmlFor="ed-titolo">Titolo</label>
          <input id="ed-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); setErrForm(null); }} placeholder="Es. Versione 1.5 disponibile" />
        </div>
        <div className="campo">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
            <label htmlFor="ed-testo">Testo</label>
            <div role="tablist" aria-label="Modalità editor" className="interruttore">
              <button type="button" role="tab" aria-selected={scheda === 'scrivi'} onClick={() => setScheda('scrivi')}>Scrivi</button>
              <button type="button" role="tab" aria-selected={scheda === 'anteprima'} onClick={() => setScheda('anteprima')}>Anteprima</button>
            </div>
          </div>
          {scheda === 'scrivi' ? (
            <div>
              <div role="toolbar" aria-label="Formattazione" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, padding: '4px 6px', border: '1px solid var(--bordo)', borderBottom: 'none', borderRadius: '8px 8px 0 0', background: 'var(--grigio-sfondo)' }}>
                <button type="button" className="icona-btn" style={{ color: 'var(--testo)' }} onClick={() => formatta('b')} aria-label="Grassetto" title="Grassetto"><IconaGrassetto /></button>
                <button type="button" className="icona-btn" style={{ color: 'var(--testo)' }} onClick={() => formatta('ul')} aria-label="Elenco puntato" title="Elenco puntato"><IconaElenco /></button>
                <button type="button" className="icona-btn" style={{ color: 'var(--testo)' }} onClick={() => formatta('l')} aria-label="Link" title="Link"><IconaLink /></button>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tenue)', padding: '0 6px' }}>Paragrafi, elenchi puntati, grassetto e link</span>
              </div>
              <textarea id="ed-testo" ref={ta} className="input" rows={12} value={testo} onChange={(e) => setTesto(e.target.value)}
                placeholder="Scrivi qui la novità. Lascia una riga vuota tra un paragrafo e l’altro."
                style={{ display: 'block', minHeight: 280, borderRadius: '0 0 8px 8px', lineHeight: 1.6 }} />
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: 'var(--grigio-sfondo)', border: '1px solid var(--bordo-card)', borderRadius: 10 }}>
              <span className="etichetta-sez">Così la vedrà il cliente</span>
              <article style={{ background: '#fff', border: '1px solid var(--bordo-card)', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--tenue)' }}>{data(d.novita?.pubblicata_il ?? oggiIso())}</span>
                <h2 className="h2" style={{ fontSize: 19, lineHeight: 1.3 }}>{titolo.trim() || 'Titolo della novità'}</h2>
                {testo.trim() ? <TestoFormattato testo={testo} /> : <span style={{ fontSize: 14, color: 'var(--tenue)' }}>Nessun testo da mostrare: scrivilo nella scheda “Scrivi”.</span>}
                {incluse.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 12px', paddingTop: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Richieste incluse:</span>
                    {d.richieste.filter((r) => incluse.includes(r.id)).map((r) => <span key={r.id} className="link-utile"><IconaSpunta size={14} />{r.titolo}</span>)}
                  </div>
                )}
              </article>
            </div>
          )}
        </div>
        <fieldset style={{ border: '1px solid var(--bordo-card)', borderRadius: 8, margin: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <legend style={{ fontSize: 14, fontWeight: 600, padding: '0 6px' }}>Richieste incluse in questa novità</legend>
          <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--tenue)' }}>Il cliente le vede elencate sotto la novità, con il collegamento alla richiesta.</p>
          {d.richieste.length === 0 ? <span style={{ fontSize: 14, color: 'var(--tenue)' }}>Nessuna richiesta aperta su questo progetto.</span> : d.richieste.map((r) => (
            <label key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', minHeight: 44, cursor: 'pointer' }}>
              <input type="checkbox" checked={incluse.includes(r.id)} onChange={() => setIncluse((x) => (x.includes(r.id) ? x.filter((y) => y !== r.id) : [...x, r.id]))} style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }} />
              <span style={{ flex: '1 1 200px', minWidth: 0 }}>{r.titolo}</span>
              <TagTipo tipo={r.tipo} /><StatoBadge stato={r.stato} />
            </label>
          ))}
          {!pubblicata && daSegnare > 0 && (
            <label className="spunta" style={{ borderTop: '1px solid var(--linea-2)', marginTop: 6, paddingTop: 10 }}>
              <input type="checkbox" checked={segnaFatte} onChange={(e) => setSegnaFatte(e.target.checked)} />
              <span className="testi"><strong>Quando pubblichi, segna come “Fatta” le richieste incluse</strong><span>I referenti che le seguono ricevono un’email.</span></span>
            </label>
          )}
        </fieldset>
        {pubblicata && <p style={{ margin: 0, fontSize: 14, color: 'var(--testo-2)' }}>Pubblicata il {data(d.novita?.pubblicata_il)}. Le modifiche che salvi sono subito visibili al cliente.</p>}
        <div className="azioni fine" style={{ borderTop: '1px solid var(--linea-2)', paddingTop: 16 }}>
          <button type="button" className="btn annulla" onClick={() => naviga(`/progetti/${p.id}?tab=novita`)}>Annulla</button>
          {pubblicata
            ? <button type="button" className="btn primario" disabled={az.occupato} onClick={() => void salva()}>{az.occupato ? 'Salvataggio…' : 'Salva modifiche'}</button>
            : <>
                <button type="button" className="btn" disabled={az.occupato} onClick={() => void salva()}>{az.occupato ? 'Salvataggio…' : 'Salva bozza'}</button>
                <button type="button" className="btn primario" disabled={az.occupato} onClick={chiediPubblica}>Pubblica</button>
              </>}
        </div>
      </div>
      {conferma && (
        <Finestra titolo="Pubblicare la novità?" onChiudi={() => setConferma(false)}>
          <p>Da questo momento il cliente la vede nel feed del progetto “{p.nome}”.</p>
          {segnaFatte && daSegnare > 0 && <p style={{ fontSize: 14 }}>{daSegnare === 1 ? 'La richiesta inclusa passa a “Fatta”.' : `Le ${daSegnare} richieste incluse passano a “Fatta”.`}</p>}
          <div className="azioni fine"><button type="button" className="btn" onClick={() => setConferma(false)}>Annulla</button><button type="button" className="btn primario" onClick={() => void pubblica()}>Pubblica</button></div>
        </Finestra>
      )}
    </>
  );
}
