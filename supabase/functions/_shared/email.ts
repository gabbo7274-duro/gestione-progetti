// Modello HTML delle email (lo stesso del componente "Email di notifica" del design).
// Le email usano tabelle e stili in linea perché i programmi di posta non leggono i fogli di stile.

export type Contenuto = {
  saluto: string;
  paragrafi: { testo: string }[];
  hasCard: boolean;
  card: { etichetta: string; titolo: string; sotto: string; hasSotto: boolean; citazione: string; hasCitazione: boolean } | null;
  cta: string;
  hasNota: boolean;
  nota: string;
  piede: string;
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT = "Inter, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const INCHIOSTRO = '#14213D';

export function rendiEmail(c: Contenuto, link: string, urlLogo: string): string {
  const card = c.hasCard && c.card ? `
    <tr><td style="padding:0 0 14px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E6E6E0;border-radius:8px;background:#FAFAF7">
        <tr><td style="padding:12px 14px;font-family:${FONT}">
          <div style="font-size:12px;font-weight:600;color:#6A6E75;text-transform:uppercase;letter-spacing:0.04em">${esc(c.card.etichetta)}</div>
          <div style="font-size:15px;font-weight:700;color:#1C1F26;padding-top:4px">${esc(c.card.titolo)}</div>
          ${c.card.hasSotto ? `<div style="font-size:13px;color:#6A6E75;padding-top:4px">${esc(c.card.sotto)}</div>` : ''}
          ${c.card.hasCitazione ? `<div style="font-size:14px;color:#3D4048;font-style:italic;padding-top:6px;white-space:pre-line">“${esc(c.card.citazione)}”</div>` : ''}
        </td></tr>
      </table>
    </td></tr>` : '';
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gestione progetti</title></head>
<body style="margin:0;padding:0;background:#FAFAF7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7"><tr><td align="center" style="padding:24px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td style="padding:0 0 16px;font-family:${FONT}">
      <img src="${esc(urlLogo)}" width="32" height="28" alt="" style="vertical-align:middle;border:0">
      <span style="vertical-align:middle;font-weight:700;font-size:15px;color:${INCHIOSTRO};padding-left:8px">Gestione progetti</span>
    </td></tr>
    <tr><td style="background:#FFFFFF;border:1px solid #E6E6E0;border-radius:10px;padding:24px;font-family:${FONT};font-size:15px;line-height:1.55;color:#1C1F26">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:0 0 14px;font-weight:600">${esc(c.saluto)}</td></tr>
        ${c.paragrafi.map((p) => `<tr><td style="padding:0 0 14px;color:#3D4048">${esc(p.testo)}</td></tr>`).join('')}
        ${card}
        <tr><td style="padding:0 0 ${c.hasNota ? 14 : 0}px">
          <a href="${esc(link)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${INCHIOSTRO};color:#FFFFFF;font-weight:600;font-size:15px;text-decoration:none">${esc(c.cta)}</a>
        </td></tr>
        ${c.hasNota ? `<tr><td style="font-size:13px;color:#6A6E75">${esc(c.nota)}</td></tr>` : ''}
      </table>
    </td></tr>
    <tr><td style="padding:16px 0 0;font-family:${FONT};font-size:12px;color:#6A6E75;text-align:center">${esc(c.piede)}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

export function testoSemplice(c: Contenuto, link: string): string {
  const righe = [c.saluto, '', ...c.paragrafi.map((p) => p.testo)];
  if (c.hasCard && c.card) righe.push('', `${c.card.etichetta}: ${c.card.titolo}`, c.card.sotto, c.card.citazione ? `“${c.card.citazione}”` : '');
  righe.push('', `${c.cta}: ${link}`);
  if (c.hasNota) righe.push('', c.nota);
  righe.push('', '—', c.piede);
  return righe.filter((r, i, a) => !(r === '' && a[i - 1] === '')).join('\n');
}

/** Invio con Resend (https://resend.com). Per un altro servizio basta cambiare questa funzione. */
export async function spedisci(a: string, oggetto: string, html: string, testo: string): Promise<void> {
  const chiave = Deno.env.get('RESEND_API_KEY');
  const mittente = Deno.env.get('EMAIL_MITTENTE'); // es. "Gestione progetti <notifiche@tuodominio.it>"
  if (!chiave || !mittente) throw new Error('Mancano RESEND_API_KEY o EMAIL_MITTENTE nei segreti delle Edge Functions');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: mittente, to: [a], subject: oggetto, html, text: testo, reply_to: Deno.env.get('EMAIL_RISPOSTA') || undefined }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
