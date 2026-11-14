import { useId } from 'react';

const FLAME = 'M24 5 C26 12 34 16 34 27 C34 35.5 29.5 42 24 42 C18.5 42 14 35.5 14 27.5 C14 22 17 19 19 15 C20 19 21.5 21 23 21.5 C22 15 22.5 9 24 5 Z';
const SHIELD = 'M24 3 C30 3 36 4.5 41 7 V22 C41 33 33.5 40.5 24 45 C14.5 40.5 7 33 7 22 V7 C12 4.5 18 3 24 3 Z';

/** Logo «Щит, пламя и город»: the flame is cut out of the shield (transparent), buildings stay in shield colour. */
export function LogoMark({ size = 28, color = 'var(--fire)' }: { size?: number; color?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <g transform="translate(24 24.5) scale(.74) translate(-24 -23.5)">
            <path d={FLAME} fill="#000" />
            <g fill="#fff"><path d="M17 31 H20.5 V43 H17 Z" /><path d="M22 23 L25.5 21 V43 H22 Z" /><path d="M27 28 L30.5 30 V43 H27 Z" /></g>
          </g>
        </mask>
      </defs>
      <path d={SHIELD} fill={color} mask={`url(#${id})`} />
    </svg>
  );
}
export function Wordmark() {
  return <span style={{ fontWeight: 650, letterSpacing: '0.04em' }}>TUTIN<span style={{ color: 'var(--fire)' }}>GUARD</span></span>;
}
