// Riepilogo del preventivo e documenti A4 (preventivo e ricevuta). Ricevono i dati già pronti dal database.
import { Logo } from './Base';

export type Riga = { label: string; value: string; kind: 'riga' | 'sub' | 'tot' };
export type VistaPreventivo = {
  voci: { descr: string; ore: string; importo: string }[];
  spese: { descr: string; importo: string }[];
  totali: Riga[]; noteFiscali: string[]; consegna: string; validita: string; note: string;
};

const stileRiga = (k: Riga['kind'], ricevuta = false): React.CSSProperties => {
  const b: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 16 };
  if (k === 'sub') return { ...b, color: '#1C1F26', fontWeight: 600, borderTop: '1px dashed #D6D6D0', paddingTop: 6 };
  if (k === 'tot') return { ...b, borderTop: ricevuta ? '2px solid #14213D' : '1px solid #D3D3CC', paddingTop: 8, marginTop: 2, fontSize: 16, fontWeight: 700, color: ricevuta ? '#14213D' : '#1C1F26' };
  return { ...b, color: '#3D4048' };
};

export function Totali({ righe, ricevuta = false }: { righe: Riga[]; ricevuta?: boolean }) {
  return (
    <div style={{ alignSelf: 'flex-end', width: '100%', maxWidth: 380, marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: ricevuta ? 8 : 6 }}>
      {righe.map((t, i) => (
        <div key={i} style={stileRiga(t.kind, ricevuta)}><span>{t.label}</span><span className="numeri" style={{ whiteSpace: 'nowrap' }}>{t.value}</span></div>
      ))}
    </div>
  );
}

const testaTabella: React.CSSProperties = { display: 'flex', gap: 12, padding: '8px 12px', background: '#F8F9FA', fontSize: 12, fontWeight: 600, color: '#5B6470', textTransform: 'uppercase', letterSpacing: '0.04em' };
const rigaTabella: React.CSSProperties = { display: 'flex', gap: 12, padding: '10px 12px', borderTop: '1px solid #EEF0F2', alignItems: 'baseline' };

export function PreventivoRiepilogo({ dati }: { dati: VistaPreventivo }) {
  return (
    <div style={{ color: '#1B1F24', fontSize: 14, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ border: '1px solid #E3E5E8', borderRadius: 8, overflow: 'hidden' }}>
        <div aria-hidden="true" style={testaTabella}><span style={{ flex: '1 1 auto' }}>Attività</span><span style={{ width: 64, textAlign: 'right' }}>Ore</span><span style={{ width: 100, textAlign: 'right' }}>Importo</span></div>
        {dati.voci.map((v, i) => (
          <div key={i} style={rigaTabella}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>{v.descr}</span>
            <span className="numeri" style={{ width: 64, textAlign: 'right', flexShrink: 0, color: '#3D4550' }}>{v.ore}</span>
            <span className="numeri" style={{ width: 100, textAlign: 'right', flexShrink: 0 }}>{v.importo}</span>
          </div>
        ))}
      </div>
      {dati.spese.length > 0 && (
        <div style={{ border: '1px solid #E3E5E8', borderRadius: 8, overflow: 'hidden' }}>
          <div aria-hidden="true" style={testaTabella}><span style={{ flex: '1 1 auto' }}>Spese</span><span style={{ width: 100, textAlign: 'right' }}>Importo</span></div>
          {dati.spese.map((x, i) => (
            <div key={i} style={rigaTabella}>
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>{x.descr}</span>
              <span className="numeri" style={{ width: 100, textAlign: 'right', flexShrink: 0 }}>{x.importo}</span>
            </div>
          ))}
        </div>
      )}
      <Totali righe={dati.totali} />
      {dati.noteFiscali.map((n, i) => <span key={i} style={{ fontSize: 12, color: '#5B6470' }}>{n}</span>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, color: '#5B6470' }}>
        <span>{dati.consegna}</span>
        <span>{dati.validita}</span>
      </div>
      {dati.note && <div style={{ background: '#F5F6F7', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: '#3D4550', whiteSpace: 'pre-line' }}>{dati.note}</div>}
    </div>
  );
}

const etichettaDoc: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5B6470', textTransform: 'uppercase', letterSpacing: '0.06em' };
const foglio: React.CSSProperties = { width: '100%', maxWidth: 794, minHeight: 1123, padding: '56px 60px', background: '#FFFFFF', color: '#1B1F24', fontSize: 13,
  lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 28, boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)', margin: '0 auto' };

export type DocPreventivo = VistaPreventivo & {
  prestNome: string; prestIndirizzo: string; prestCf: string; prestPiva: string; prestEmail: string;
  numero: string; versione: string; data: string; scadenza: string; isOcc: boolean; isNorm: boolean;
  clienteNome: string; clienteCitta: string; attenzione: string; oggetto: string; hasAccettazione: boolean; accettazione: string;
  nomeFile: string; mancaNelPdf?: string | null;
};

