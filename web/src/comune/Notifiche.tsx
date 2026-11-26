// Preferenze delle email, diverse per admin e cliente.
import { useState, type ReactNode } from 'react';
import { useAzione } from '../lib/api';
import { AvvisoRegola, ErroreRete } from '../componenti/Base';
import { TitoloPagina } from './Layout';
import { useIo, useSessione, type Preferenze } from './Sessione';
import { useToast } from './Toast';

const gruppo: React.CSSProperties = { border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 };
const legenda: React.CSSProperties = { fontFamily: 'var(--titoli)', fontSize: 17, fontWeight: 600, color: 'var(--inchiostro)', padding: 0, marginBottom: 6 };

function Casella({ on, onCambia, titolo, testo }: { on: boolean; onCambia: (v: boolean) => void; titolo: string; testo: string }) {
  return (
    <label className="spunta"><input type="checkbox" checked={on} onChange={(e) => onCambia(e.target.checked)} />
      <span className="testi"><strong>{titolo}</strong><span>{testo}</span></span></label>
  );
}
function Scelta({ nome, on, onScegli, children }: { nome: string; on: boolean; onScegli: () => void; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, cursor: 'pointer' }}>
      <input type="radio" name={nome} checked={on} onChange={onScegli} style={{ width: 18, height: 18, margin: 0, flexShrink: 0 }} />{children}
    </label>
  );
}

export function Notifiche() {
  const io = useIo(); const { aggiorna } = useSessione();
  const [p, setP] = useState<Preferenze>(io.preferenze);
  const az = useAzione(); const toast = useToast();
  const set = (x: Partial<Preferenze>) => setP({ ...p, ...x });
  const admin = io.ruolo === 'admin';
  async function salva() {
    const r = await az.esegui('salva_preferenze', { p });
    if (r) { toast(r.messaggio); void aggiorna(); }
  }
  return (
    <>
      <TitoloPagina titolo="Notifiche email" sotto={`Le email arrivano a ${io.email}.`} />
      <div className="sez" style={{ paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {admin ? (
          <fieldset style={gruppo}><legend style={legenda}>Cosa ricevere</legend>
            <Casella on={p.nuove_richieste} onCambia={(v) => set({ nuove_richieste: v })} titolo="Nuove richieste" testo="Da qualsiasi cliente." />
            <Casella on={p.messaggi} onCambia={(v) => set({ messaggi: v })} titolo="Messaggi dei clienti" testo="Quando un referente scrive in una richiesta." />
            <Casella on={p.preventivi} onCambia={(v) => set({ preventivi: v })} titolo="Risposte ai preventivi" testo="Accettati, rifiutati o con modifiche richieste." />
            <Casella on={p.altre} onCambia={(v) => set({ altre: v })} titolo="Richieste modificate o ritirate" testo="Quando un referente cambia o ritira una richiesta ancora “Nuova”." />
          </fieldset>
        ) : (
          <>
            <fieldset style={gruppo}><legend style={legenda}>Cosa ricevere</legend>
              <Casella on={p.novita} onCambia={(v) => set({ novita: v })} titolo="Novità pubblicate" testo={`Quando ${io.nome_admin} pubblica un aggiornamento su uno dei tuoi progetti.`} />
              <Casella on={p.preventivi} onCambia={(v) => set({ preventivi: v })} titolo="Preventivi e ricevute" testo={`Per tutte le richieste di ${io.cliente_nome}, anche quelle aperte da altri.`} />
              <Casella on={p.scadenze} onCambia={(v) => set({ scadenze: v })} titolo="Rinnovi in scadenza" testo="Dominio, hosting e account degli store, 30 giorni prima della scadenza." />
            </fieldset>
            <fieldset style={gruppo}><legend style={legenda}>Messaggi e cambi di stato delle richieste</legend>
              <Scelta nome="pref-rich" on={p.richieste === 'mie'} onScegli={() => set({ richieste: 'mie' })}>Solo per le richieste che apro io</Scelta>
              <Scelta nome="pref-rich" on={p.richieste === 'tutte'} onScegli={() => set({ richieste: 'tutte' })}>Per tutte le richieste di {io.cliente_nome}</Scelta>
              <Scelta nome="pref-rich" on={p.richieste === 'nessuna'} onScegli={() => set({ richieste: 'nessuna' })}>Nessuna email: controllo io nel portale</Scelta>
            </fieldset>
          </>
        )}
        <fieldset style={gruppo}><legend style={legenda}>Quando</legend>
          <Scelta nome="pref-freq" on={p.frequenza !== 'riepilogo'} onScegli={() => set({ frequenza: 'subito' })}>Subito, una email per ogni aggiornamento</Scelta>
          <Scelta nome="pref-freq" on={p.frequenza === 'riepilogo'} onScegli={() => set({ frequenza: 'riepilogo' })}>Un riepilogo al giorno, alle 18:00</Scelta>
        </fieldset>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--tenue)' }}>Le email per entrare nel portale (inviti, recupero password e link di accesso) arrivano sempre e subito.</p>
        {az.erroreRete && <ErroreRete onChiudi={az.pulisci} />}
        <AvvisoRegola testo={az.errore} />
        <div><button type="button" className="btn primario" disabled={az.occupato} onClick={() => void salva()}>{az.occupato ? 'Salvataggio…' : 'Salva preferenze'}</button></div>
      </div>
    </>
  );
}
