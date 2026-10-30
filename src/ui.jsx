import { color, font } from "./theme.js";

// ── Icon set ─────────────────────────────────────────────────────────
// Small monoline glyphs (20x20, stroke=currentColor, 1.6px) standing in
// for the mixed emoji used before. One consistent visual language reads
// far more like an instrument panel than a grab-bag of platform emoji.
const PATHS = {
  factory: (
    <>
      <path d="M3 17V9l4 2.5V9l4 2.5V9l4 2.5V6h2v11z" />
      <path d="M3 17h14" />
      <rect x="15" y="3" width="1.6" height="4" fill="currentColor" stroke="none" />
    </>
  ),
  basket: (
    <>
      <path d="M4 8h12l-1.3 8.5a1 1 0 01-1 .8H6.3a1 1 0 01-1-.8L4 8z" />
      <path d="M7 8l1.5-4h3L13 8" />
      <path d="M8 11v3M12 11v3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6h12M8 6V4.5A1 1 0 019 3.5h2a1 1 0 011 1V6" />
      <path d="M5.5 6l.7 10a1 1 0 001 .9h5.6a1 1 0 001-.9l.7-10" />
      <path d="M8.3 9v5M11.7 9v5" />
    </>
  ),
  droplet: (
    <path d="M10 3s5 5.8 5 9.2a5 5 0 01-10 0C5 8.8 10 3 10 3z" />
  ),
  fuel: (
    <>
      <path d="M4 17V5a1 1 0 011-1h6a1 1 0 011 1v12" />
      <path d="M3 17h9" />
      <path d="M12 8h1.8l2.2 2v4.3a.7.7 0 01-.7.7H14" />
      <circle cx="15.2" cy="14.6" r="0.9" fill="currentColor" stroke="none" />
      <path d="M6 5.5h4" />
    </>
  ),
  cross: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="3" />
      <path d="M10 6.5v7M6.5 10h7" />
    </>
  ),
  tree: (
    <>
      <circle cx="10" cy="8" r="5" />
      <path d="M10 13v4" />
    </>
  ),
  forest: (
    <>
      <circle cx="7" cy="8" r="4" />
      <circle cx="13" cy="7" r="4.5" />
      <path d="M7 12v4M13 11.5v4.5" />
    </>
  ),
  cap: (
    <>
      <path d="M2 8l8-3.5L18 8l-8 3.5L2 8z" />
      <path d="M6 9.8V13c0 1 1.8 2 4 2s4-1 4-2V9.8" />
      <path d="M18 8v4" />
    </>
  ),
  pill: (
    <>
      <rect
        x="3.3"
        y="9.6"
        width="13.4"
        height="6"
        rx="3"
        transform="rotate(-40 10 12.6)"
      />
      <path d="M9 8.3l3.2 3.2" />
    </>
  ),
  paw: (
    <>
      <circle cx="6.2" cy="7" r="1.6" />
      <circle cx="10" cy="5.2" r="1.6" />
      <circle cx="13.8" cy="7" r="1.6" />
      <path d="M10 9.5c-3 0-5 2-5 4.2 0 1.7 1.4 2.6 2.9 2 .9-.4 1.4-.6 2.1-.6s1.2.2 2.1.6c1.5.6 2.9-.3 2.9-2 0-2.2-2-4.2-5-4.2z" />
    </>
  ),
  sprout: (
    <>
      <path d="M10 17V9" />
      <path d="M10 9C10 5.5 7 4 4 4c0 3.5 2.5 5.5 6 5z" />
      <path d="M10 11c0-3 2.5-4.5 6-4.5-.3 3.2-2.6 4.9-6 4.9z" />
    </>
  ),
  ball: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 3v14M3 10h14M5 5.5c2 2 8 2 10 0M5 14.5c2-2 8-2 10 0" />
    </>
  ),
  knife: (
    <>
      <path d="M4 16L14 6a2.3 2.3 0 013.2 3.2L7 19l-4 1 1-4z" />
      <path d="M11 9l3 3" />
    </>
  ),
  tap: (
    <>
      <path d="M4 6h7a3 3 0 013 3v1h2" />
      <path d="M16 8.3v3.4" />
      <path d="M9 10s2 2.3 2 4.3a2.2 2.2 0 01-4.4 0C6.6 12.3 9 10 9 10z" />
    </>
  ),
  thermo: (
    <>
      <path d="M9 3.5a1.6 1.6 0 013.2 0v7.4a3.4 3.4 0 11-3.2 0V3.5z" />
      <path d="M9 12V6" />
    </>
  ),
  wind: (
    <>
      <path d="M2.5 7h9a2 2 0 10-2-2" />
      <path d="M2.5 11h12a2 2 0 11-2 2" />
      <path d="M2.5 15h7a1.6 1.6 0 10-1.6-1.6" />
    </>
  ),
  cloudRain: (
    <>
      <path d="M5.5 10.5a3.5 3.5 0 01.3-7 4.5 4.5 0 018.6 1.4A3 3 0 0116 11H6.2z" />
      <path d="M6.5 13.5l-1 2.5M10 13.5l-1 2.5M13.5 13.5l-1 2.5" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 16C4 8 9 4 17 4c0 8-4 13-12 13-.8 0-1.7-.1-2.5-.2z" />
      <path d="M4.5 15.5L11 9" />
    </>
  ),
  ward: (
    <>
      <path d="M10 17s6-5.2 6-9.6A6 6 0 004 7.4C4 11.8 10 17 10 17z" />
      <circle cx="10" cy="7.4" r="2.1" />
    </>
  ),
  people: (
    <>
      <circle cx="7" cy="6.5" r="2.3" />
      <circle cx="14" cy="7.2" r="1.9" />
      <path d="M2.5 17c.4-3 2.1-4.7 4.5-4.7s4.1 1.7 4.5 4.7" />
      <path d="M12.5 12.7c1.9.2 3.2 1.8 3.6 4.3" />
    </>
  ),
  ruler: (
    <>
      <path d="M3 13.5L13.5 3l3.5 3.5L6.5 17 3 13.5z" />
      <path d="M6 11l1.4 1.4M8.4 8.6l1.4 1.4M10.8 6.2l1.4 1.4" />
    </>
  ),
};

