// Accesso: login, recupero password, link di accesso via email, email inviata, nuova password, link scaduto.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { rpc } from '../lib/api';
import { AvvisoSolaLettura, Logo } from '../componenti/Base';
import { IconaErrore, IconaLucchetto, IconaPosta } from '../componenti/Icone';
import { useSessione } from '../comune/Sessione';

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const CONTATTO = import.meta.env.VITE_EMAIL_CONTATTO as string | undefined;

function Riquadro({ titolo, sotto = 'Area riservata', children }: { titolo: string; sotto?: string; children: ReactNode }) {
  return (
    <div className="accesso">
      <main className="card">
        <div className="testa">
          <Logo size={56} decorativo />
          <div>
            <h1>{titolo}</h1>
            <p>{sotto}</p>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

function Errore({ testo }: { testo: string | null }) {
  if (!testo) return null;
  return <div role="alert" className="avviso errore"><IconaErrore stroke="#B42318" /><span>{testo}</span></div>;
}

type Schermata = 'login' | 'recupero' | 'magic' | 'inviato' | 'scaduto';

export function Accesso() {
  const { disattivato } = useSessione();
  const [schermata, setSchermata] = useState<Schermata>(() => (/error_code=otp_expired|error=access_denied/.test(window.location.hash) ? 'scaduto' : 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [tipoLink, setTipoLink] = useState<'magic' | 'reset'>('reset');
  const [inviataA, setInviataA] = useState('');
  const [bloccoReinvio, setBloccoReinvio] = useState(false);
  const [infoReinvio, setInfoReinvio] = useState<string | null>(null);

  const vai = (s: Schermata) => { setSchermata(s); setErrore(null); setInfoReinvio(null); if (s === 'magic') setTipoLink('magic'); if (s === 'recupero') setTipoLink('reset'); };

  async function entra(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setErrore('Inserisci email e password.'); return; }
    setOccupato(true); setErrore(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setOccupato(false);
    if (error) setErrore(error.status === 400 || error.status === 401 ? 'Email o password non corretti.' : 'Non siamo riusciti a raggiungere il server. Riprova tra qualche istante.');
  }

  async function inviaLink(e?: FormEvent, reinvio = false) {
    e?.preventDefault();
    const indirizzo = (reinvio ? inviataA : email).trim().toLowerCase();
    if (!EMAIL_OK.test(indirizzo)) { setErrore('Inserisci un indirizzo email valido.'); return; }
    setOccupato(true); setErrore(null);
    const base = window.location.origin;
    const { error } = tipoLink === 'magic'
      ? await supabase.auth.signInWithOtp({ email: indirizzo, options: { shouldCreateUser: false, emailRedirectTo: base + '/' } })
      : await supabase.auth.resetPasswordForEmail(indirizzo, { redirectTo: base + '/nuova-password' });
    setOccupato(false);
    // Per non rivelare quali email esistono, la risposta è sempre la stessa (tranne i problemi di rete o di troppi invii).
    if (error && error.status === 429) { setErrore('Hai chiesto troppi link: riprova tra qualche minuto.'); return; }
    if (error && !error.status) { setErrore('Non siamo riusciti a raggiungere il server. Riprova tra qualche istante.'); return; }
    setInviataA(indirizzo); setSchermata('inviato');
    if (reinvio) {
      setBloccoReinvio(true); setInfoReinvio('Email inviata di nuovo. Puoi chiederne un’altra tra un minuto.');
      window.setTimeout(() => { setBloccoReinvio(false); setInfoReinvio(null); }, 60000);
    }
  }

  if (schermata === 'scaduto') return <LinkScaduto onNuovo={() => vai('recupero')} onLogin={() => { window.history.replaceState(null, '', '/'); vai('login'); }} />;

  if (schermata === 'recupero' || schermata === 'magic') {
    return (
      <Riquadro titolo={schermata === 'magic' ? 'Accedi con un link' : 'Recupera la password'}>
        <p style={{ margin: 0, color: 'var(--testo-2)' }}>
          {schermata === 'magic' ? 'Inserisci la tua email: ti mandiamo un link che ti fa entrare senza password.' : 'Inserisci l’email con cui accedi: ti mandiamo un link per scegliere una nuova password.'}
        </p>
        <Errore testo={errore} />
        <form onSubmit={(e) => void inviaLink(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="campo">
            <label htmlFor="auth-email">Email</label>
            <input id="auth-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrore(null); }} />
          </div>
          <button type="submit" className="btn primario" disabled={occupato}>{occupato ? 'Invio in corso…' : schermata === 'magic' ? 'Invia il link di accesso' : 'Invia il link'}</button>
        </form>
        <button type="button" className="link" style={{ alignSelf: 'center' }} onClick={() => vai('login')}>Torna all’accesso</button>
      </Riquadro>
    );
  }

  if (schermata === 'inviato') {
    return (
      <Riquadro titolo="Controlla la posta">
        <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
          <span style={{ width: 52, height: 52, borderRadius: '50%', background: '#E3EDFC', color: '#1D4E9E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconaPosta size={24} /></span>
          <p style={{ margin: 0, color: 'var(--testo-2)' }}>Se {inviataA} corrisponde a un account attivo, tra poco ricevi un’email con il link {tipoLink === 'magic' ? 'per entrare.' : 'per scegliere la nuova password.'}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--tenue)' }}>Il link vale un’ora. Se non la trovi, guarda anche nella posta indesiderata.</p>
        </div>
        {infoReinvio && <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--ok-testo)', textAlign: 'center' }}>{infoReinvio}</p>}
        <Errore testo={errore} />
        <button type="button" className="btn" disabled={bloccoReinvio || occupato} onClick={() => void inviaLink(undefined, true)}>Invia di nuovo</button>
        <button type="button" className="link" style={{ alignSelf: 'center' }} onClick={() => vai('login')}>Torna all’accesso</button>
      </Riquadro>
    );
  }

  return (
    <Riquadro titolo="Gestione progetti">
      {disattivato && (
        <div role="alert" className="avviso info" style={{ color: 'var(--testo)', gap: 12 }}>
          <IconaLucchetto stroke="#6A6E75" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <strong>Account disattivato</strong>
            <span style={{ color: 'var(--testo-2)' }}>Il tuo accesso è stato disattivato. Se pensi sia un errore, {CONTATTO ? `scrivi a ${CONTATTO}` : 'contatta chi ti ha invitato'}.</span>
          </div>
        </div>
      )}
      <Errore testo={errore} />
      <form onSubmit={(e) => void entra(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="campo">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setErrore(null); }} />
        </div>
        <div className="campo">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <label htmlFor="login-pass">Password</label>
            <button type="button" className="link" style={{ fontSize: 13, margin: '-10px 0' }} onClick={() => vai('recupero')}>Password dimenticata?</button>
          </div>
          <input id="login-pass" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setErrore(null); }} />
        </div>
        <button type="submit" className="btn primario" disabled={occupato}>{occupato ? 'Accesso in corso…' : 'Accedi'}</button>
      </form>
      <div aria-hidden="true" className="oppure">oppure</div>
      <button type="button" className="btn" onClick={() => vai('magic')}><IconaPosta />Ricevi un link di accesso via email</button>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--tenue)', textAlign: 'center' }}>L’accesso è solo su invito: se non hai un account, chiedilo a chi segue il tuo progetto.</p>
    </Riquadro>
  );
}

function LinkScaduto({ onNuovo, onLogin }: { onNuovo: () => void; onLogin: () => void }) {
  return (
    <Riquadro titolo="Link non più valido">
      <AvvisoSolaLettura>Questo link non è più valido: è scaduto oppure è già stato usato. Per sicurezza ogni link funziona una volta sola.</AvvisoSolaLettura>
      <button type="button" className="btn primario" onClick={onNuovo}>Chiedi un nuovo link</button>
      <button type="button" className="link" style={{ alignSelf: 'center' }} onClick={onLogin}>Torna all’accesso</button>
    </Riquadro>
  );
}

/** Dal link dell'invito o del recupero: si arriva qui già collegati e si sceglie la password. */
export function NuovaPassword() {
  const { sessione, profilo, pronto, aggiorna } = useSessione();
  const [params] = useSearchParams();
  const naviga = useNavigate();
  const invito = params.get('modo') === 'invito' || !!profilo?.invito_in_attesa;
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [mostra, setMostra] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);
  const [attesa, setAttesa] = useState(true);

  // lo scambio del codice del link avviene appena caricata la pagina: aspetto un attimo prima di dire che il link non vale
  useEffect(() => { const t = window.setTimeout(() => setAttesa(false), 2500); return () => window.clearTimeout(t); }, []);

  if (/error_code=|error=access_denied/.test(window.location.hash) || (pronto && !attesa && !sessione)) {
    return <LinkScaduto onNuovo={() => naviga('/accesso')} onLogin={() => naviga('/accesso')} />;
  }
  if (!sessione || !profilo) return <Riquadro titolo="Un momento…"><p role="status" style={{ margin: 0, color: 'var(--tenue)' }}>Sto controllando il link…</p></Riquadro>;

  async function salva(e: FormEvent) {
    e.preventDefault();
    if (pw1.length < 10) { setErrore('La password deve avere almeno 10 caratteri.'); return; }
    if (pw1 !== pw2) { setErrore('Le due password non coincidono.'); return; }
    setOccupato(true); setErrore(null);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) {
      setOccupato(false);
      setErrore(error.message.includes('different') ? 'Scegli una password diversa da quella di prima.' : 'Non è stato possibile salvare la password. Riprova tra qualche istante.');
      return;
    }
    if (invito) { try { await rpc('conferma_invito'); } catch { /* il profilo si aggiorna al prossimo accesso */ } }
    await aggiorna();
    naviga('/', { replace: true, state: { toast: invito ? 'Password creata: benvenuto in Gestione progetti' : 'Password aggiornata' } });
  }

  return (
    <Riquadro titolo={invito ? 'Crea la tua password' : 'Scegli una nuova password'}>
      <p style={{ margin: 0, color: 'var(--testo-2)' }}>
        {invito ? `Ciao ${profilo.nome}, scegli la password che userai per entrare e seguire i progetti di ${profilo.cliente_nome ?? 'un cliente'}.` : `Account: ${profilo.email}.`}
      </p>
      <Errore testo={errore} />
      <form onSubmit={(e) => void salva(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="campo">
          <label htmlFor="pw-nuova">Nuova password</label>
          <input id="pw-nuova" className="input" type={mostra ? 'text' : 'password'} autoComplete="new-password" value={pw1} onChange={(e) => { setPw1(e.target.value); setErrore(null); }} />
          <span className="aiuto">Almeno 10 caratteri. Una frase che ricordi è più sicura di una parola sola.</span>
        </div>
        <div className="campo">
          <label htmlFor="pw-ripeti">Ripeti la password</label>
          <input id="pw-ripeti" className="input" type={mostra ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => { setPw2(e.target.value); setErrore(null); }} />
        </div>
        <label className="spunta" style={{ alignItems: 'center' }}><input type="checkbox" checked={mostra} onChange={(e) => setMostra(e.target.checked)} style={{ margin: 0 }} />Mostra le password</label>
        <button type="submit" className="btn primario" disabled={occupato}>{occupato ? 'Salvataggio…' : invito ? 'Crea la password ed entra' : 'Salva ed entra'}</button>
      </form>
    </Riquadro>
  );
}
