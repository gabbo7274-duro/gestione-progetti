import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { IconaSpunta } from '../componenti/Icone';

const Ctx = createContext<(msg: string | null | undefined) => void>(() => {});

/** Il messaggio scuro in basso dopo un'azione ("Richiesta aggiornata · 2 email inviate"). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>();
  const mostra = useCallback((m: string | null | undefined) => {
    if (!m) return;
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), 3600);
  }, []);
  return (
    <Ctx.Provider value={mostra}>
      {children}
      <div aria-live="polite" role="status">
        {msg && <div className="toast"><IconaSpunta stroke="#7FD18F" /><span>{msg}</span></div>}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
