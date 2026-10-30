/**
 * Local, procedurally generated property visuals. No external images or
 * third-party assets are used; each project gets a stable illustration from its seed.
 */
import type { Project } from '../domain/types';
import { LOCALITY_COORDS } from '../data/seed';
import { cx } from './kit';

const SKIES = [
  ['#9ad3e8', '#e8f6fb'], ['#f7c59f', '#fdebd8'], ['#a7c5eb', '#eef3fb'], ['#b8e0d2', '#eefaf5'], ['#c9b6e4', '#f3eefa'], ['#ffd59e', '#fff4e0'],
];
const FACADES = [
  ['#f4f1ea', '#d9d2c3'], ['#e9eef3', '#c4cfda'], ['#f2e6dc', '#d7c1ad'], ['#eef2ee', '#c7d3c7'], ['#f5efe6', '#e0cfb7'],
];
const ACCENT = ['#0d8a76', '#1b315a', '#d3780c', '#24406e', '#0c6f60'];

function rng(seed: number) {
  let x = (seed * 9301 + 49297) % 233280;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
}

export type VisualKind = 'exterior' | 'amenity' | 'interior' | 'aerial' | 'lobby';
export const GALLERY_KINDS: VisualKind[] = ['exterior', 'aerial', 'amenity', 'interior', 'lobby'];
export const GALLERY_LABEL: Record<VisualKind, string> = { exterior: 'Exterior view', aerial: 'Site layout', amenity: 'Pool & clubhouse', interior: 'Living room', lobby: 'Entrance lobby' };

