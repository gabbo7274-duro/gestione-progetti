import { Fragment, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '../componenti/Base';
import { useIo, useSessione } from './Sessione';

/** Intestazione dell'area riservata: marchio, navigazione, nome e "Esci". */
export function Layout() {
  const io = useIo();
  const { esci } = useSessione();
  const { pathname } = useLocation();
  const admin = io.ruolo === 'admin';
  const voci = admin
    ? [
        { a: '/', label: 'Da gestire', badge: io.da_gestire ?? 0, attivo: pathname === '/' },
        { a: '/clienti', label: 'Clienti', badge: 0, attivo: pathname.startsWith('/clienti') || pathname.startsWith('/progetti') || pathname.startsWith('/richieste') || pathname.startsWith('/novita') },
        { a: '/notifiche', label: 'Notifiche', badge: 0, attivo: pathname === '/notifiche' },
        { a: '/i-tuoi-dati', label: 'I tuoi dati', badge: 0, attivo: pathname === '/i-tuoi-dati' },
      ]
    : [
        { a: '/', label: 'I miei progetti', badge: 0, attivo: pathname !== '/notifiche' },
        { a: '/notifiche', label: 'Notifiche', badge: 0, attivo: pathname === '/notifiche' },
      ];
  return (
    <>
      <a href="#contenuto" className="sr-only">Vai al contenuto</a>
      <header className="testata">
        <div className="testata-dentro">
          <Link to="/" className="marchio"><Logo size={28} decorativo /><span>Gestione progetti</span></Link>
          <nav aria-label="Principale" className="nav">
            {voci.map((v) => (
              <Link key={v.a} to={v.a} aria-current={v.attivo ? 'page' : undefined}>
                {v.label}
                {v.badge > 0 && <span className="conteggio" aria-label={`${v.badge} da gestire`}>{v.badge}</span>}
              </Link>
            ))}
          </nav>
          <div className="utente">
            <div className="utente-nome">
              <strong>{io.nome} {io.cognome}</strong>
              <span>{admin ? 'Amministratore' : io.cliente_nome}</span>
            </div>
            <button type="button" className="link tenue" style={{ minHeight: 44 }} onClick={() => void esci()}>Esci</button>
          </div>
        </div>
      </header>
      <main id="contenuto" className="pagina">
        <Outlet />
      </main>
    </>
  );
}

/** Percorso "Clienti / Ortofrutta Bellin / App ordini agenti". L'ultimo elemento è la pagina corrente. */
export function Percorso({ voci }: { voci: { label: string; a?: string }[] }) {
  return (
    <nav aria-label="Percorso" className="percorso">
      {voci.map((v, i) => (
        <Fragment key={i}>
          {v.a ? <><Link to={v.a}>{v.label}</Link><span aria-hidden="true" className="sep">/</span></> : <span aria-current="page">{v.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

export function TitoloPagina({ titolo, sotto, medio, children }: { titolo: ReactNode; sotto?: ReactNode; medio?: boolean; children?: ReactNode }) {
  return (
    <div className="titolo-pagina">
      <h1 className={`h1 ${medio ? 'medio' : ''}`}>{titolo}</h1>
      {sotto && <p className="sotto-titolo">{sotto}</p>}
      {children}
    </div>
  );
}
