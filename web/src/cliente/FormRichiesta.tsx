// Cliente · nuova richiesta o modifica di una richiesta ancora "Nuova", e conferma di invio.
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAzione, useDati } from '../lib/api';
import { data } from '../lib/formato';
import { togliFile } from '../lib/file';
import { Allegato } from '../componenti/Allegato';
import { AvvisoRegola, Caricamento, ErroreCaricamento, ErroreRete, StatoBadge } from '../componenti/Base';
import { IconaScudo, IconaSpunta } from '../componenti/Icone';
import { Percorso } from '../comune/Layout';
import { useToast } from '../comune/Toast';
import { BottoneAllega, useApriAllegato, useCaricaFile, type DettaglioRichiesta } from '../comune/RichiestaParti';
import type { DettaglioProgetto } from '../admin/Progetto';

export function FormRichiesta() {
  const { id } = useParams();
  const modifica = window.location.pathname.endsWith('/modifica');
  const rich = useDati<DettaglioRichiesta>(modifica ? 'dettaglio_richiesta' : null, { p_id: id });
  const progettoId = modifica ? rich.dati?.progetto.id : id;
  const prog = useDati<DettaglioProgetto>(progettoId ? 'dettaglio_progetto' : null, { p_id: progettoId });
  if ((modifica && !rich.dati) || !prog.dati) {
    const err = rich.errore ?? prog.errore;
    return err ? <ErroreCaricamento messaggio={err.message} /> : <Caricamento />;
  }
  return <Modulo progetto={prog.dati.progetto} richiesta={modifica ? rich.dati : null} />;
}