export function ProjectVisual({ project, kind = 'exterior', className, label }: { project: Pick<Project, 'paletteSeed' | 'propertyType' | 'name'>; kind?: VisualKind; className?: string; label?: boolean }) {
  const seed = project.paletteSeed;
  const r = rng(seed * 7 + kind.length);
  const [sky1, sky2] = SKIES[seed % SKIES.length];
  const [f1, f2] = FACADES[seed % FACADES.length];
  const acc = ACCENT[seed % ACCENT.length];
  const id = `g${seed}${kind}`;
  let body: JSX.Element;

  if (kind === 'exterior') {
    const villa = project.propertyType === 'villa';
    const towers = villa ? 4 : 2 + Math.floor(r() * 3);
    const els: JSX.Element[] = [];
    for (let i = 0; i < towers; i++) {
      const w = villa ? 70 : 52 + r() * 20;
      const h = villa ? 60 + r() * 15 : 110 + r() * 80;
      const x = 20 + i * (360 / towers) + r() * 10;
      const y = 200 - h;
      els.push(
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} fill={`url(#${id}f)`} stroke={f2} />
          {villa && <polygon points={`${x - 6},${y} ${x + w / 2},${y - 28} ${x + w + 6},${y}`} fill={acc} opacity={0.85} />}
          {!villa && <rect x={x} y={y - 6} width={w} height={6} fill={acc} opacity={0.8} />}
          {Array.from({ length: Math.floor(h / 16) }).map((_, row) =>
            Array.from({ length: Math.floor(w / 14) }).map((__, col) => (
              <rect key={`${row}-${col}`} x={x + 5 + col * 14} y={y + 8 + row * 16} width={8} height={9} fill={r() > 0.75 ? '#fde7a8' : '#9fb4c9'} opacity={0.85} />
            )),
          )}
        </g>,
      );
    }
    body = (
      <>
        {els}
        <rect x="0" y="198" width="400" height="52" fill="#9cc58f" />
        <rect x="0" y="226" width="400" height="24" fill="#7c8a96" />
        {Array.from({ length: 9 }).map((_, i) => (
          <g key={i}><rect x={10 + i * 46} y={186} width={3} height={14} fill="#6b4f2a" /><circle cx={11.5 + i * 46} cy={182} r={10 + r() * 4} fill="#4f9a5c" /></g>
        ))}
      </>
    );
  } else if (kind === 'amenity') {
    body = (
      <>
        <rect x="0" y="120" width="400" height="130" fill="#e7e2d6" />
        <rect x="40" y="150" width="320" height="70" rx="10" fill="#4fb6d6" />
        <path d="M60 175 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#bfeaf6" strokeWidth="3" fill="none" />
        <rect x="250" y="60" width="130" height="80" fill={f1} stroke={f2} />
        <rect x="250" y="54" width="130" height="8" fill={acc} />
        {[0, 1, 2].map((i) => <rect key={i} x={262 + i * 40} y={80} width={28} height={50} fill="#9fb4c9" />)}
        {[0, 1, 2, 3].map((i) => <g key={i}><rect x={60 + i * 50} y={128} width={30} height={8} rx="3" fill="#fff" /><rect x={62 + i * 50} y={118} width={4} height={14} fill="#aaa" /></g>)}
        <circle cx="30" cy="110" r="22" fill="#4f9a5c" /><rect x="28" y="110" width="4" height="30" fill="#6b4f2a" />
      </>
    );
  } else if (kind === 'interior') {
    body = (
      <>
        <rect x="0" y="0" width="400" height="250" fill={f1} />
        <rect x="0" y="180" width="400" height="70" fill="#c9a77c" />
        <rect x="240" y="30" width="130" height="120" fill={`url(#${id})`} stroke="#fff" strokeWidth="6" />
        <line x1="305" y1="30" x2="305" y2="150" stroke="#fff" strokeWidth="4" />
        <rect x="40" y="130" width="160" height="50" rx="10" fill={acc} />
        <rect x="40" y="115" width="160" height="25" rx="8" fill={acc} opacity="0.8" />
        <rect x="80" y="190" width="90" height="12" rx="3" fill="#8a6a45" />
        <rect x="60" y="40" width="70" height="50" fill="#fff" stroke={f2} strokeWidth="3" />
        <circle cx="95" cy="65" r="12" fill={ACCENT[(seed + 2) % ACCENT.length]} opacity="0.6" />
        <rect x="215" y="120" width="10" height="60" fill="#6b4f2a" /><circle cx="220" cy="110" r="16" fill="#4f9a5c" />
      </>
    );
  } else if (kind === 'lobby') {
    body = (
      <>
        <rect x="0" y="0" width="400" height="250" fill="#f3efe7" />
        <rect x="0" y="190" width="400" height="60" fill="#d9d2c3" />
        <rect x="120" y="40" width="160" height="150" fill="#9fb4c9" stroke={f2} strokeWidth="6" />
        <line x1="200" y1="40" x2="200" y2="190" stroke={f2} strokeWidth="4" />
        <rect x="60" y="60" width="30" height="130" fill={acc} opacity="0.8" />
        <rect x="310" y="60" width="30" height="130" fill={acc} opacity="0.8" />
        <rect x="140" y="20" width="120" height="14" rx="3" fill={acc} />
        <circle cx="40" cy="160" r="18" fill="#4f9a5c" /><rect x="34" y="170" width="12" height="20" fill="#8a6a45" />
        <circle cx="360" cy="160" r="18" fill="#4f9a5c" /><rect x="354" y="170" width="12" height="20" fill="#8a6a45" />
      </>
    );
  } else {
    body = (
      <>
        <rect x="0" y="0" width="400" height="250" fill="#a9cf98" />
        <path d="M0 200 L400 160" stroke="#8a95a1" strokeWidth="18" />
        <rect x="40" y="30" width="80" height="60" fill={f1} stroke={f2} strokeWidth="3" />
        <rect x="150" y="30" width="80" height="60" fill={f1} stroke={f2} strokeWidth="3" />
        <rect x="260" y="30" width="80" height="60" fill={f1} stroke={f2} strokeWidth="3" />
        <rect x="120" y="110" width="80" height="34" rx="8" fill="#4fb6d6" />
        <rect x="230" y="105" width="70" height="44" fill={acc} opacity="0.7" />
        {Array.from({ length: 14 }).map((_, i) => <circle key={i} cx={20 + r() * 360} cy={100 + r() * 50} r={6 + r() * 5} fill="#4f9a5c" />)}
      </>
    );
  }

  return (
    <div className={cx('relative overflow-hidden bg-slate-100', className)}>
      <svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" role="img" aria-label={`${project.name} — ${GALLERY_LABEL[kind]} (illustration)`}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sky1} /><stop offset="100%" stopColor={sky2} /></linearGradient>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={f1} /><stop offset="100%" stopColor={f2} /></linearGradient>
        </defs>
        <rect width="400" height="250" fill={`url(#${id})`} />
        {kind === 'exterior' && <circle cx={320 + (seed % 3) * 20} cy={50} r={18} fill="#fff6cf" opacity="0.9" />}
        {body}
      </svg>
      {label && <span className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-0.5 text-[11px] text-white">{GALLERY_LABEL[kind]} · illustration</span>}
    </div>
  );
}

