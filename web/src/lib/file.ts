import { supabase } from './supabase';

export const LIMITE_MB = 10;
export const MAX_FILE = 5;
const TIPI_OK = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];

export type FileCaricato = { percorso: string; nome: string; dimensione: number; mime: string; anteprima?: string };
export type AllegatoSalvato = { id: string; nome: string; dimensione: number; mime: string; percorso: string };

/** Controllo veloce prima di caricare (il database lo ripete comunque). */
export function controllaFile(f: File, gia: number): string | null {
  if (!(TIPI_OK.includes(f.type) || /\.(png|jpe?g|webp|gif|pdf)$/i.test(f.name))) return `“${f.name}” non è un’immagine o un PDF.`;
  if (f.size > LIMITE_MB * 1048576) return `“${f.name}” supera i ${LIMITE_MB} MB.`;
  if (gia >= MAX_FILE) return `Puoi allegare al massimo ${MAX_FILE} file.`;
  return null;
}

/** Carica il file nella cartella dell'utente; poi l'azione del database lo collega alla richiesta. */
export async function caricaFile(f: File): Promise<FileCaricato> {
  const { data: s } = await supabase.auth.getUser();
  if (!s.user) throw new Error('Entra di nuovo nel portale.');
  const nomePulito = f.name.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80);
  const percorso = `${s.user.id}/${crypto.randomUUID()}/${nomePulito}`;
  const { error } = await supabase.storage.from('allegati').upload(percorso, f, { contentType: f.type || undefined, upsert: false });
  if (error) throw new Error(`Non è stato possibile caricare “${f.name}”: riprova.`);
  return { percorso, nome: f.name, dimensione: f.size, mime: f.type || 'application/octet-stream',
    anteprima: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined };
}

/** Link temporaneo (5 minuti) per aprire o scaricare un allegato. */
export async function linkFile(percorso: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('allegati').createSignedUrl(percorso, 300);
  return error ? null : data.signedUrl;
}

/** Toglie dallo Storage i file non più collegati a niente (il database dice quali). */
export async function togliFile(percorsi: string[] | undefined) {
  if (percorsi && percorsi.length) await supabase.storage.from('allegati').remove(percorsi);
}
