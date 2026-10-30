// ── Design tokens: "Field Station" theme ────────────────────────────────
// A research-instrument aesthetic for an environmental exposure tool:
// deep forest greens for structure, clay/soil browns for pollution &
// built-environment data, water teal for climate/hydrology, and a warm
// parchment backdrop instead of a stark white app-shell. Numbers are set
// in a monospace face throughout, the way a field logbook or lab printout
// would present measurements.

export const color = {
  forest: "#1C3B2E", // deep pine — header, primary text on light bg
  forestSoft: "#2F5844", // mid green — accents, links, active states
  sage: "#6B8F71", // muted sage — secondary accents, borders
  sageMist: "#E7EEE7", // pale sage tint — hover/subtle backgrounds
  clay: "#8A5A34", // warm soil brown — pollution / built domain accent
  clayMist: "#F5EBE0",
  water: "#2A6B76", // teal — climate / hydrology domain accent
  waterMist: "#E4F0F1",
  amber: "#B4772A", // caution — moderate risk
  amberMist: "#FBF1E1",
  brick: "#A13F2B", // alert — high risk
  brickMist: "#FBEBE7",
  parchment: "#F6F5EF", // app background
  paper: "#FFFFFF", // card background
  line: "#DFDCCF", // hairline borders on parchment
  ink: "#211E18", // primary text
  inkSoft: "#6B675C", // secondary text
  inkFaint: "#A9A497", // tertiary / placeholder text
};

export const font = {
  display: "'Fraunces', Georgia, serif",
  body: "'IBM Plex Sans', 'Segoe UI', sans-serif",
  mono: "'IBM Plex Mono', 'SF Mono', Consolas, monospace",
};

export const card = {
  background: color.paper,
  border: `1px solid ${color.line}`,
  borderRadius: 14,
  padding: "1rem 1.2rem",
  boxShadow: "0 1px 2px rgba(28,59,46,0.04)",
};

export const inp = {
  width: "100%",
  padding: "10px 13px",
  fontSize: 14,
  border: `1px solid ${color.line}`,
  borderRadius: 9,
  background: color.parchment,
  color: color.ink,
  outline: "none",
  fontFamily: font.body,
  boxSizing: "border-box",
};

export function eyebrow(domainColor = color.forestSoft) {
  return {
    fontSize: 10.5,
    fontWeight: 700,
    color: domainColor,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: font.mono,
  };
}

export const buttonPrimary = {
  height: 42,
  padding: "0 22px",
  fontSize: 13,
  fontWeight: 700,
  border: "none",
  borderRadius: 9,
  fontFamily: font.body,
  letterSpacing: "0.01em",
  color: "#fff",
  background: color.forest,
  cursor: "pointer",
};

// A thin topographic contour-line pattern used sparingly as the app's
// signature motif (header background only). Concentric, irregular rings —
// echoes the "distance to nearest source" concept the whole tool is built
// around, and reads as a literal elevation/field map.
export function topographicSvgDataUri(strokeColor = "rgba(255,255,255,0.10)") {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200" viewBox="0 0 420 200">
  <g fill="none" stroke="${strokeColor}" stroke-width="1">
    <path d="M-20,40 C60,10 140,70 220,35 C300,0 360,50 440,20" />
    <path d="M-20,70 C70,45 130,95 220,65 C310,35 350,80 440,55" />
    <path d="M-20,100 C80,80 120,120 220,95 C320,70 340,110 440,90" />
    <path d="M-20,130 C90,115 110,145 220,125 C330,105 330,140 440,125" />
    <path d="M-20,160 C100,150 100,170 220,155 C340,140 320,170 440,160" />
  </g>
</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