/** Schematic floor plan for a BHK count. Not to scale. */
export function FloorPlan({ bhk, carpet, className }: { bhk: number; carpet: string; className?: string }) {
  const rooms: { x: number; y: number; w: number; h: number; label: string }[] = [
    { x: 10, y: 10, w: 150, h: 110, label: 'Living / Dining' },
    { x: 160, y: 10, w: 80, h: 60, label: 'Kitchen' },
  ];
  const bedW = 230 / Math.max(1, bhk);
  for (let i = 0; i < bhk; i++) rooms.push({ x: 10 + i * bedW, y: 120, w: bedW, h: 90, label: i === 0 ? 'Master bed' : `Bed ${i + 1}` });
  rooms.push({ x: 160, y: 70, w: 80, h: 50, label: 'Bath' });
  rooms.push({ x: 240, y: 10, w: 50, h: 200, label: 'Balcony' });
  return (
    <figure className={cx('rounded-lg bg-white ring-1 ring-slate-200 p-3', className)}>
      <svg viewBox="0 0 300 220" className="w-full h-auto" role="img" aria-label={`${bhk} BHK schematic floor plan`}>
        {rooms.map((r, i) => (
          <g key={i}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.label === 'Balcony' ? '#ecfbf8' : '#f8fafc'} stroke="#1b315a" strokeWidth="2" />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} textAnchor="middle" dominantBaseline="middle" fontSize={r.w < 60 ? 8 : 10} fill="#334155" transform={r.label === 'Balcony' ? `rotate(-90 ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined}>{r.label}</text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 text-xs text-slate-500">{bhk} BHK · carpet {carpet} · schematic, not to scale (demo)</figcaption>
    </figure>
  );
}

/** Demonstrative locality map (not a real map provider). */
export function LocalityMap({ projects, onSelect, selectedId }: { projects: Project[]; onSelect?: (id: string) => void; selectedId?: string }) {
  const lats = Object.values(LOCALITY_COORDS).map((c) => c[0]);
  const lngs = Object.values(LOCALITY_COORDS).map((c) => c[1]);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats) - 0.03, Math.max(...lats) + 0.03, Math.min(...lngs) - 0.03, Math.max(...lngs) + 0.03];
  const px = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 600;
  const py = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat)) * 360;
  return (
    <div className="relative rounded-xl overflow-hidden ring-1 ring-slate-200 bg-[#eef3ea]">
      <svg viewBox="0 0 600 360" className="w-full h-auto" role="img" aria-label="Demonstrative map of Pune localities">
        <path d="M0 250 C150 220 250 280 600 200" stroke="#a6cbe0" strokeWidth="10" fill="none" />
        <path d="M0 120 L600 260" stroke="#d6d3c8" strokeWidth="6" fill="none" />
        <path d="M200 0 L320 360" stroke="#d6d3c8" strokeWidth="6" fill="none" />
        {Object.entries(LOCALITY_COORDS).map(([name, [lat, lng]]) => (
          <g key={name}>
            <circle cx={px(lng)} cy={py(lat)} r="34" fill="#ffffff" opacity="0.6" />
            <text x={px(lng)} y={py(lat) + 48} textAnchor="middle" fontSize="13" fontWeight="600" fill="#142647">{name}</text>
          </g>
        ))}
        {projects.map((p) => (
          <g key={p.id} transform={`translate(${px(p.lng)},${py(p.lat)})`} className={onSelect ? 'cursor-pointer' : ''} onClick={() => onSelect?.(p.id)}>
            <path d="M0 0 C-10 -14 -10 -26 0 -26 C10 -26 10 -14 0 0 Z" fill={selectedId === p.id ? '#ef9a13' : '#0d8a76'} stroke="#fff" strokeWidth="2" />
            <circle cy="-17" r="4" fill="#fff" />
            <title>{p.name}</title>
          </g>
        ))}
      </svg>
      <span className="absolute top-2 left-2 rounded bg-white/90 px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">Demonstrative map · not to scale · no map provider connected</span>
    </div>
  );
}
