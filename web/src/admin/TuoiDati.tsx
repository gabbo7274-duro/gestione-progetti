// Admin · i tuoi dati (prestatore): intestazione di preventivi e ricevute, con anteprima.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAzione } from '../lib/api';
import { AvvisoRegola, Caricamento, ErroreRete, Logo } from '../componenti/Base';
import { TitoloPagina } from '../comune/Layout';
import { useToast } from '../comune/Toast';

type Prestatore = { nome: string; indirizzo: string; cap: string; citta: string; cf: string; piva: string; email: string };

export function TuoiDati() {
  const [params] = useSearchParams();
  const ritorno = params.get('ritorno');
  const [f, setF] = useState<Prestatore | null>(null);
  const az = useAzione(); const toast = useToast(); const naviga = useNavigate();

  useEffect(() => {
    void supabase.from('prestatore').select('nome, indirizzo, cap, citta, cf, piva, email').single().then(({ data }) => setF(data ?? { nome: '', indirizzo: '', cap: '', citta: '', cf: '', piva: '', email: '' }));
  }, []);
  if (!f) return <Caricamento />;

  const completo = !!(f.nome && f.indirizzo && f.cap && f.citta && f.cf);
  const set = (k: keyof Prestatore) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); az.pulisci(); };
  async function salva() {
    const r = await az.esegui('salva_prestatore', { p_nome: f!.nome, p_indirizzo: f!.indirizzo, p_cap: f!.cap, p_citta: f!.citta, p_cf: f!.cf, p_piva: f!.piva, p_email: f!.email });
    if (!r) return;
    if (ritorno) naviga(`/richieste/${ritorno}?sezione=pagamento&registra=1`, { state: { toast: 'Dati salvati: ora puoi creare la ricevuta' } });
    else toast(r.messaggio);
  }
  // anteprima: come nell'intestazione dei documenti, con i segnaposto dove manca un dato
  const ind = f.indirizzo ? `${f.indirizzo}, ${f.cap ? f.cap + ' ' : ''}${f.citta}` : '[INDIRIZZO, CAP CITTÀ]';

  return (
    <>
      <TitoloPagina titolo="I tuoi dati" sotto="Compaiono nell’intestazione di preventivi e ricevute.">
        {!completo && <span className="segnale" style={{ whiteSpace: 'normal' }}>Da completare: servono per creare le ricevute</span>}
      </TitoloPagina>
      {ritorno && <p role="note" className="avviso nota" style={{ margin: 0 }}>Quando salvi torni alla richiesta e puoi creare la ricevuta.</p>}
      <div className="sez" style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="campo"><label htmlFor="td-nome">Nome e cognome</label><input id="td-nome" className="input" value={f.nome} onChange={set('nome')} autoComplete="name" /></div>
        <div className="campi">
          <div className="campo" style={{ flex: '2 1 280px' }}><label htmlFor="td-indirizzo">Indirizzo</label><input id="td-indirizzo" className="input" value={f.indirizzo} onChange={set('indirizzo')} placeholder="Via e numero civico" autoComplete="street-address" /></div>
          <div className="campo" style={{ flex: '1 1 100px' }}><label htmlFor="td-cap">CAP</label><input id="td-cap" className="input" inputMode="numeric" maxLength={5} value={f.cap} onChange={set('cap')} autoComplete="postal-code" /></div>
          <div className="campo" style={{ flex: '2 1 220px' }}><label htmlFor="td-citta">Città e provincia</label><input id="td-citta" className="input" value={f.citta} onChange={set('citta')} placeholder="Es. Vicenza (VI)" /></div>
        </div>
        <div className="campi">
          <div className="campo"><label htmlFor="td-cf">Codice fiscale</label><input id="td-cf" className="input" maxLength={16} value={f.cf} onChange={set('cf')} style={{ textTransform: 'uppercase' }} /></div>
          <div className="campo"><label htmlFor="td-piva">Partita IVA (facoltativa)</label><input id="td-piva" className="input numeri" inputMode="numeric" maxLength={11} value={f.piva} onChange={set('piva')} />
            <span className="aiuto">Lasciala vuota finché lavori con prestazioni occasionali: serve solo per i preventivi normali.</span></div>
        </div>
        <div className="campo"><label htmlFor="td-email">Email nei documenti</label><input id="td-email" className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>
        {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
        <AvvisoRegola testo={az.errore} />
        <div><button type="button" className="btn primario" disabled={az.occupato} onClick={() => void salva()}>{az.occupato ? 'Salvataggio…' : 'Salva i tuoi dati'}</button></div>
      </div>
      <section aria-labelledby="td-anteprima" className="sez" style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 id="td-anteprima" className="h2">Come compaiono nei documenti</h2>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '20px 24px', background: '#fff', border: '1px solid var(--bordo-card)', borderRadius: 10, fontSize: 13 }}>
          <Logo size={36} decorativo />
          <div style={{ display: 'flex', flexDirection: 'column', color: 'var(--testo-2)' }}>
            <strong style={{ fontSize: 14, color: 'var(--inchiostro)' }}>{f.nome || '[NOME E COGNOME]'}</strong>
            <span>{ind}</span>
            <span>{f.cf ? 'C.F. ' + f.cf.toUpperCase() : 'C.F. [CODICE FISCALE]'}</span>
            {f.piva && <span>P.IVA {f.piva}</span>}
            <span>{f.email}</span>
          </div>
        </div>
        <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Preventivi inviati e ricevute emesse restano con i dati del giorno in cui li hai creati.</span>
      </section>
    </>
  );
}
