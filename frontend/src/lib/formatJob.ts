export interface ParsedJobSection {
  title: string;
  kind: "overview" | "work" | "requirements" | "process" | "compensation" | "timeline";
  paragraphs: string[];
  bullets: string[];
}

export interface ParsedJobContent {
  facts: Array<{ label: string; value: string }>;
  sections: ParsedJobSection[];
  estimatedMinutes: number;
  cleanFullText: string;
}

const KNOWN_HEADINGS = [
  "Our Global Structure",
  "Diversity, Equity and Inclusion",
  "Diversity, Equity & Inclusion",
  "What You'll Work On",
  "What You’ll Work On",
  "What You'll Do",
  "What You Will Do",
  "Key Responsibilities",
  "Responsibilities",
  "Required Qualifications",
  "Minimum Qualifications",
  "Basic Qualifications",
  "Requirements",
  "What We're Looking For",
  "Preferred Qualifications",
  "Nice to Have",
  "Bonus Points",
  "Compensation Structure",
  "Compensation & Benefits",
  "Compensation",
  "Benefits & Perks",
  "Benefits",
  "Hiring Process",
  "Interview Process",
  "Process",
  "Start Timeline & Availability",
  "Start Timeline",
  "Availability",
  "About the Role",
  "About the Company",
  "About Us",
  "Role Overview",
  "Tech Stack",
  "Skills Required",
];

function decodeHtmlEntities(input: string): string {
  const map: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
    "&rsquo;": "’",
    "&lsquo;": "‘",
    "&rdquo;": "”",
    "&ldquo;": "“",
    "&mdash;": "—",
    "&ndash;": "–",
    "&bull;": "•",
  };
  let out = input;
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(
      /&(amp|lt|gt|quot|#39|apos|nbsp|rsquo|lsquo|rdquo|ldquo|mdash|ndash|bull);/gi,
      (m) => map[m.toLowerCase()] ?? m
    );
  }
  return out;
}

function htmlToStructuredText(raw: string): string {
  let s = decodeHtmlEntities(raw || "").replace(/\r\n/g, "\n");

  // Promote HTML headings and standalone <p><strong>Heading</strong></p> blocks into section markers
  s = s.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_, inner) => {
    const clean = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return clean ? `\n\n## ${clean}\n\n` : "\n";
  });

  s = s.replace(/<p[^>]*>\s*<(?:strong|b)[^>]*>([^<]{2,80})<\/(?:strong|b)>\s*<\/p>/gi, (_, inner) => {
    const clean = inner.replace(/\s+/g, " ").trim();
    return clean && !clean.endsWith(".") ? `\n\n## ${clean}\n\n` : `\n${clean}\n`;
  });

  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<(br|hr)\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|section|article|ul|ol|tr|li)>/gi, "\n");

  // Strip all remaining HTML tags (including mismatched fragments like </strong></h2> or </em></p></div>)
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");

  // Remove aggregator footer links
  s = s.replace(/\s*Find Jobs in [^\n]*on Arbeitnow\s*$/gi, "").trim();

  // Normalize horizontal whitespace while keeping paragraph breaks
  const lines = s.split("\n").map((ln) => ln.replace(/[ \t]{2,}/g, " ").trim());
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function classifySection(heading: string): ParsedJobSection["kind"] {
  const hl = heading.toLowerCase();
  if (hl.includes("work") || hl.includes("responsib") || hl.includes("do")) return "work";
  if (
    hl.includes("qualif") ||
    hl.includes("require") ||
    hl.includes("looking") ||
    hl.includes("skill") ||
    hl.includes("stack") ||
    hl.includes("nice")
  )
    return "requirements";
  if (hl.includes("process") || hl.includes("interview")) return "process";
  if (hl.includes("comp") || hl.includes("benefit") || hl.includes("pay") || hl.includes("salary")) return "compensation";
  if (hl.includes("timeline") || hl.includes("availab")) return "timeline";
  return "overview";
}

function cleanInlineEnums(text: string): string {
  return text.replace(/\(remote_match\)/gi, "").replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
}

function splitContent(text: string, preferBullets: boolean): { paragraphs: string[]; bullets: string[] } {
  const rawLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const explicitBullets: string[] = [];
  const proseLines: string[] = [];

  for (const line of rawLines) {
    if (/^[-•*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      explicitBullets.push(line.replace(/^([-•*]|\d+[.)])\s+/, "").trim());
    } else {
      proseLines.push(line);
    }
  }

  // If text originally had multiple readable paragraphs, preserve them cleanly
  if (!preferBullets && explicitBullets.length === 0 && rawLines.length > 1) {
    const cleanParagraphs: string[] = [];
    for (const p of rawLines) {
      if (p.length <= 360) {
        cleanParagraphs.push(p);
      } else {
        const sents = (p.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [p]).map((x) => x.trim()).filter(Boolean);
        let buf: string[] = [];
        for (const s of sents) {
          buf.push(s);
          if (buf.length >= 2 || buf.join(" ").length >= 260) {
            cleanParagraphs.push(buf.join(" "));
            buf = [];
          }
        }
        if (buf.length > 0) cleanParagraphs.push(buf.join(" "));
      }
    }
    return { paragraphs: cleanParagraphs, bullets: [] };
  }

  const proseJoined = proseLines.join(" ").trim();
  if (!proseJoined) {
    return { paragraphs: [], bullets: explicitBullets };
  }

  const sentences = (proseJoined.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [proseJoined])
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  if (preferBullets && sentences.length >= 2 && explicitBullets.length === 0) {
    return {
      paragraphs: [],
      bullets: sentences,
    };
  }

  const paragraphs: string[] = [];
  let buf: string[] = [];

  for (const s of sentences) {
    buf.push(s);
    if (buf.length >= 2 || buf.join(" ").length >= 260) {
      paragraphs.push(buf.join(" "));
      buf = [];
    }
  }
  if (buf.length > 0) {
    paragraphs.push(buf.join(" "));
  }

  return { paragraphs, bullets: explicitBullets };
}

