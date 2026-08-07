const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * HTML-escape a string for safe innerHTML interpolation. All API-sourced
 * values (line, destination, cause, raw_text) flow through this before being
 * rendered, so Trafiklab data can never inject markup.
 */
export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}