export function Icon({ name, size = 14, color: c = "currentColor", strokeWidth = 1.6 }) {
  const content = PATHS[name] || <circle cx="10" cy="10" r="3" />;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke={c}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {content}
    </svg>
  );
}

// Category -> icon name, kept separate from SOURCE_CATS (which stores an
// emoji for any legacy/tooltip use) so the two can diverge cleanly.
export const CAT_ICON = {
  industrial: "factory",
  market: "basket",
  landfill: "trash",
  wastewater: "droplet",
  fuel: "fuel",
  hospital: "cross",
  park: "tree",
  forest: "forest",
  school: "cap",
  clinic: "pill",
  veterinary: "paw",
  farm: "sprout",
  recreation: "ball",
  butcher: "knife",
  publicinfra: "tap",
};

// ── Icon chip: colored rounded square housing an Icon ──────────────────
export function IconChip({ iconName, tint = color.forestSoft, size = 28 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        background: `${tint}17`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon name={iconName} size={size * 0.5} color={tint} />
    </div>
  );
}

// ── Status chip: dot + label, replaces heavy-fill pill badges ──────────
export function StatusDot({ label, tint }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10.5,
        fontWeight: 600,
        color: tint,
        fontFamily: font.mono,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: tint,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

// ── Section header: icon chip + mono label + rule + optional caption ───
export function SectionHeader({ iconName, tint = color.forestSoft, label, caption, toggle }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        rowGap: 6,
        gap: 9,
        marginBottom: 11,
      }}
    >
      <IconChip iconName={iconName} tint={tint} size={24} />
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: color.ink,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontFamily: font.mono,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, height: 1, background: color.line }} />
      {caption && (
        <span
          style={{
            fontSize: 9.5,
            color: color.inkFaint,
            fontFamily: font.mono,
            whiteSpace: "nowrap",
          }}
        >
          {caption}
        </span>
      )}
      {toggle}
    </div>
  );
}

// ── Tick gauge: small instrument-dial style range indicator ────────────
export function TickGauge({ value, min, max, tint, ticks = 6 }) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  return (
    <div style={{ marginTop: 6 }}>
      <div
        style={{
          position: "relative",
          height: 5,
          background: color.line,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${pct}%`,
            background: tint,
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "space-between",
            padding: "0 1px",
          }}
        >
          {Array.from({ length: ticks + 1 }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 1,
                height: 5,
                background: "rgba(255,255,255,0.55)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Metric readout: label / big mono number / thin accent rule ────────
export function Readout({ iconName, tint, label, value, unit, meta, statusLabel, tooltip }) {
  return (
    <div
      title={tooltip}
      style={{
        background: color.paper,
        border: `1px solid ${color.line}`,
        borderTop: `3px solid ${tint}`,
        borderRadius: 12,
        padding: "0.85rem 1rem 0.9rem",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 9.5,
          fontWeight: 700,
          color: color.inkFaint,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          fontFamily: font.mono,
        }}
      >
        {iconName && <Icon name={iconName} size={11} color={tint} />}
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: color.ink,
          lineHeight: 1.05,
          fontFamily: font.mono,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 3, color: color.inkSoft }}>
            {unit}
          </span>
        )}
      </div>
      {meta && (
        <div style={{ fontSize: 10, color: color.inkFaint, fontFamily: font.mono }}>{meta}</div>
      )}
      {statusLabel && <StatusDot label={statusLabel} tint={tint} />}
    </div>
  );
}
