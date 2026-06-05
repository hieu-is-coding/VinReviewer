const ENTITY_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

const ENTITY_RE = /[&<>"']/g;

export function escapeHtml(str: string): string {
  return str.replace(ENTITY_RE, (ch) => ENTITY_MAP[ch]);
}
