// Solo presentazione: date e importi come li scrive il design. I calcoli stanno nel database.

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
export const eur = (v: number | string | null | undefined) => EUR.format(Number(v ?? 0));

const z = (n: number) => String(n).padStart(2, '0');

/** "2026-11-23" o un timestamp → "23/11/2026" */
export function data(d: string | null | undefined): string {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { const [y, m, g] = d.split('-'); return `${g}/${m}/${y}`; }
  const x = new Date(d);
  return `${z(x.getDate())}/${z(x.getMonth() + 1)}/${x.getFullYear()}`;
}

export const ora = (d: string) => { const x = new Date(d); return `${z(x.getHours())}:${z(x.getMinutes())}`; };

export function oggiIso(): string {
  const x = new Date();
  return `${x.getFullYear()}-${z(x.getMonth() + 1)}-${z(x.getDate())}`;
}

/** "oggi" oppure la data, per messaggi e note */
export function quando(d: string): string {
  const g = data(d);
  return (g === data(oggiIso()) ? 'oggi' : g) + ' alle ' + ora(d);
}

export function daQuanto(d: string): string {
  const giorni = Math.round((new Date(oggiIso()).getTime() - new Date(d.slice(0, 10)).getTime()) / 86400000);
  return giorni <= 0 ? 'oggi' : giorni === 1 ? 'ieri' : `da ${giorni} giorni`;
}

const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
export function giornoEData(iso: string): string {
  const [y, m, g] = iso.split('-').map(Number);
  return GIORNI[new Date(y, m - 1, g).getDay()] + ' ' + data(iso);
}

export const plur = (n: number, uno: string, molti: string) => (n === 1 ? `1 ${uno}` : `${n} ${molti}`);
export const taglia = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : s);
export const iniziali = (nome: string) => nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

export function saluto(): string {
  const h = new Date().getHours();
  return h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera';
}

const NUMERI = ['nessuna', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci'];
export const parola = (n: number) => NUMERI[n] ?? String(n);
export const maiuscola = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function peso(b: number): string {
  if (!b) return '';
  if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + ' KB';
  return (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB';
}
