// Un file allegato: miniatura (immagini) o icona, nome e peso. "onRimuovi" compare solo nei moduli.
import { useState } from 'react';
import { peso } from '../lib/formato';
import { IconaFile, IconaImmagine, IconaPdf } from './Icone';

export type FileVista = { nome: string; dimensione: number; mime: string; anteprima?: string | null };

export function Allegato({ file, onApri, onRimuovi }: { file: FileVista; onApri?: () => void; onRimuovi?: () => void }) {
  const [rotta, setRotta] = useState(false);
  const isPdf = file.mime === 'application/pdf' || /\.pdf$/i.test(file.nome);
  const isImg = !isPdf && (file.mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.nome));
  const thumb = isImg && !!file.anteprima && !rotta;
  const sotto = (isPdf ? 'PDF' : isImg ? 'Immagine' : 'File') + (file.dimensione ? ' · ' + peso(file.dimensione) : '');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'stretch', maxWidth: '100%', border: '1px solid #D5D8DC', borderRadius: 8, background: '#FFFFFF', overflow: 'hidden' }}>
      <button type="button" onClick={onApri} aria-label={`Apri ${file.nome}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, minWidth: 0, padding: '4px 12px 4px 4px', border: 'none', background: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
        {thumb ? (
          <img src={file.anteprima!} alt="" onError={() => setRotta(true)} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />
        ) : (
          <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isPdf ? '#FBE6E4' : isImg ? '#E3EDFC' : '#F0F1F3', color: isPdf ? '#9E2219' : isImg ? '#1D4E9E' : '#3D4550' }}>
            {isPdf ? <IconaPdf /> : isImg ? <IconaImmagine /> : <IconaFile />}
          </span>
        )}
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.3 }}>
          <span style={{ fontSize: 13, fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.nome}</span>
          <span style={{ fontSize: 12, color: '#5B6470' }}>{sotto}</span>
        </span>
      </button>
      {onRimuovi && (
        <button type="button" onClick={onRimuovi} aria-label={`Rimuovi ${file.nome}`}
          style={{ width: 40, minHeight: 44, border: 'none', borderLeft: '1px solid #E3E5E8', background: 'none', color: '#5B6470', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>×</button>
      )}
    </span>
  );
}
