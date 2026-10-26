/** Inline SVG icon set — no emoji, crisp at any size. */
import type { CSSProperties } from 'react';

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export type IconName =
  | 'bolt' | 'coin' | 'chip' | 'research' | 'stability' | 'clock' | 'grid'
  | 'close' | 'menu' | 'sound' | 'mute' | 'info' | 'check' | 'lock' | 'arrow'
  | 'building' | 'battery' | 'sun' | 'wind' | 'scale' | 'trophy' | 'save' | 'help'
  | 'chevron' | 'plus' | 'target' | 'layers' | 'flash' | 'leaf';

const PATHS: Record<IconName, string> = {
  bolt: 'M13 2 4 14h6l-1 8 9-12h-6l1-8z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3.2v11.6M8.6 7.6h5.2a2.6 2.6 0 0 1 0 5.2H9.8a2.6 2.6 0 0 0 0 5.2h5.6',
  chip: 'M8 8h8v8H8zM9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M5 5h14v14H5z',
  research: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3M8 15h8',
  stability: 'M2 12h4l2-6 3 12 2.5-8 2 4H22',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3.5 2',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  close: 'M6 6l12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sound: 'M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9v6h4l5 4V5L8 9H4zM16 9l5 6M21 9l-5 6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 8v5M12 7.6v.1',
  check: 'M4 12.5 9.5 18 20 6',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v10H5z',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  building: 'M5 21V6l7-3 7 3v15M9 21v-4h6v4M8 9h2M14 9h2M8 13h2M14 13h2',
  battery: 'M3 8h15v8H3zM18 10h3v4h-3M6 10v4M10 10v4M14 10v4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8',
  scale: 'M12 4v16M6 20h12M5 8h14M8 8l-3 6h6L8 8zM16 8l-3 6h6l-3-6z',
  trophy: 'M8 4h8v6a4 4 0 0 1-8 0V4zM8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v4M8 20h8',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 14h8v6H8z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2 6a2.2 2.2 0 1 1 3.4 1.9c-.9.6-1.4 1-1.4 2.1M12 17v.1',
  chevron: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM12 10.5v3',
  layers: 'M12 3 3 8l9 5 9-5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  flash: 'M5 3h9l-2 7h6L8 21l2-8H4l1-10z',
  leaf: 'M4 20c8 0 14-5 16-16C10 4 4 9 4 16v4zM4 20c2-5 5-8 9-10',
};

export function Icon({ name, size = 18, className, style }: IconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="logo-mark" aria-hidden="true">
      <defs>
        <linearGradient id="gplogo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7ff0ff" />
          <stop offset="1" stopColor="#2a9bd8" />
        </linearGradient>
      </defs>
      <path d="M32 3 7 17v30l25 14 25-14V17L32 3z" fill="none" stroke="url(#gplogo)" strokeWidth="2" opacity="0.8" />
      <path d="M35 14 21 35h9l-2 15 15-23h-9l1-13z" fill="url(#gplogo)" />
      <path d="M12 25h8M44 39h8M32 55v6" stroke="#4fd6e8" strokeWidth="1.4" opacity="0.6" />
    </svg>
  );
}
