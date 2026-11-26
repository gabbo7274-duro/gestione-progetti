// Cliente · i miei progetti e il progetto (novità, richieste, scadenze, link utili).
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useDati } from '../lib/api';
import { data, eur, plur, taglia } from '../lib/formato';
import { AvvisoSolaLettura, Caricamento, ErroreCaricamento, StatoBadge, TagTipo, TestoFormattato, Vuoto } from '../componenti/Base';
import { IconaAvanti, IconaEsterno, IconaPiu, IconaScudo, IconaSpunta } from '../componenti/Icone';
import { Percorso } from '../comune/Layout';
import { useIo } from '../comune/Sessione';
import { segnaleScadenza, testoGaranzia, TIPI_SCAD, type DettaglioProgetto } from '../admin/Progetto';

type MieiProgetti = { cliente_nome: string; progetti: { id: string; nome: string; descrizione: string; archiviato: boolean; ultima_novita: string | null; da_approvare: number }[] };

export function MieiProgetti() {
  const { dati, errore, caricamento, ricarica } = useDati<MieiProgetti>('miei_progetti');
  const io = useIo();
  const attivi = dati?.progetti.filter((p) => !p.archiviato) ?? [];
  const arch = dati?.progetti.filter((p) => p.archiviato) ?? [];
  const ultima = (d: string | null) => (d ? `Ultima novità: ${data(d)}` : 'Nessuna novità ancora');
  return (
    <>
      <div className="titolo-pagina"><h1 className="h1">I miei progetti</h1><p className="sotto-titolo">{dati?.cliente_nome ?? io.cliente_nome}</p></div>
      {caricamento && !dati && <Caricamento />}
      {errore && <ErroreCaricamento messaggio={errore.message} onRiprova={ricarica} />}
      {dati && (
        <>
          {attivi.length === 0 ? <Vuoto icona titolo="Nessun progetto attivo" testo="Quando inizia un progetto per voi, lo trovi qui." /> : (
            <ul className="elenco">
              {attivi.map((p) => (
                <li key={p.id}>
                  <Link to={`/progetti/${p.id}`} className="riga" style={{ flexWrap: 'nowrap', padding: '18px 0', minHeight: 72 }}>
                    <span className="riga-testo" style={{ flex: '1 1 auto', gap: 4 }}>
                      <span className="riga-titolo" style={{ fontFamily: 'var(--titoli)', fontSize: 20, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--inchiostro)' }}>{p.nome}</span>
                      <span style={{ fontSize: 14, color: 'var(--testo-2)' }}>{p.descrizione}</span>
                      <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', paddingTop: 4 }}>
                        {p.da_approvare > 0 && <span className="segnale">{plur(p.da_approvare, 'preventivo da approvare', 'preventivi da approvare')}</span>}
                        <span style={{ fontSize: 13, color: 'var(--tenue)' }}>{ultima(p.ultima_novita)}</span>
                      </span>
                    </span>
                    <IconaAvanti className="chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {arch.length > 0 && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                <h2 className="h2" style={{ fontSize: 20 }}>Archiviati</h2>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--tenue)' }}>Puoi consultarli, ma non aprire nuove richieste.</p>
              </div>
              <ul className="elenco tenue">
                {arch.map((p) => (
                  <li key={p.id}>
                    <Link to={`/progetti/${p.id}`} className="riga" style={{ flexWrap: 'nowrap', minHeight: 72 }}>
                      <span className="riga-testo" style={{ flex: '1 1 auto', gap: 4 }}>
                        <span className="riga-titolo" style={{ fontFamily: 'var(--titoli)', fontSize: 18, color: 'var(--testo-2)' }}>{p.nome}</span>
                        <span style={{ fontSize: 14, color: 'var(--tenue)' }}>{p.descrizione}</span>
                        <span style={{ fontSize: 13, color: 'var(--tenue)', paddingTop: 4 }}>Sola lettura · {ultima(p.ultima_novita)}</span>
                      </span>
                      <IconaAvanti className="chevron" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  );
}

type Scheda = 'novita' | 'richieste' | 'scadenze';

export function ProgettoCliente() {
  const { id } = useParams();
  const io = useIo();
  const naviga = useNavigate();
  const [params, setParams] = useSearchParams();
  const scheda = (params.get('tab') as Scheda) || 'novita';
  const { dati, errore, caricamento, ricarica } = useDati<DettaglioProgetto>('dettaglio_progetto', { p_id: id });
  if (caricamento && !dati) return <Caricamento />;
  if (errore || !dati) return <ErroreCaricamento messaggio={errore?.message ?? 'Progetto non trovato.'} onRiprova={ricarica} />;
  const p = dati.progetto;
  const novita = dati.novita;

  return (
    <>
      <Percorso voci={[{ label: 'I miei progetti', a: '/' }, { label: p.nome }]} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div className="titolo-pagina" style={{ flex: '1 1 320px' }}>
          <h1 className="h1">{p.nome}</h1>
          <p className="sotto-titolo">{p.descrizione}</p>
          {p.garanzia_fino && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: p.garanzia_attiva ? 'var(--ok-testo)' : 'var(--tenue)' }}><IconaScudo size={14} />{testoGaranzia(p.garanzia_fino, p.garanzia_attiva)}</span>}
        </div>
        {!p.archiviato && <button type="button" className="btn primario" onClick={() => naviga(`/progetti/${p.id}/nuova-richiesta`)}><IconaPiu />Nuova richiesta</button>}
      </div>
      {p.archiviato && <AvvisoSolaLettura>Progetto archiviato: puoi consultare novità e richieste, ma non aprirne di nuove.</AvvisoSolaLettura>}
      {dati.link.length > 0 && (
        <nav aria-label="Link utili del progetto" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 20px', borderTop: '1px solid var(--linea)', borderBottom: '1px solid var(--linea)' }}>
          <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Link utili</span>
          {dati.link.map((l) => <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="link-utile">{l.etichetta}<IconaEsterno size={13} /></a>)}
        </nav>
      )}
      <div role="tablist" aria-label="Sezioni del progetto" className="schede" style={{ gap: 22, overflowX: 'auto' }}>
        <button type="button" role="tab" className="scheda" aria-selected={scheda === 'novita'} onClick={() => setParams({ tab: 'novita' }, { replace: true })}>Novità</button>
        <button type="button" role="tab" className="scheda" aria-selected={scheda === 'richieste'} onClick={() => setParams({ tab: 'richieste' }, { replace: true })}>Richieste · {dati.richieste.length}</button>
        {dati.scadenze.length > 0 && <button type="button" role="tab" className="scheda" aria-selected={scheda === 'scadenze'} onClick={() => setParams({ tab: 'scadenze' }, { replace: true })}>Scadenze · {dati.scadenze.length}</button>}
      </div>

      {scheda === 'novita' && (novita.length === 0
        ? <Vuoto icona titolo="Nessuna novità ancora" testo="Qui troverai gli aggiornamenti sul progetto appena vengono pubblicati." />
        : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {novita.map((n, i) => (
              <article key={n.id} style={{ borderTop: i ? '1px solid var(--linea)' : '2px solid var(--inchiostro)', padding: '24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--tenue)' }}>{data(n.pubblicata_il)}</span>
                <h2 className="h2" style={{ fontSize: 24, lineHeight: 1.25, letterSpacing: '-0.015em', textWrap: 'balance' }}>{n.titolo}</h2>
                <TestoFormattato testo={n.testo} />
                {n.incluse.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0 12px', paddingTop: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--tenue)' }}>Richieste incluse:</span>
                    {n.incluse.map((q) => <Link key={q.id} to={`/richieste/${q.id}`} className="link-utile"><IconaSpunta size={14} />{q.titolo}</Link>)}
                  </div>
                )}
              </article>
            ))}
          </div>
        ))}

      {scheda === 'richieste' && (dati.richieste.length === 0
        ? <Vuoto icona titolo="Nessuna richiesta aperta" testo="Hai un’idea o hai trovato un problema? Apri una richiesta con il pulsante “Nuova richiesta”." />
        : (
          <ul className="elenco">
            {dati.richieste.map((r) => {
              const u = r.ultimo;
              const chi = u ? (u.autore_id === io.id ? 'Tu' : u.admin ? u.autore_nome.split(' ')[0] : u.autore_nome) : '';
              return (
                <li key={r.id}>
                  <Link to={`/richieste/${r.id}`} className="riga" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                    <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px' }}>
                      <span className="riga-titolo" style={{ flex: '1 1 240px', fontSize: 16 }}>{r.titolo}</span>
                      {r.da_approvare && <span className="segnale">Preventivo da approvare</span>}
                      <TagTipo tipo={r.tipo} /><StatoBadge stato={r.stato} />
                    </span>
                    <span className="riga-meta">
                      Aperta da {r.autore_id === io.id ? 'te' : r.autore_nome} · {data(r.aperta_il)}
                      {r.pv_stato ? ` · Preventivo ${eur(r.pv_valore)}, ${{ inviato: 'in attesa di risposta', accettato: 'accettato', modifiche: 'modifiche richieste', rifiutato: 'rifiutato', scaduto: 'scaduto' }[r.pv_stato] ?? ''}` : ''}
                    </span>
                    {u && <span style={{ fontSize: 14, color: 'var(--testo-2)', overflowWrap: 'anywhere' }}><strong style={{ fontWeight: 600 }}>{chi}:</strong> “{taglia(u.testo || 'Allegato', 120)}”</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ))}

      {scheda === 'scadenze' && (
        <>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--tenue)' }}>Domini, hosting e account degli store di questo progetto, con la data del prossimo rinnovo.</p>
          <ul className="elenco">
            {dati.scadenze.map((x) => (
              <li key={x.id} style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px' }}>
                  <span className="tag">{TIPI_SCAD[x.tipo]}</span><strong style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{x.nome}</strong>
                  {x.giorni <= 30 && <span className="segnale">{segnaleScadenza(x.giorni)}</span>}
                </span>
                <span style={{ fontSize: 13, color: 'var(--tenue)' }}>
                  Scade il {data(x.scade)}{x.costo ? ` · ${eur(x.costo)} l’anno` : ''} · {x.carico === 'cliente' ? 'La pagate voi' : `Se ne occupa ${io.nome_admin}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
