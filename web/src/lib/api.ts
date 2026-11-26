import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

// Due tipi di errore, come nel design:
// - "regola": il database ha rifiutato l'azione con un messaggio da mostrare (avviso giallo vicino al pulsante)
// - "rete": non si è raggiunto il server (banner rosso "Salvataggio non riuscito", quello scritto resta)
export class ErroreApp extends Error {
  constructor(message: string, public tipo: 'regola' | 'rete') {
    super(message);
  }
}

const MSG_RETE = 'Non siamo riusciti a raggiungere il server. Quello che hai scritto è ancora qui: riprova tra qualche istante.';

export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  let risposta;
  try {
    risposta = await supabase.rpc(fn, args ?? {});
  } catch {
    throw new ErroreApp(MSG_RETE, 'rete');
  }
  const { data, error } = risposta;
  if (error) {
    if (error.code === 'P0001') throw new ErroreApp(error.message, 'regola');
    if (error.code === 'PGRST301' || error.message?.includes('JWT')) throw new ErroreApp('La sessione è scaduta: entra di nuovo nel portale.', 'regola');
    console.error(fn, error);
    throw new ErroreApp(MSG_RETE, 'rete');
  }
  return data as T;
}

export type RispostaAzione = { messaggio?: string; id?: string; file_tolti?: string[]; [k: string]: unknown };

/** Legge i dati di una schermata e li rilegge quando cambiano gli argomenti o si chiama ricarica(). */
export function useDati<T>(fn: string | null, args?: Record<string, unknown>) {
  const [dati, setDati] = useState<T | null>(null);
  const [errore, setErrore] = useState<ErroreApp | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const chiave = JSON.stringify([fn, args]);
  const ultima = useRef(0);

  const carica = useCallback(async (silenzioso = false) => {
    if (!fn) return;
    const n = ++ultima.current;
    if (!silenzioso) setCaricamento(true);
    try {
      const d = await rpc<T>(fn, args);
      if (n === ultima.current) { setDati(d); setErrore(null); }
    } catch (e) {
      if (n === ultima.current) setErrore(e as ErroreApp);
    } finally {
      if (n === ultima.current) setCaricamento(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave]);

  useEffect(() => { void carica(); }, [carica]);

  return { dati, errore, caricamento, ricarica: () => carica(true) };
}

/** Esegue un'azione: gestisce "in corso", errori di regola e di rete. */
export function useAzione() {
  const [occupato, setOccupato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [erroreRete, setErroreRete] = useState(false);

  const esegui = useCallback(async <T = RispostaAzione>(fn: string, args?: Record<string, unknown>): Promise<T | null> => {
    setOccupato(true); setErrore(null); setErroreRete(false);
    try {
      return await rpc<T>(fn, args);
    } catch (e) {
      const err = e as ErroreApp;
      if (err.tipo === 'rete') setErroreRete(true); else setErrore(err.message);
      return null;
    } finally {
      setOccupato(false);
    }
  }, []);

  return { esegui, occupato, errore, erroreRete, setErrore, pulisci: () => { setErrore(null); setErroreRete(false); } };
}