export function parseStructuredJobDescription(description: string, title?: string): ParsedJobContent {
  let working = htmlToStructuredText(description || "");
  const cleanFullText = working.replace(/^##\s+/gm, "");
  const wordCount = working ? working.split(/\s+/).length : 0;
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 180));

  if (title && working.toLowerCase().startsWith(title.toLowerCase())) {
    working = working.slice(title.length).trim();
  }

  const facts: Array<{ label: string; value: string }> = [];
  const factLabels = ["Pay", "Salary", "Compensation", "Location", "Job Type", "Schedule", "Duration"];
  const lookaheadAll = factLabels.map((l) => `${l}:`).concat(KNOWN_HEADINGS);

  for (const lbl of factLabels) {
    const regex = new RegExp(
      `(?:^|\\s)${lbl}:\\s*(.+?)(?=\\s+(?:${lookaheadAll.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})|$)`,
      "i"
    );
    const match = working.match(regex);
    if (match && match[1]) {
      const val = match[1].trim().replace(/[.;,\s]+$/, "");
      if (val && val.length <= 80 && !facts.some((f) => f.label.toLowerCase() === lbl.toLowerCase())) {
        facts.push({ label: lbl, value: val });
        working = working.replace(match[0], " ").trim();
      }
    }
  }

  const markers: Array<{ heading: string; start: number; end: number }> = [];

  // 1) Detect dynamic Markdown headings created from HTML <h2> / <p><strong>Title</strong></p>
  const mdHeadingRegex = /(?:^|\n)##\s+([^\n]+)/g;
  let mm: RegExpExecArray | null;
  while ((mm = mdHeadingRegex.exec(working)) !== null) {
    markers.push({
      heading: mm[1].trim(),
      start: mm.index,
      end: mm.index + mm[0].length,
    });
  }

  // 2) If no HTML/Markdown headings were present, detect known inline headings
  if (markers.length === 0) {
    const sortedHeadings = [...KNOWN_HEADINGS].sort((a, b) => b.length - a.length);
    const headingPattern = new RegExp(
      `(?:^|\\s+|\\n)(${sortedHeadings.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?::|\\s+)`,
      "g"
    );
    let m: RegExpExecArray | null;
    while ((m = headingPattern.exec(working)) !== null) {
      markers.push({
        heading: m[1].trim(),
        start: m.index,
        end: m.index + m[0].length,
      });
    }
  }

  const sections: ParsedJobSection[] = [];
  if (markers.length === 0) {
    const parsed = splitContent(working, false);
    sections.push({
      title: "Role Overview",
      kind: "overview",
      paragraphs: parsed.paragraphs,
      bullets: parsed.bullets,
    });
    return { facts, sections, estimatedMinutes, cleanFullText };
  }

  const intro = working.slice(0, markers[0].start).trim();
  if (intro.length > 15) {
    const parsedIntro = splitContent(intro, false);
    sections.push({
      title: "Role Overview",
      kind: "overview",
      paragraphs: parsedIntro.paragraphs,
      bullets: parsedIntro.bullets,
    });
  }

  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const nextStart = i + 1 < markers.length ? markers[i + 1].start : working.length;
    const chunk = working.slice(cur.end, nextStart).trim();
    if (!chunk) continue;
    const kind = classifySection(cur.heading);
    const preferBullets = kind === "work" || kind === "requirements" || kind === "process";
    const parsedChunk = splitContent(chunk, preferBullets);
    sections.push({
      title: cur.heading,
      kind,
      paragraphs: parsedChunk.paragraphs,
      bullets: parsedChunk.bullets,
    });
  }

  return { facts, sections, estimatedMinutes, cleanFullText };
}

export function formatExplanationPoints(text: string): { intro?: string; points: string[] } {
  const cleaned = cleanInlineEnums(text);
  const parts = cleaned
    .split(/\s+\*\s+|\n+[-*•]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { intro: cleaned, points: [] };
  }
  const hasIntro = parts[0].endsWith(":") || parts[0].toLowerCase().includes("because");
  return hasIntro ? { intro: parts[0], points: parts.slice(1) } : { intro: undefined, points: parts };
}

export function formatRankingReason(reason: string): string {
  return cleanInlineEnums(reason);
}
