// Componenti del design: Logo, StatoBadge, TestoFormattato, avvisi, finestre, righe che si aprono.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconaErrore, IconaGiu, IconaLucchetto } from './Icone';

/** Logo: "size" è l'altezza; la larghezza segue le proporzioni del disegno (95 × 82). */
export function Logo({ size = 64, decorativo = false }: { size?: number; decorativo?: boolean }) {
  return <img src="/logo.svg" alt={decorativo ? '' : 'Gestione progetti'} width={Math.round((size * 95) / 82)} height={size} style={{ display: 'block', flexShrink: 0 }} />;
}

// ── StatoBadge ───────────────────────────────────────────────
const STILI: Record<string, { label: string; bg: string; fg: string; dot: string | null; border?: string; weight?: number }> = {
  nuova: { label: 'Nuova', bg: '#E3EDFC', fg: '#1D4E9E', dot: '#2F6FD6' },
  accettata: { label: 'Accettata', bg: '#EEE9FB', fg: '#563A9E', dot: '#7A5BD0' },
  in_lavorazione: { label: 'In lavorazione', bg: '#FDF0D9', fg: '#7F4D00', dot: '#D98A00' },
  fatta: { label: 'Fatta', bg: '#E2F3E6', fg: '#1C6631', dot: '#2E9447' },
  rifiutata: { label: 'Rifiutata', bg: '#FBE6E4', fg: '#9E2219', dot: '#D23B2F' },
  ritirata: { label: 'Ritirata', bg: 'transparent', fg: '#5B6470', dot: null, border: '#D5D8DC', weight: 500 },
  bozza: { label: 'Bozza', bg: '#F0F1F3', fg: '#3D4550', dot: '#8A929C' },
  pubblicata: { label: 'Pubblicata', bg: '#DFF2F1', fg: '#0D625D', dot: '#1A9A92' },
  inviato: { label: 'Inviato', bg: '#DFF2F1', fg: '#0D625D', dot: '#1A9A92' },
  accettato: { label: 'Accettato', bg: '#E2F3E6', fg: '#1C6631', dot: '#2E9447' },
  modifiche: { label: 'Modifiche richieste', bg: '#FDF0D9', fg: '#7F4D00', dot: '#D98A00' },
  rifiutato: { label: 'Rifiutato', bg: '#FBE6E4', fg: '#9E2219', dot: '#D23B2F' },
  scaduto: { label: 'Scaduto', bg: 'transparent', fg: '#5B6470', dot: null, border: '#D5D8DC', weight: 500 },
};
export const NOMI_STATO: Record<string, string> = Object.fromEntries(Object.entries(STILI).map(([k, v]) => [k, v.label]));

export function StatoBadge({ stato }: { stato: string }) {
  const s = STILI[stato] ?? STILI.nuova;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 999, whiteSpace: 'nowrap', lineHeight: 1,
      fontSize: 12.5, fontWeight: s.weight ?? 600, background: s.bg, color: s.fg, border: `1px solid ${s.border ?? 'transparent'}`, flexShrink: 0 }}>
      {s.dot && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />}
      {s.label}
    </span>
  );
}

export function TagTipo({ tipo }: { tipo: string }) {
  return <span className={`tag ${tipo === 'errore' ? 'errore' : 'funzione'}`}>{tipo === 'errore' ? 'Errore' : 'Nuova funzione'}</span>;
}

export function TagGaranzia({ g }: { g: 'si' | 'no' | null | undefined }) {
  if (!g) return null;
  return <span className={`tag garanzia-${g}`}>{g === 'si' ? 'In garanzia' : 'Fuori garanzia'}</span>;
}

// ── TestoFormattato ──────────────────────────────────────────
// Formato ammesso: paragrafi (separati da riga vuota), elenchi puntati ("- "), **grassetto**, [testo](https://link).
function segmenti(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={k++} style={{ fontWeight: 700, color: '#1B1F24' }}>{m[1]}</strong>);
    else {
      const href = /^(https?:|mailto:)/i.test(m[3]) ? m[3] : '#';
      out.push(<a key={k++} href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#14213D', textDecoration: 'underline', textUnderlineOffset: 2 }}>{m[2]}</a>);
    }
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function TestoFormattato({ testo }: { testo: string }) {
  const blocchi: ReactNode[] = [];
  let para: string[] = []; let lista: string[] | null = null;
  const chiudiP = () => { if (para.length) { blocchi.push(<p key={blocchi.length} style={{ margin: 0 }}>{segmenti(para.join(' '))}</p>); para = []; } };
  const chiudiL = () => {
    if (lista) {
      const voci = lista;
      blocchi.push(<ul key={blocchi.length} style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 4 }}>{voci.map((v, i) => <li key={i}>{segmenti(v)}</li>)}</ul>);
      lista = null;
    }
  };
  String(testo || '').split('\n').forEach((raw) => {
    const l = raw.trim();
    if (!l) { chiudiP(); chiudiL(); return; }
    if (/^[-*] /.test(l)) { chiudiP(); (lista ??= []).push(l.slice(2)); } else { chiudiL(); para.push(l); }
  });
  chiudiP(); chiudiL();
  return <div style={{ color: '#2A3038', fontSize: 15, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10, overflowWrap: 'anywhere' }}>{blocchi}</div>;
}

