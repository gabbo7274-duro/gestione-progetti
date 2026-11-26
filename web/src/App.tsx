import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { configurato } from './lib/supabase';
import { SessioneProvider, useSessione } from './comune/Sessione';
import { ToastProvider, useToast } from './comune/Toast';
import { Layout } from './comune/Layout';
import { Accesso, NuovaPassword } from './accesso/Accesso';
import { DaGestire } from './admin/DaGestire';
import { Clienti, Cliente } from './admin/Clienti';
import { ProgettoAdmin } from './admin/Progetto';
import { EditorNovita } from './admin/EditorNovita';
import { RichiestaAdmin } from './admin/Richiesta';
import { TuoiDati } from './admin/TuoiDati';
import { MieiProgetti, ProgettoCliente } from './cliente/Progetti';
import { FormRichiesta, RichiestaInviata } from './cliente/FormRichiesta';
import { RichiestaCliente } from './cliente/Richiesta';
import { Notifiche } from './comune/Notifiche';
import { Stampa } from './comune/Stampa';
import { Caricamento } from './componenti/Base';

/** Mostra il messaggio passato da una pagina all'altra con navigate(…, { state: { toast } }). */
function ToastDaNavigazione() {
  const loc = useLocation();
  const naviga = useNavigate();
  const toast = useToast();
  useEffect(() => {
    const t = (loc.state as { toast?: string } | null)?.toast;
    if (t) { toast(t); naviga(loc.pathname + loc.search, { replace: true, state: null }); }
  }, [loc, naviga, toast]);
  return null;
}

/** Dopo il login torna alla pagina chiesta (per esempio dal link di un'email). */
function DopoAccesso() {
  const loc = useLocation();
  const dopo = (loc.state as { dopo?: string } | null)?.dopo;
  return <Navigate to={dopo && dopo.startsWith('/') && dopo !== '/accesso' ? dopo : '/'} replace />;
}

function Rotte() {
  const { pronto, profilo } = useSessione();
  const loc = useLocation();
  const { pathname } = loc;
  if (!pronto) return <main className="pagina"><Caricamento /></main>;
  if (pathname === '/nuova-password') return <NuovaPassword />;
  if (pathname.startsWith('/stampa/') && profilo) return <Routes><Route path="/stampa/:tipo/:id" element={<Stampa />} /></Routes>;
  if (!profilo) {
    return (
      <Routes>
        <Route path="/accesso" element={<Accesso />} />
        <Route path="*" element={<Navigate to="/accesso" replace state={{ dopo: pathname + loc.search }} />} />
      </Routes>
    );
  }
  const admin = profilo.ruolo === 'admin';
  return (
    <Routes>
      <Route path="/accesso" element={<DopoAccesso />} />
      <Route element={<Layout />}>
        {admin ? (
          <>
            <Route index element={<DaGestire />} />
            <Route path="clienti" element={<Clienti />} />
            <Route path="clienti/:id" element={<Cliente />} />
            <Route path="progetti/:id" element={<ProgettoAdmin />} />
            <Route path="progetti/:id/novita/nuova" element={<EditorNovita />} />
            <Route path="novita/:id" element={<EditorNovita />} />
            <Route path="richieste/:id" element={<RichiestaAdmin />} />
            <Route path="i-tuoi-dati" element={<TuoiDati />} />
          </>
        ) : (
          <>
            <Route index element={<MieiProgetti />} />
            <Route path="progetti/:id" element={<ProgettoCliente />} />
            <Route path="progetti/:id/nuova-richiesta" element={<FormRichiesta />} />
            <Route path="richieste/:id" element={<RichiestaCliente />} />
            <Route path="richieste/:id/modifica" element={<FormRichiesta />} />
            <Route path="richieste/:id/inviata" element={<RichiestaInviata />} />
          </>
        )}
        <Route path="notifiche" element={<Notifiche />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  if (!configurato) {
    return (
      <main className="pagina">
        <h1 className="h1">Manca la configurazione</h1>
        <p>Copia <code>web/.env.example</code> in <code>web/.env.local</code> e inserisci l’indirizzo e la chiave pubblica del tuo progetto Supabase. Poi riavvia <code>npm run dev</code>.</p>
      </main>
    );
  }
  return (
    <BrowserRouter>
      <SessioneProvider>
        <ToastProvider>
          <ToastDaNavigazione />
          <Rotte />
        </ToastProvider>
      </SessioneProvider>
    </BrowserRouter>
  );
}
