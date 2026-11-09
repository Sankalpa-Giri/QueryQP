/** The notebook-and-pen glyph from the intro, small enough for a nav bar. */
export function LogoMark({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect x="6" y="4" width="20" height="24" rx="5" fill="#1A1A1A" stroke="#A0A0A0" strokeWidth="1.6" />
      <path d="M11 12h10M11 17h10M11 22h6" stroke="#A0A0A0" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 17h10" stroke="#FF5A2C" strokeWidth="2" strokeLinecap="round" />
      <rect x="2.5" y="8" width="5" height="3" rx="1.5" fill="#EAEAEA" />
      <rect x="2.5" y="14" width="5" height="3" rx="1.5" fill="#EAEAEA" />
      <rect x="2.5" y="20" width="5" height="3" rx="1.5" fill="#EAEAEA" />
    </svg>
  );
}
