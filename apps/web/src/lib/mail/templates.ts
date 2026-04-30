/**
 * Typed registry of mail templates. Each template has a stable id used as
 * the `templateId` in `MailLog`, plus pure render functions that produce the
 * subject and the HTML/text bodies from a typed `vars` payload.
 *
 * Phase G.1 ships only the registry shape and a stub used by tests. G.2 and
 * G.3 add real admin / user templates without changing this file.
 */

export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

export interface MailTemplate<V> {
  id: string;
  render: (vars: V) => RenderedMail;
}

export type AnyMailTemplate = MailTemplate<Record<string, unknown>>;

/**
 * Mutable registry: templates self-register at module load. We expose `get`
 * rather than the underlying map so callers cannot accidentally mutate it.
 */
const registry = new Map<string, AnyMailTemplate>();

export function registerMailTemplate<V>(template: MailTemplate<V>): void {
  if (registry.has(template.id)) {
    throw new Error(`mail template "${template.id}" registered twice`);
  }
  registry.set(template.id, template as AnyMailTemplate);
}

export function getMailTemplate(id: string): AnyMailTemplate {
  const t = registry.get(id);
  if (!t) {
    throw new Error(`unknown mail template "${id}"`);
  }
  return t;
}

/** Test-only: clear all registered templates. */
export function _resetMailTemplates(): void {
  registry.clear();
}
