/** Return the URL only if it is a safe http(s) link; otherwise undefined.
 *  Guards against javascript:/data:/vbscript: scheme injection in href. */
export function safeHttpUrl(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    return (u.protocol === "http:" || u.protocol === "https:") ? raw : undefined;
  } catch {
    return undefined;
  }
}