// ── Avvisi ───────────────────────────────────────────────────
export function ErroreRete({ onChiudi }: { onChiudi?: () => void }) {
  return (
    <div role="alert" className="avviso errore" style={{ padding: '12px 16px', gap: 12 }}>
      <IconaErrore stroke="#B42318" />
      <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <strong>Salvataggio non riuscito</strong>
        <span>Non siamo riusciti a raggiungere il server. Quello che hai scritto è ancora qui: riprova tra qualche istante.</span>
      </div>
      {onChiudi && <button type="button" className="chiudi" onClick={onChiudi} aria-label="Chiudi messaggio">×</button>}
    </div>
  );
}

export function AvvisoRegola({ testo }: { testo: string | null | undefined }) {
  if (!testo) return null;
  return (
    <div role="alert" className="avviso attenzione">
      <IconaErrore size={18} stroke="#9A6200" />
      <span>{testo}</span>
    </div>
  );
}

export function AvvisoSolaLettura({ children }: { children: ReactNode }) {
  return (
    <div className="avviso info" style={{ alignItems: 'center' }}>
      <IconaLucchetto stroke="#6A6E75" />
      <span>{children}</span>
    </div>
  );
}

export function Caricamento() {
  return (
    <div aria-busy="true" className="scheletro">
      <span role="status" style={{ fontSize: 13, color: '#6A6E75' }}>Caricamento in corso…</span>
      {[55, 45].map((w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="barra" style={{ width: `${w}%` }} />
          <div className="barra b" style={{ width: `${w - 20}%` }} />
        </div>
      ))}
    </div>
  );
}

export function ErroreCaricamento({ messaggio, onRiprova }: { messaggio: string; onRiprova?: () => void }) {
  return (
    <div role="alert" className="avviso errore">
      <IconaErrore stroke="#B42318" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span>{messaggio}</span>
        {onRiprova && <button type="button" className="btn piccolo" style={{ alignSelf: 'flex-start' }} onClick={onRiprova}>Riprova</button>}
      </div>
    </div>
  );
}

export function Vuoto({ titolo, testo, icona = false }: { titolo: string; testo?: string; icona?: boolean }) {
  return (
    <div className="vuoto">
      {icona && <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9A9DA3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l2.5-7h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></svg>}
      <strong>{titolo}</strong>
      {testo && <span>{testo}</span>}
    </div>
  );
}

// ── Finestra (modale) ────────────────────────────────────────
export function Finestra({ titolo, onChiudi, larghezza, children }: { titolo: ReactNode; onChiudi: () => void; larghezza?: 'media' | 'larga'; children: ReactNode }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prima = document.activeElement as HTMLElement | null;
    const primo = box.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-chiudi])');
    (primo ?? box.current)?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onChiudi(); };
    document.addEventListener('keydown', esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = overflow; prima?.focus(); };
  }, [onChiudi]);
  return (
    <div className="velo" onMouseDown={(e) => { if (e.target === e.currentTarget) onChiudi(); }}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`finestra ${larghezza ?? ''}`}>
        <h2 id={id}>{titolo}</h2>
        {children}
      </div>
    </div>
  );
}

// ── Sezione che si apre ──────────────────────────────────────
export function Apribile({ titolo, aperto, onCambia, riassunto, conta, extra, children, id, bordo = true }: {
  titolo: ReactNode; aperto: boolean; onCambia: (v: boolean) => void; riassunto?: ReactNode; conta?: number | string;
  extra?: ReactNode; children: ReactNode; id: string; bordo?: boolean;
}) {
  return (
    <section className={bordo ? 'sez' : undefined}>
      <h2 className="h2" style={{ margin: 0 }}>
        <button type="button" className="apribile" aria-expanded={aperto} aria-controls={id} onClick={() => onCambia(!aperto)}>
          <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{titolo}</span>
          {conta !== undefined && conta !== 0 && <span className="conta">{conta}</span>}
          {extra}
          {riassunto !== undefined && <span className="riassunto">{riassunto}</span>}
          <span aria-hidden="true" className={`freccia ${aperto ? 'aperta' : ''}`}><IconaGiu /></span>
        </button>
      </h2>
      {aperto && <div id={id} className="pannello">{children}</div>}
    </section>
  );
}
