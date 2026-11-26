// Cliente · dettaglio della richiesta: testo, modifica e ritiro, messaggi, preventivo da approvare, pagamento, cronologia.
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAzione, useDati } from '../lib/api';
import { data, eur } from '../lib/formato';
import { AvvisoRegola, AvvisoSolaLettura, Caricamento, ErroreCaricamento, ErroreRete, Finestra, StatoBadge, TagGaranzia, TagTipo } from '../componenti/Base';
import { PreventivoRiepilogo } from '../componenti/Documenti';
import { IconaGiu, IconaPdf, IconaSpunta } from '../componenti/Icone';
import { Percorso } from '../comune/Layout';
import { useIo } from '../comune/Sessione';
import { useToast } from '../comune/Toast';
import {
  BoxEsito, ElencoAllegati, FinestraPdf, FinestraRicevuta, rigaPagamento, SezioneCronologia, SezioneMessaggi, useApriAllegato, type DettaglioRichiesta,
} from '../comune/RichiestaParti';

export function RichiestaCliente() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { dati, errore, caricamento, ricarica } = useDati<DettaglioRichiesta>('dettaglio_richiesta', { p_id: id });
  if (caricamento && !dati) return <Caricamento />;
  if (errore || !dati) return <ErroreCaricamento messaggio={errore?.message ?? 'Richiesta non trovata.'} onRiprova={ricarica} />;
  return <Pagina key={dati.richiesta.id} d={dati} sezione={params.get('sezione')} onCambiata={() => void ricarica()} />;
}

type TipoEsito = 'accetta' | 'modifiche' | 'rifiuta';
const ESITI: Record<TipoEsito, { t: string; x: (admin: string) => string; l: string; b: string; pericolo?: boolean }> = {
  accetta: { t: 'Accettare il preventivo?', x: () => 'La conferma resta registrata con il tuo nome e la data di oggi.', l: 'Messaggio (facoltativo)', b: 'Accetta preventivo' },
  modifiche: { t: 'Chiedere modifiche?', x: (a) => `${a} riceverà la tua richiesta e preparerà una nuova versione del preventivo.`, l: 'Cosa vorresti cambiare?', b: 'Invia richiesta di modifiche' },
  rifiuta: { t: 'Rifiutare il preventivo?', x: () => 'Il preventivo verrà chiuso. Potrai sempre aprire una nuova richiesta.', l: 'Motivo (facoltativo)', b: 'Rifiuta preventivo', pericolo: true },
};

