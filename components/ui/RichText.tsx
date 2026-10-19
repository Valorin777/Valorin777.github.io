import { Fragment } from "react";

/** Renders the only markup content may use: **bold** → accent-coloured emphasis. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-accent-text">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

/** Plain text without markup, for aria labels and speech. */
export function stripMarkup(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}