export function PreventivoPdf({ d }: { d: DocPreventivo }) {
  return (
    <div className="foglio" style={foglio}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Logo size={44} decorativo />
          <div style={{ display: 'flex', flexDirection: 'column', color: '#3D4550' }}>
            <strong style={{ fontSize: 15, color: '#14213D' }}>{d.prestNome}</strong>
            <span>{d.prestIndirizzo}</span><span>{d.prestCf}</span>{d.isNorm && <span>{d.prestPiva}</span>}<span>{d.prestEmail}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, color: '#3D4550' }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.06em', color: '#14213D' }}>PREVENTIVO</span>
          <span style={{ fontWeight: 600, color: '#1B1F24' }}>{d.numero}</span>
          <span>{d.versione}</span><span>Data: {d.data}</span><span>Valido fino al: {d.scadenza}</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, borderTop: '2px solid #14213D', paddingTop: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={etichettaDoc}>Spett.le</span>
          <strong style={{ fontSize: 14 }}>{d.clienteNome}</strong>
          <span style={{ color: '#3D4550' }}>{d.clienteCitta}</span><span style={{ color: '#3D4550' }}>{d.attenzione}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 320, textAlign: 'right' }}>
          <span style={etichettaDoc}>Oggetto</span>
          <span style={{ fontWeight: 600 }}>{d.oggetto}</span>
        </div>
      </div>
      <PreventivoRiepilogo dati={d} />
      {d.isOcc && <p style={{ margin: 0, fontSize: 12, color: '#3D4550' }}>La prestazione è resa in forma di lavoro autonomo occasionale (art. 2222 c.c.), senza vincolo di subordinazione e senza carattere di abitualità.</p>}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', gap: 40, paddingTop: 24 }}>
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span style={etichettaDoc}>Il prestatore</span>
          <span style={{ borderTop: '1px solid #8A929C', paddingTop: 6 }}>{d.prestNome}</span>
        </div>
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span style={etichettaDoc}>Per accettazione</span>
          {d.hasAccettazione
            ? <span style={{ borderTop: '1px solid #8A929C', paddingTop: 6, color: '#1C6631', fontWeight: 600 }}>{d.accettazione}</span>
            : <span style={{ borderTop: '1px solid #8A929C', paddingTop: 6, color: '#5B6470' }}>Timbro e firma del cliente</span>}
        </div>
      </div>
    </div>
  );
}

export type DocRicevuta = {
  prestNome: string; prestIndirizzo: string; prestCf: string; prestEmail: string; numero: string; data: string; hasBollo: boolean;
  clienteNome: string; clienteCitta: string; clienteFiscale: string; oggetto: string; rifPv: string; voci: { descr: string }[];
  righe: Riga[]; pagamento: string; dichiarazioni: string[]; luogoData: string; nomeFile: string;
};

export function RicevutaPdf({ d }: { d: DocRicevuta }) {
  const et: React.CSSProperties = { ...etichettaDoc, color: '#6A6E75' };
  return (
    <div className="foglio" style={{ ...foglio, color: '#1C1F26', gap: 26 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Logo size={44} decorativo />
          <div style={{ display: 'flex', flexDirection: 'column', color: '#3D4048' }}>
            <strong style={{ fontSize: 15, color: '#14213D' }}>{d.prestNome}</strong>
            <span>{d.prestIndirizzo}</span><span>{d.prestCf}</span><span>{d.prestEmail}</span>
          </div>
        </div>
        {d.hasBollo && (
          <div style={{ width: 96, height: 112, flexShrink: 0, border: '1.5px dashed #9A9DA3', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            textAlign: 'center', fontSize: 11, color: '#6A6E75', padding: 8 }}>Marca da bollo da 2,00 €</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '2px solid #14213D', paddingTop: 18 }}>
        <span style={{ fontFamily: 'var(--titoli)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: '#14213D' }}>Ricevuta per prestazione occasionale</span>
        <span style={{ fontSize: 14, color: '#3D4048' }}><strong style={{ color: '#1C1F26' }}>{d.numero}</strong> · data {d.data}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 200 }}>
          <span style={et}>Committente</span>
          <strong style={{ fontSize: 14 }}>{d.clienteNome}</strong>
          <span style={{ color: '#3D4048' }}>{d.clienteCitta}</span><span style={{ color: '#3D4048' }}>{d.clienteFiscale}</span>
        </div>
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: 200 }}>
          <span style={et}>Oggetto</span>
          <span style={{ fontWeight: 600 }}>{d.oggetto}</span>
          <span style={{ color: '#3D4048' }}>{d.rifPv}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={et}>Attività svolte</span>
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>{d.voci.map((v, i) => <li key={i}>{v.descr}</li>)}</ul>
      </div>
      <div style={{ fontSize: 14 }}><Totali righe={d.righe} ricevuta /></div>
      <p style={{ margin: 0, fontSize: 14 }}>{d.pagamento}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #E6E6E0', paddingTop: 14, fontSize: 12, color: '#3D4048' }}>
        {d.dichiarazioni.map((x, i) => <p key={i} style={{ margin: 0 }}>{x}</p>)}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 40, paddingTop: 24 }}>
        <span style={{ color: '#3D4048' }}>{d.luogoData}</span>
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 28 }}>
          <span style={et}>Firma del prestatore</span>
          <span style={{ borderTop: '1px solid #9A9DA3', paddingTop: 6 }}>{d.prestNome}</span>
        </div>
      </div>
    </div>
  );
}