function Pagina({ d, sezione, onCambiata }: { d: DettaglioRichiesta; sezione: string | null; onCambiata: () => void }) {
  const io = useIo(); const r = d.richiesta; const naviga = useNavigate(); const toast = useToast();
  const [apertoMsg, setApertoMsg] = useState(sezione === 'messaggi');
  const [apertoPv, setApertoPv] = useState(sezione === 'preventivo' || d.permessi.puo_rispondere_pv);
  const [apertoCron, setApertoCron] = useState(false);
  const [ritira, setRitira] = useState(false);
  const [esito, setEsito] = useState<TipoEsito | null>(null);
  const [msgEsito, setMsgEsito] = useState('');
  const [pdf, setPdf] = useState(false);
  const [ricevuta, setRicevuta] = useState(sezione === 'pagamento' && !!d.ricevuta);
  const az = useAzione();
  const { apri, finestra } = useApriAllegato();
  const pv = d.inviato;

  async function confermaRitiro() {
    setRitira(false);
    const x = await az.esegui('ritira_richiesta', { p_id: r.id });
    if (x) { toast(x.messaggio); onCambiata(); }
  }
  async function confermaEsito() {
    if (!esito) return;
    if (esito === 'modifiche' && !msgEsito.trim()) { az.setErrore('Scrivi cosa vorresti cambiare.'); return; }
    const x = await az.esegui('rispondi_preventivo', { p_richiesta: r.id, p_esito: esito, p_messaggio: msgEsito });
    if (x) { setEsito(null); setMsgEsito(''); toast(x.messaggio); onCambiata(); }
  }

  const riassuntoPv = pv ? `${pv.tipo === 'occasionale' ? 'Netto ' : 'Totale '}${eur(pv.vista.calcolo.totale)}${d.permessi.puo_rispondere_pv ? ` · rispondi entro il ${data(pv.scade_il)}` : ` · versione ${pv.versione}`}` : '';

  return (
    <>
      <Percorso voci={[{ label: 'I miei progetti', a: '/' }, { label: d.progetto.nome, a: `/progetti/${d.progetto.id}?tab=richieste` }, { label: 'Richiesta' }]} />
      {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
      {!esito && <AvvisoRegola testo={az.errore} />}
      <article style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
          <h1 className="h1 medio">{r.titolo}</h1>
          <StatoBadge stato={r.stato} /><TagTipo tipo={r.tipo} /><TagGaranzia g={d.garanzia} />
        </div>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--tenue)' }}>Aperta da {r.mia ? `te (${r.autore_nome})` : r.autore_nome} il {data(r.aperta_il)}</p>
        <p style={{ margin: 0, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{r.testo}</p>
        {d.risolta && (
          <p style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 6px', fontSize: 14, color: 'var(--ok-testo)' }}>
            <IconaSpunta size={16} /><span>Inclusa nella novità</span>
            <Link to={`/progetti/${d.progetto.id}?tab=novita`} className="link-utile" style={{ minHeight: 0 }}>{d.risolta.titolo}</Link><span>del {data(d.risolta.pubblicata_il)}</span>
          </p>
        )}
        {d.allegati.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--testo-2)' }}>Allegati</span>
            <ElencoAllegati allegati={d.allegati} onApri={(f) => void apri(f)} />
          </div>
        )}
        {d.permessi.puo_modificare ? (
          <div className="azioni" style={{ paddingTop: 4 }}>
            <button type="button" className="btn piccolo" onClick={() => naviga(`/richieste/${r.id}/modifica`)}>Modifica</button>
            <button type="button" className="btn piccolo pericolo-leggero" disabled={az.occupato} onClick={() => setRitira(true)}>Ritira</button>
          </div>
        ) : d.permessi.sola_lettura && <AvvisoSolaLettura>{d.permessi.sola_lettura}</AvvisoSolaLettura>}
      </article>

      <SezioneMessaggi d={d} aperto={apertoMsg} onCambia={setApertoMsg} onInviato={onCambiata} />

      {pv && (
        <section aria-label="Preventivo" className="sez">
          <h2 className="h2" style={{ margin: 0 }}>
            <button type="button" className="apribile" aria-expanded={apertoPv} aria-controls="pan-pv-c" onClick={() => setApertoPv(!apertoPv)}>
              <span style={{ flexShrink: 0 }}>Preventivo</span>
              {d.permessi.puo_rispondere_pv ? <span className="segnale">Da approvare</span> : <StatoBadge stato={pv.stato_effettivo} />}
              <span className="riassunto">{riassuntoPv}</span>
              <span aria-hidden="true" className={`freccia ${apertoPv ? 'aperta' : ''}`}><IconaGiu /></span>
            </button>
          </h2>
          {apertoPv && (
            <div id="pan-pv-c" className="pannello" style={{ gap: 16 }}>
              <div className="azioni tra">
                <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Versione {pv.versione} · ricevuto il {data(pv.inviato_il)}</span>
                <button type="button" className="btn stretto" onClick={() => setPdf(true)}><IconaPdf size={16} />Scarica PDF</button>
              </div>
              <BoxEsito pv={pv} lato="cliente" ioId={io.id} nomeAdmin={io.nome_admin} />
              <PreventivoRiepilogo dati={pv.vista} />
              {d.permessi.puo_rispondere_pv && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--linea-2)', paddingTop: 16 }}>
                  <span style={{ fontSize: 14, color: 'var(--testo-2)' }}>Puoi rispondere fino al {data(pv.scade_il)}. La risposta resta registrata con il tuo nome.</span>
                  <div className="azioni">
                    <button type="button" className="btn primario" onClick={() => { az.pulisci(); setEsito('accetta'); }}>Accetta preventivo</button>
                    <button type="button" className="btn" onClick={() => { az.pulisci(); setEsito('modifiche'); }}>Chiedi modifiche</button>
                    <button type="button" className="btn pericolo-leggero" onClick={() => { az.pulisci(); setEsito('rifiuta'); }}>Rifiuta</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {d.pagamento && (
        <section aria-label="Pagamento" className="sez">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', minHeight: 56, padding: '12px 0' }}>
            <h2 className="h2 grande" style={{ flexShrink: 0 }}>Pagamento</h2>
            <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: 14, color: 'var(--tenue)' }}>{rigaPagamento(d)}</span>
            {d.ricevuta && <button type="button" className="btn stretto" onClick={() => setRicevuta(true)}><IconaPdf size={16} />Vedi ricevuta</button>}
          </div>
        </section>
      )}

      <SezioneCronologia eventi={d.cronologia} admin={false} aperto={apertoCron} onCambia={setApertoCron} />

      {ritira && (
        <Finestra titolo="Ritirare la richiesta?" onChiudi={() => setRitira(false)}>
          <p>La richiesta verrà ritirata e non potrai riaprirla.</p>
          <div className="azioni fine"><button type="button" className="btn" onClick={() => setRitira(false)}>Annulla</button><button type="button" className="btn pericolo" onClick={() => void confermaRitiro()}>Ritira richiesta</button></div>
        </Finestra>
      )}
      {esito && (
        <Finestra titolo={ESITI[esito].t} onChiudi={() => setEsito(null)}>
          <p>{ESITI[esito].x(io.nome_admin)}</p>
          <div className="campo">
            <label htmlFor="esito-msg">{ESITI[esito].l}</label>
            <textarea id="esito-msg" className="input" rows={3} value={msgEsito} onChange={(e) => { setMsgEsito(e.target.value); az.pulisci(); }} />
          </div>
          {az.erroreRete && <ErroreRete />}
          <AvvisoRegola testo={az.errore} />
          <div className="azioni fine">
            <button type="button" className="btn" onClick={() => setEsito(null)}>Annulla</button>
            <button type="button" className={`btn ${ESITI[esito].pericolo ? 'pericolo' : 'primario'}`} disabled={az.occupato} onClick={() => void confermaEsito()}>{az.occupato ? 'Invio…' : ESITI[esito].b}</button>
          </div>
        </Finestra>
      )}
      {pdf && pv && <FinestraPdf preventivoId={pv.id} onChiudi={() => setPdf(false)} />}
      {ricevuta && d.ricevuta && <FinestraRicevuta d={d.ricevuta} richiestaId={r.id} onChiudi={() => setRicevuta(false)} />}
      {finestra}
    </>
  );
}
