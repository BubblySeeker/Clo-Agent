// ---------------------------------------------------------------------------
// Rich block detection for AI chat responses
// Scans text for structured patterns and returns typed blocks for rendering
// ---------------------------------------------------------------------------

export interface MetricsBarBlock {
  type: "metrics-bar";
  metrics: Array<{ label: string; value: string }>;
}

export interface KeyValueCardBlock {
  type: "key-value-card";
  title?: string;
  pairs: Array<{ label: string; value: string }>;
}

export interface MarkdownBlock {
  type: "markdown";
  content: string;
}

export type RichBlock = MetricsBarBlock | KeyValueCardBlock | MarkdownBlock;

// Matches **Label:** value on a single line
const BOLD_KV_RE = /^\*\*(.+?):\*\*\s+(.+)$/;

// Matches ## or ### header lines
const HEADER_RE = /^#{2,3}\s+(.+)$/;

// Check if a value looks numeric (contains digits, $, %, commas)
function isNumericValue(value: string): boolean {
  const cleaned = value.trim();
  if (!/\d/.test(cleaned)) return false;
  return cleaned.length < 30;
}

interface KVRun {
  startIdx: number;
  endIdx: number;
  pairs: Array<{ label: string; value: string }>;
  title?: string;
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------

/**
 * Detect structured data patterns in AI response text.
 * Returns an array of RichBlock objects for rendering.
 *
 * Detection:
 * - MetricsBar: 3+ consecutive bold-label lines with mostly numeric values
 * - KeyValueCard: 4+ consecutive bold-label lines with mixed values
 * - Everything else: plain markdown
 */
export function detectRichBlocks(text: string): RichBlock[] {
  // Strip any leftover :::tree fenced blocks — render their content as markdown
  const cleaned = text.replace(/:::tree\n([\s\S]*?):::/g, "$1");
  return detectKVBlocks(cleaned);
}

/**
 * Detect MetricsBar and KeyValueCard patterns.
 */
function detectKVBlocks(text: string): RichBlock[] {
  const lines = text.split("\n");
  const kvRuns: KVRun[] = [];

  // Pass 1: Find consecutive runs of **Label:** value lines
  let currentRun: KVRun | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      if (currentRun && currentRun.pairs.length >= 3) {
        kvRuns.push(currentRun);
      }
      currentRun = null;
      continue;
    }

    const kvMatch = trimmed.match(BOLD_KV_RE);
    if (kvMatch) {
      if (!currentRun) {
        let title: string | undefined;
        for (let j = i - 1; j >= 0; j--) {
          const prev = lines[j].trim();
          if (!prev) continue;
          const headerMatch = prev.match(HEADER_RE);
          if (headerMatch) {
            title = headerMatch[1];
          }
          break;
        }
        currentRun = { startIdx: i, endIdx: i, pairs: [], title };
      }
      currentRun.endIdx = i;
      currentRun.pairs.push({ label: kvMatch[1], value: kvMatch[2] });
    } else {
      if (currentRun && currentRun.pairs.length >= 3) {
        kvRuns.push(currentRun);
      }
      currentRun = null;
    }
  }

  if (currentRun && currentRun.pairs.length >= 3) {
    kvRuns.push(currentRun);
  }

  // Pass 2: If no runs detected, return entire text as markdown
  if (kvRuns.length === 0) {
    return [{ type: "markdown", content: text }];
  }

  // Pass 3: Classify runs and build output blocks
  const blocks: RichBlock[] = [];
  let lastEndIdx = -1;

  for (const run of kvRuns) {
    let preStart = lastEndIdx + 1;
    let runStart = run.startIdx;

    if (run.title) {
      for (let j = run.startIdx - 1; j >= preStart; j--) {
        const prev = lines[j].trim();
        if (!prev) continue;
        if (HEADER_RE.test(prev)) {
          runStart = j;
        }
        break;
      }
    }

    if (runStart > preStart) {
      const preMd = lines.slice(preStart, runStart).join("\n").trim();
      if (preMd) {
        blocks.push({ type: "markdown", content: preMd });
      }
    }

    const numericCount = run.pairs.filter((p) => isNumericValue(p.value)).length;
    const numericRatio = numericCount / run.pairs.length;

    if (run.pairs.length >= 3 && numericRatio >= 0.6) {
      blocks.push({ type: "metrics-bar", metrics: run.pairs });
    } else if (run.pairs.length >= 4) {
      blocks.push({ type: "key-value-card", title: run.title, pairs: run.pairs });
    } else {
      const md = lines.slice(runStart, run.endIdx + 1).join("\n").trim();
      if (md) {
        blocks.push({ type: "markdown", content: md });
      }
    }

    lastEndIdx = run.endIdx;
  }

  if (lastEndIdx < lines.length - 1) {
    const remaining = lines.slice(lastEndIdx + 1).join("\n").trim();
    if (remaining) {
      blocks.push({ type: "markdown", content: remaining });
    }
  }

  // Pass 4: Merge adjacent markdown blocks
  const merged: RichBlock[] = [];
  for (const block of blocks) {
    const prev = merged[merged.length - 1];
    if (block.type === "markdown" && prev?.type === "markdown") {
      prev.content += "\n\n" + block.content;
    } else {
      merged.push(block);
    }
  }

  return merged;
}
