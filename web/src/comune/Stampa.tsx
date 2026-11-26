// Pagina di stampa: mostra il documento A4 e apre la finestra di stampa (da lì "Salva come PDF").
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useDati } from '../lib/api';
import { Caricamento, ErroreCaricamento } from '../componenti/Base';
import { PreventivoPdf, RicevutaPdf, type DocPreventivo, type DocRicevuta } from '../componenti/Documenti';

export function Stampa() {
  const { tipo, id } = useParams();
  const preventivo = tipo === 'preventivo';
  const { dati, errore } = useDati<DocPreventivo | DocRicevuta>(preventivo ? 'documento_preventivo' : 'documento_ricevuta', preventivo ? { p_preventivo: id } : { p_richiesta: id });
  useEffect(() => {
    if (!dati) return;
    document.title = dati.nomeFile.replace(/\.pdf$/, '');
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [dati]);
  if (errore) return <main className="pagina"><ErroreCaricamento messaggio={errore.message} /></main>;
  if (!dati) return <main className="pagina"><Caricamento /></main>;
  return (
    <div className="stampa">
      <div className="no-stampa" style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: 16 }}>
        <button type="button" className="btn primario" onClick={() => window.print()}>Stampa o salva come PDF</button>
        <button type="button" className="btn" onClick={() => window.close()}>Chiudi</button>
      </div>
      {preventivo ? <PreventivoPdf d={dati as DocPreventivo} /> : <RicevutaPdf d={dati as DocRicevuta} />}
    </div>
  );
}
