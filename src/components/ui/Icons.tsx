import type { SVGProps } from 'react';

const paths = {
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z M8 15l1-6 4-3 3 4-4 1 3 5H9',
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  horse: 'M5 21v-7l4-4-1-5 5 1 3-3 1 6 4 4-2 4-6-2-2 6 M9 10l4 5 M15 9h.01',
  orders: 'M7 3h10l4 5v13H3V8l4-5Z M3 8h18 M8 12h8 M8 16h5',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8',
  wallet: 'M3 6h16v4 M3 6l14-3v3 M3 6v14h18V10H3 M16 14h5 M16 15h.01',
  truck:
    'M3 5h12v12H3z M15 9h4l3 4v4h-7 M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4 M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  user: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2 M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  mail: 'M3 5h18v14H3z M3 6l9 7 9-7',
  headset: 'M3 14v-2a9 9 0 0 1 18 0v5a4 4 0 0 1-4 4h-4 M3 12h4v7H3z M17 12h4v7h-4z',
  logout: 'M9 4H4v16h5 M13 7l5 5-5 5 M8 12h13',
  globe: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M3 12h18 M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  plus: 'M12 5v14 M5 12h14',
  search: 'M16 16l5 5 M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0',
  copy: 'M9 9h12v12H9z M5 15H3V3h12v2',
  check: 'M5 12l4 4L20 5',
  clock: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0 M12 7v5l3 2',
  chart: 'M4 3v18h17 M8 16v-4 M13 16V8 M18 16V5',
  file: 'M14 2H4v20h16V8l-6-6v6h6 M8 12h8 M8 16h6',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  bell: 'M6 10a6 6 0 0 1 12 0v4l2 3H4l2-3v-4 M9 21h6',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0 M14 10a2 2 0 1 0-4 0 2 2 0 0 0 4 0',
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function navigationIcon(path: string): IconName {
  if (/dashboard/.test(path)) return 'dashboard';
  if (/horses/.test(path)) return 'horse';
  if (/notification/.test(path)) return 'mail';
  if (/account/.test(path)) return 'user';
  if (/staff/.test(path) && !/cases|tasks|^\/staff$/.test(path)) return 'users';
  if (/prices|financial/.test(path)) return 'wallet';
  if (/resources/.test(path)) return 'truck';
  if (/audit/.test(path)) return 'file';
  if (/tasks|driver/.test(path)) return 'check';
  return 'orders';
}