function Modulo({ progetto: p, richiesta }: { progetto: DettaglioProgetto['progetto']; richiesta: DettaglioRichiesta | null }) {
  const r = richiesta?.richiesta;
  const [tipo, setTipo] = useState<string | null>(r?.tipo ?? null);
  const [titolo, setTitolo] = useState(r?.titolo ?? '');
  const [testo, setTesto] = useState(r?.testo ?? '');
  const [esistenti, setEsistenti] = useState(richiesta?.allegati ?? []);
  const up = useCaricaFile(esistenti.length);
  const az = useAzione(); const naviga = useNavigate(); const toast = useToast();
  const { apri, finestra } = useApriAllegato();
  const annulla = () => naviga(r ? `/richieste/${r.id}` : `/progetti/${p.id}?tab=richieste`);

  async function invia(e: FormEvent) {
    e.preventDefault();
    if (!tipo) { az.setErrore('Scegli se si tratta di un errore o di una nuova funzione.'); return; }
    if (!titolo.trim()) { az.setErrore('Inserisci un titolo per la richiesta.'); return; }
    if (!testo.trim()) { az.setErrore('Aggiungi una descrizione: spiega cosa ti serve.'); return; }
    if (r) {
      const x = await az.esegui('modifica_richiesta', { p_id: r.id, p_tipo: tipo, p_titolo: titolo, p_testo: testo, p_allegati: [...esistenti.map((f) => ({ id: f.id })), ...up.perRpc()] });
      if (x) { await togliFile(x.file_tolti); naviga(`/richieste/${r.id}`, { state: { toast: x.messaggio } }); }
    } else {
      const x = await az.esegui('crea_richiesta', { p_progetto: p.id, p_tipo: tipo, p_titolo: titolo, p_testo: testo, p_allegati: up.perRpc() });
      if (x?.id) { toast(x.messaggio); naviga(`/richieste/${x.id}/inviata`, { replace: true }); }
    }
  }
  const garInfo = tipo === 'errore' && p.garanzia_fino
    ? (p.garanzia_attiva ? `Il progetto è in garanzia fino al ${data(p.garanzia_fino)}: la correzione degli errori è compresa.` : `La garanzia è scaduta il ${data(p.garanzia_fino)}: ti diremo se serve un preventivo.`) : null;

  return (
    <>
      <Percorso voci={[{ label: 'I miei progetti', a: '/' }, { label: p.nome, a: `/progetti/${p.id}?tab=richieste` }, { label: r ? 'Modifica richiesta' : 'Nuova richiesta' }]} />
      <div className="titolo-pagina"><h1 className="h1">{r ? 'Modifica richiesta' : 'Nuova richiesta'}</h1><p className="sotto-titolo">Progetto: {p.nome}</p></div>
      <form onSubmit={(e) => void invia(e)} className="sez" style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend style={{ fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 6 }}>Di cosa si tratta?</legend>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {([['errore', 'Qualcosa non funziona', 'Un errore o un comportamento sbagliato'], ['funzione', 'Una cosa nuova o una modifica', 'Una funzione da aggiungere o da cambiare']] as const).map(([v, t, s]) => (
              <label key={v} className={`scelta ${tipo === v ? 'attiva' : ''}`}>
                <input type="radio" name="rq-tipo" checked={tipo === v} onChange={() => { setTipo(v); az.pulisci(); }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontWeight: 600 }}>{t}</span><span style={{ fontSize: 13, color: 'var(--tenue)' }}>{s}</span></span>
              </label>
            ))}
          </div>
          {garInfo && <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 6, fontSize: 13, color: p.garanzia_attiva ? 'var(--ok-testo)' : 'var(--tenue)' }}><IconaScudo size={14} style={{ marginTop: 2, flexShrink: 0 }} />{garInfo}</span>}
        </fieldset>
        <div className="campo"><label htmlFor="rq-titolo">Titolo</label><input id="rq-titolo" className="input" value={titolo} onChange={(e) => { setTitolo(e.target.value); az.pulisci(); }} placeholder="Es. Esportare gli ordini in Excel" /></div>
        <div className="campo">
          <label htmlFor="rq-testo">Descrizione</label>
          <textarea id="rq-testo" className="input" rows={7} value={testo} onChange={(e) => { setTesto(e.target.value); az.pulisci(); }} />
          <span className="aiuto">Spiega cosa ti serve e perché: ci aiuta a valutarla più in fretta.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Allegati <span style={{ fontWeight: 400, color: 'var(--tenue)' }}>(facoltativi)</span></span>
          {(esistenti.length > 0 || up.file.length > 0) && (
            <div className="allegati">
              {esistenti.map((f) => <Allegato key={f.id} file={f} onApri={() => void apri(f)} onRimuovi={() => setEsistenti((x) => x.filter((y) => y.id !== f.id))} />)}
              {up.file.map((f) => <Allegato key={f.percorso} file={f} onApri={() => void apri(f)} onRimuovi={() => void up.togli(f.percorso)} />)}
            </div>
          )}
          <AvvisoRegola testo={up.errore} />
          {up.campo}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px' }}>
            <BottoneAllega onClick={up.scegli} carico={up.carico} />
            <span style={{ flex: '1 1 200px', fontSize: 12, color: 'var(--tenue)' }}>Se segnali un errore, uno screenshot aiuta molto. Immagini o PDF, fino a 10 MB · massimo 5 file</span>
          </div>
        </div>
        {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
        <AvvisoRegola testo={az.errore} />
        <div className="azioni fine" style={{ borderTop: '1px solid var(--linea-2)', paddingTop: 16 }}>
          <button type="button" className="btn annulla" onClick={annulla}>Annulla</button>
          <button type="submit" className="btn primario" disabled={az.occupato || up.carico}>{az.occupato ? 'Invio in corso…' : r ? 'Salva modifiche' : 'Invia richiesta'}</button>
        </div>
      </form>
      {finestra}
    </>
  );
}

export function RichiestaInviata() {
  const { id } = useParams();
  const naviga = useNavigate();
  const { dati } = useDati<DettaglioRichiesta>('dettaglio_richiesta', { p_id: id });
  if (!dati) return <Caricamento />;
  return (
    <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, paddingTop: 12 }}>
      <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--ok-sfondo)', color: 'var(--ok-testo)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconaSpunta size={26} /></span>
      <h1 className="h1">Richiesta inviata</h1>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 16, color: 'var(--testo-2)' }}>Abbiamo ricevuto “{dati.richiesta.titolo}”. La trovi nella scheda Richieste con lo stato</p>
        <StatoBadge stato="nuova" />
        <p style={{ margin: 0, fontSize: 14, color: 'var(--tenue)' }}>Finché resta “Nuova” puoi ancora modificarla o ritirarla. Ti arriva un’email quando ti scriviamo o cambia lo stato.</p>
      </div>
      <div className="azioni">
        <button type="button" className="btn primario" onClick={() => naviga(`/richieste/${dati.richiesta.id}`)}>Vedi la richiesta</button>
        <button type="button" className="btn" onClick={() => naviga(`/progetti/${dati.progetto.id}?tab=richieste`)}>Torna al progetto</button>
      </div>
    </div>
  );
}
