// Icone a tratto del design (24×24, currentColor). Decorative: aria-hidden.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18, sw = 2): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: sw,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
});

export const IconaErrore = ({ size = 20, ...p }: P) => <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.5" /></svg>;
export const IconaLucchetto = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
export const IconaPosta = ({ size = 16, ...p }: P) => <svg {...base(size)} {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>;
export const IconaMatita = ({ size = 16, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M14 6l4 4" /></svg>;
export const IconaCestino = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
export const IconaFreccia = ({ size = 20, ...p }: P) => <svg {...base(size, 1.8)} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const IconaAvanti = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><path d="M9 6l6 6-6 6" /></svg>;
export const IconaGiu = ({ size = 20, ...p }: P) => <svg {...base(size)} {...p}><path d="M6 9l6 6 6-6" /></svg>;
export const IconaPiu = ({ size = 16, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 5v14M5 12h14" /></svg>;
export const IconaGraffetta = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><path d="M21 11.5l-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" /></svg>;
export const IconaSpunta = ({ size = 18, ...p }: P) => <svg {...base(size, 2.4)} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconaPdf = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>;
export const IconaImmagine = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 9" /></svg>;
export const IconaFile = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>;
export const IconaEsterno = ({ size = 14, ...p }: P) => <svg {...base(size)} {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
export const IconaVuoto = ({ size = 28, ...p }: P) => <svg {...base(size, 1.6)} stroke="#9A9DA3" {...p}><path d="M4 13l2.5-7h11L20 13v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></svg>;
export const IconaScudo = ({ size = 16, ...p }: P) => <svg {...base(size)} {...p}><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>;
export const IconaGrassetto = ({ size = 18, ...p }: P) => <svg {...base(size, 2.4)} {...p}><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7z" /><path d="M7 12h7a3.5 3.5 0 0 1 0 7H7z" /></svg>;
export const IconaElenco = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><path d="M10 6h10M10 12h10M10 18h10" /><circle cx="4.5" cy="6" r="1.2" fill="currentColor" /><circle cx="4.5" cy="12" r="1.2" fill="currentColor" /><circle cx="4.5" cy="18" r="1.2" fill="currentColor" /></svg>;
export const IconaLink = ({ size = 18, ...p }: P) => <svg {...base(size)} {...p}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>;
export const IconaStampa = ({ size = 16, ...p }: P) => <svg {...base(size)} {...p}><path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" /></svg>;
export const IconaCalendario = ({ size = 16, ...p }: P) => <svg {...base(size)} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
export const IconaRinnova = ({ size = 16, ...p }: P) => <svg {...base(size)} {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></svg>;
