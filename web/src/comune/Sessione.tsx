import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { rpc } from '../lib/api';

export type Preferenze = {
  novita: boolean; richieste: 'mie' | 'tutte' | 'nessuna'; preventivi: boolean; scadenze: boolean;
  nuove_richieste: boolean; messaggi: boolean; altre: boolean; frequenza: 'subito' | 'riepilogo';
};
export type Profilo = {
  id: string; ruolo: 'admin' | 'cliente'; nome: string; cognome: string; email: string; attivo: boolean; invito_in_attesa: boolean;
  cliente_id: string | null; cliente_nome: string | null; nome_admin: string; preferenze: Preferenze; da_gestire: number | null;
};

type Stato = {
  pronto: boolean; sessione: Session | null; profilo: Profilo | null; disattivato: boolean;
  aggiorna: () => Promise<void>; esci: () => Promise<void>;
};
const Ctx = createContext<Stato | null>(null);

export function SessioneProvider({ children }: { children: ReactNode }) {
  const [pronto, setPronto] = useState(false);
  const [sessione, setSessione] = useState<Session | null>(null);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [disattivato, setDisattivato] = useState(false);
  const utente = useRef<string | null>(null);

  const carica = useCallback(async (s: Session | null) => {
    setSessione(s);
    if (!s) { setProfilo(null); utente.current = null; setPronto(true); return; }
    try {
      const p = await rpc<Profilo | null>('mio_profilo');
      if (!p || !p.attivo) {
        // account disattivato o senza profilo: niente accesso
        setDisattivato(!!p && !p.attivo);
        await supabase.auth.signOut();
        setProfilo(null);
      } else {
        setDisattivato(false);
        setProfilo(p);
      }
    } catch {
      setProfilo(null);
    } finally {
      setPronto(true);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { utente.current = data.session?.user.id ?? null; void carica(data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'TOKEN_REFRESHED') { setSessione(s); return; }
      if (evento === 'SIGNED_IN' && s?.user.id === utente.current) { setSessione(s); return; }
      utente.current = s?.user.id ?? null;
      // fuori dal callback: Supabase sconsiglia chiamate al database qui dentro
      setTimeout(() => void carica(s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [carica]);

  const aggiorna = useCallback(async () => {
    try { const p = await rpc<Profilo | null>('mio_profilo'); if (p) setProfilo(p); } catch { /* resta quello di prima */ }
  }, []);

  const esci = useCallback(async () => { await supabase.auth.signOut(); }, []);

  return <Ctx.Provider value={{ pronto, sessione, profilo, disattivato, aggiorna, esci }}>{children}</Ctx.Provider>;
}

export function useSessione() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSessione fuori da SessioneProvider');
  return c;
}

/** Il profilo dell'utente collegato (le pagine protette lo hanno sempre). */
export function useIo(): Profilo {
  const { profilo } = useSessione();
  if (!profilo) throw new Error('Utente non collegato');
  return profilo;
}
