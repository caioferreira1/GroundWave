import { Fragment, type ReactNode } from "react";

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>;
  });
}

/**
 * Minimal, dependency-free markdown for persona fichas: `#`/`##` headers,
 * `**bold**`, `-`/`*` lists, and paragraphs — covers what
 * scripts/import-personas.ts-authored fichas actually use, without pulling
 * in a full markdown parser for one read-only view.
 */
export function PersonaMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let listBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc space-y-1 pl-5 marker:text-border-strong">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  }

  function flushParagraph() {
    if (paragraphBuffer.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed">
        {renderInline(paragraphBuffer.join(" "), `p-${blocks.length}`)}
      </p>,
    );
    paragraphBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="pt-1 text-sm font-semibold text-ink">
          {renderInline(line.slice(3), `h3-${blocks.length}`)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="pt-1 text-base font-semibold text-ink">
          {renderInline(line.slice(2), `h2-${blocks.length}`)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      listBuffer.push(line.slice(2));
      continue;
    }
    flushList();
    paragraphBuffer.push(line);
  }
  flushParagraph();
  flushList();

  return <div className="max-w-2xl space-y-3 text-sm text-ink-muted">{blocks}</div>;
}
