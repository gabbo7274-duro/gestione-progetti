// Da gestire: per urgenza, una riga per richiesta con l'azione che serve adesso.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDati } from '../lib/api';
import { giornoEData, maiuscola, parola, saluto, data as dataIt } from '../lib/formato';
import { Caricamento, ErroreCaricamento } from '../componenti/Base';
import { IconaFreccia, IconaGiu } from '../componenti/Icone';
import { useIo, useSessione } from '../comune/Sessione';

type Voce = { dal: string; giorni: number; urgente: boolean; azione: string; contesto: string; citazione: string; richiesta_id?: string; sezione?: string | null; progetto_id?: string; tab?: string };
type Attesa = { tipo: 'preventivo' | 'pagamento'; data: string; etichetta: string; azione: string; contesto: string; richiesta_id: string; sezione: string | null };
type Dati = { oggi: string; adesso: Voce[]; settimana: Voce[]; rinnovi: Voce[]; attesa: Attesa[] };

const link = (v: { richiesta_id?: string; sezione?: string | null; progetto_id?: string; tab?: string }) =>
  v.richiesta_id ? `/richieste/${v.richiesta_id}${v.sezione ? `?sezione=${v.sezione}` : ''}` : `/progetti/${v.progetto_id}?tab=${v.tab ?? 'novita'}`;

function Frase({ d }: { d: Dati }) {
  const nA = d.adesso.length, nS = d.settimana.length, nR = d.rinnovi.length;
  const nPv = d.attesa.filter((x) => x.tipo === 'preventivo').length, nPag = d.attesa.length - nPv;
  const urgenti = <strong style={{ fontWeight: 600, color: 'var(--segnale)' }}>{nA === 1 ? 'una cosa che non può' : parola(nA) + ' cose che non possono'} aspettare</strong>;
  const parti: string[] = [];
  if (nPv) parti.push(nPv === 1 ? 'un preventivo aspetta la risposta del cliente' : parola(nPv) + ' preventivi aspettano la risposta dei clienti');
  if (nPag) parti.push(nPag === 1 ? 'un lavoro finito aspetta il pagamento' : parola(nPag) + ' lavori finiti aspettano il pagamento');
  const attesa = parti.length ? ' ' + maiuscola(parti.join(' e ')) + '.' : '';
  const rinnovi = nR ? (nR === 1 ? ' Un rinnovo scade nei prossimi 30 giorni.' : ` ${maiuscola(parola(nR))} rinnovi scadono nei prossimi 30 giorni.`) : '';
  return (
    <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55, color: 'var(--testo-2)', textWrap: 'pretty' }}>
      {nA && nS ? <>Hai {urgenti} e <strong style={{ fontWeight: 600, color: 'var(--inchiostro)' }}>{parola(nS)} da fare in settimana</strong>.</>
        : nA ? <>Hai {urgenti}. Per il resto è tutto in ordine.</>
        : nS ? <>Niente di urgente. Hai <strong style={{ fontWeight: 600, color: 'var(--inchiostro)' }}>{nS === 1 ? 'una cosa' : parola(nS) + ' cose'} da fare in settimana</strong>.</>
        : <>Niente da fare: è tutto in ordine.</>}
      {attesa}{rinnovi}
    </p>
  );
}

function Gruppo({ id, titolo, sotto, voci, rinnovi = false }: { id: string; titolo: string; sotto: string; voci: Voce[]; rinnovi?: boolean }) {
  if (!voci.length) return null;
  return (
    <section aria-labelledby={id} style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
      <div className="sez-testa">
        <h2 id={id} className="h2 grande">{titolo}</h2>
        <span style={{ fontSize: 13, color: 'var(--tenue)' }}>{sotto}</span>
        <span className="numero">{voci.length}</span>
      </div>
      <ul className="voci-dg">
        {voci.map((v, i) => (
          <li key={i}>
            <Link to={link(v)} className="voce-dg">
              <span className="quando">
                <span className={`num ${v.urgente ? 'urgente' : ''}`}>{!rinnovi && v.giorni <= 0 ? 'oggi' : v.giorni}</span>
                <span className="unita">{!rinnovi && v.giorni <= 0 ? '' : v.giorni === 1 ? 'giorno' : 'giorni'}</span>
              </span>
              <span className="testi">
                <span className="azione">{v.azione}</span>
                <span className="contesto">{v.contesto}</span>
                {v.citazione && <span className="citazione">“{v.citazione}”</span>}
              </span>
              <IconaFreccia stroke="#9A9DA3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DaGestire() {
  const io = useIo();
  const { aggiorna } = useSessione();
  const { dati, errore, caricamento, ricarica } = useDati<Dati>('da_gestire');
  const [attesaAperta, setAttesaAperta] = useState(false);
  useEffect(() => { void aggiorna(); }, [aggiorna]);

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
        <span className="occhiello">{dati ? giornoEData(dati.oggi) : ' '}</span>
        <h1 className="h1 grande">{saluto()}, {io.nome}.</h1>
        {dati && <Frase d={dati} />}
      </div>
      {caricamento && !dati && <Caricamento />}
      {errore && <ErroreCaricamento messaggio={errore.message} onRiprova={ricarica} />}
      {dati && (
        <>
          <Gruppo id="g-adesso" titolo="Adesso" sotto="Qualcuno aspetta te" voci={dati.adesso} />
          <Gruppo id="g-settimana" titolo="Questa settimana" sotto="Da valutare, inviare o iniziare" voci={dati.settimana} />
          <Gruppo id="g-rinnovi" titolo="Rinnovi in arrivo" sotto="Giorni che mancano alla scadenza" voci={dati.rinnovi} rinnovi />
          {!dati.adesso.length && !dati.settimana.length && (
            <p style={{ margin: 0, padding: '20px 0', borderTop: '2px solid var(--inchiostro)', fontSize: 16, color: 'var(--testo-2)' }}>Niente da fare adesso: è tutto in ordine.</p>
          )}
          {dati.attesa.length > 0 && (
            <section aria-label="In attesa del cliente" style={{ display: 'flex', flexDirection: 'column', marginTop: 12 }}>
              <button type="button" aria-expanded={attesaAperta} aria-controls="lista-attesa" onClick={() => setAttesaAperta(!attesaAperta)}
                style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 12px', minHeight: 44, padding: '0 0 10px', background: 'none', border: 'none', borderBottom: '1px solid #C9CAC4', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ fontFamily: 'var(--titoli)', fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--testo-2)' }}>In attesa del cliente</span>
                <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Non serve fare niente finché non rispondono</span>
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--titoli)', fontSize: 18, fontWeight: 600, color: 'var(--tenue)' }} className="numeri">
                  {dati.attesa.length}<span aria-hidden="true" className={`freccia ${attesaAperta ? 'aperta' : ''}`} style={{ margin: 0 }}><IconaGiu size={18} /></span>
                </span>
              </button>
              {attesaAperta && (
                <ul id="lista-attesa" className="voci-dg">
                  {dati.attesa.map((r, i) => (
                    <li key={i}>
                      <Link to={link(r)} className="voce-dg attesa">
                        <span className="quando"><span className="num">{dataIt(r.data).slice(0, 5)}</span><span className="unita">{r.etichetta}</span></span>
                        <span className="testi"><span className="azione">{r.azione}</span><span className="contesto">{r.contesto}</span></span>
                        <IconaFreccia stroke="#9A9DA3" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--tenue)' }}>È tutto per ora.</p>
        </>
      )}
    </>
  );
}
