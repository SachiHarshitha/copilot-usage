import type { Metadata } from 'next';
import { getRequestLocale } from '@/lib/i18n/server';
import type { AppLocale } from '@/lib/i18n/types';

export const metadata: Metadata = {
  title: 'Terms · promptstreak.dev',
  description: 'Terms of use for promptstreak.dev.',
};

interface TermsCopy {
  title: string;
  serviceHeading: string;
  serviceBody: string;
  acceptableUseHeading: string;
  acceptableUseItems: string[];
  suspensionHeading: string;
  suspensionBody: string;
  noWarrantyHeading: string;
  noWarrantyBody: string;
  changesHeading: string;
  changesBody: string;
}

const TERMS_COPY: Record<AppLocale, TermsCopy> = {
  en: {
    title: 'Terms of use',
    serviceHeading: 'Service',
    serviceBody:
      'promptstreak.dev is a free service that displays aggregated coding-assistant usage statistics that you upload from your editor or adapter.',
    acceptableUseHeading: 'Acceptable use',
    acceptableUseItems: [
      'Do not upload payloads containing raw prompts, completions, source code, secrets, terminal output or other content. Such uploads are rejected automatically.',
      'Do not abuse the rate limit, attempt to enumerate other users, or impersonate other developers.',
      'Public profile content (display name, repo aliases) must not contain unlawful, defamatory or infringing material.',
    ],
    suspensionHeading: 'Account suspension and deletion',
    suspensionBody:
      'We may suspend accounts that violate these terms. You may delete your account at any time from settings. Soft-deleted accounts are anonymized immediately and fully purged within the documented retention window.',
    noWarrantyHeading: 'No warranty',
    noWarrantyBody:
      'The service is provided "as is" without warranty of any kind. Statistics are self-reported estimates and may be inaccurate.',
    changesHeading: 'Changes',
    changesBody: 'We may update these terms. Material changes will be announced on the service before they take effect.',
  },
  de: {
    title: 'Nutzungsbedingungen',
    serviceHeading: 'Dienst',
    serviceBody:
      'promptstreak.dev ist ein kostenloser Dienst, der aggregierte Coding-Assistant-Nutzungsstatistiken anzeigt, die du aus deinem Editor oder Adapter hochlädst.',
    acceptableUseHeading: 'Zulässige Nutzung',
    acceptableUseItems: [
      'Lade keine Nutzdaten mit Roh-Prompts, Completions, Quellcode, Secrets, Terminalausgaben oder sonstigen Inhalten hoch. Solche Uploads werden automatisch abgewiesen.',
      'Missbrauche keine Rate-Limits, versuche keine Enumeration anderer Nutzer und gib dich nicht als andere Entwickler aus.',
      'Öffentliche Profilinhalte (Anzeigename, Repo-Aliase) dürfen keine rechtswidrigen, verleumderischen oder rechtsverletzenden Inhalte enthalten.',
    ],
    suspensionHeading: 'Kontosperrung und Löschung',
    suspensionBody:
      'Wir können Konten sperren, die gegen diese Bedingungen verstoßen. Du kannst dein Konto jederzeit in den Einstellungen löschen. Soft-gelöschte Konten werden sofort anonymisiert und innerhalb des dokumentierten Aufbewahrungsfensters vollständig entfernt.',
    noWarrantyHeading: 'Keine Gewährleistung',
    noWarrantyBody:
      'Der Dienst wird ohne jegliche Gewähr "wie besehen" bereitgestellt. Statistiken sind selbstberichtete Schätzwerte und können ungenau sein.',
    changesHeading: 'Änderungen',
    changesBody:
      'Wir können diese Bedingungen aktualisieren. Wesentliche Änderungen werden vor Inkrafttreten im Dienst angekündigt.',
  },
  zh: {
    title: '使用条款',
    serviceHeading: '服务说明',
    serviceBody:
      'promptstreak.dev 是一项免费服务，用于展示你从编辑器或适配器上传的聚合式编码助手使用统计。',
    acceptableUseHeading: '可接受使用',
    acceptableUseItems: [
      '请勿上传包含原始提示词、补全内容、源代码、密钥、终端输出或其他原始内容的数据。此类上传会被自动拒绝。',
      '请勿滥用限流、尝试枚举其他用户或冒充其他开发者。',
      '公开资料内容（显示名、仓库别名）不得包含违法、诽谤或侵权材料。',
    ],
    suspensionHeading: '账号暂停与删除',
    suspensionBody:
      '若账号违反本条款，我们可能会暂停账号。你可随时在设置中删除账号。软删除账号会立即匿名化，并在文档规定的保留周期内彻底清除。',
    noWarrantyHeading: '免责声明',
    noWarrantyBody: '本服务按“现状”提供，不附带任何形式保证。统计数据为用户上报估算值，可能存在误差。',
    changesHeading: '条款变更',
    changesBody: '我们可能更新本条款。重大变更将在生效前于服务内公布。',
  },
  es: {
    title: 'Terminos de uso',
    serviceHeading: 'Servicio',
    serviceBody:
      'promptstreak.dev es un servicio gratuito que muestra estadisticas agregadas de uso de asistentes de codigo que subes desde tu editor o adaptador.',
    acceptableUseHeading: 'Uso aceptable',
    acceptableUseItems: [
      'No subas cargas que incluyan prompts sin procesar, completions, codigo fuente, secretos, salida de terminal u otro contenido bruto. Esas cargas se rechazan automaticamente.',
      'No abuses del limite de peticiones, no intentes enumerar otros usuarios ni suplantar a otros desarrolladores.',
      'El contenido publico del perfil (nombre visible, alias de repos) no debe incluir material ilegal, difamatorio o que infrinja derechos.',
    ],
    suspensionHeading: 'Suspension y eliminacion de cuenta',
    suspensionBody:
      'Podemos suspender cuentas que infrinjan estos terminos. Puedes eliminar tu cuenta en cualquier momento desde la configuracion. Las cuentas con borrado suave se anonimizan de inmediato y se purgan por completo dentro de la ventana de retencion documentada.',
    noWarrantyHeading: 'Sin garantia',
    noWarrantyBody:
      'El servicio se proporciona "tal cual", sin garantias de ningun tipo. Las estadisticas son estimaciones autoinformadas y pueden ser inexactas.',
    changesHeading: 'Cambios',
    changesBody:
      'Podemos actualizar estos terminos. Los cambios materiales se anunciaran en el servicio antes de que entren en vigor.',
  },
};

export default async function TermsPage() {
  const locale = await getRequestLocale();
  const copy = TERMS_COPY[locale];

  return (
    <div className="max-w-2xl mx-auto w-full">
      <LegalCard title={copy.title} lastUpdated="2026-04-21">
        <Section heading={copy.serviceHeading}>
          <p>
            {copy.serviceBody}
          </p>
        </Section>

        <Section heading={copy.acceptableUseHeading}>
          <ul className="list-disc list-inside space-y-1.5">
            {copy.acceptableUseItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section heading={copy.suspensionHeading}>
          <p>{copy.suspensionBody}</p>
        </Section>

        <Section heading={copy.noWarrantyHeading}>
          <p>
            {copy.noWarrantyBody}
          </p>
        </Section>

        <Section heading={copy.changesHeading}>
          <p>
            {copy.changesBody}
          </p>
        </Section>
      </LegalCard>
    </div>
  );
}

function LegalCard({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-xl p-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{title}</h1>
        <span className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-elevated)] border border-[var(--card-border)] rounded px-2 py-0.5">
          Last updated: {lastUpdated}
        </span>
      </div>
      <div className="divide-y divide-[var(--surface-hover)]">{children}</div>
    </div>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="pt-6 first:pt-0 pb-6 last:pb-0">
      <h2 className="text-base font-semibold text-[var(--foreground)] mb-3">{heading}</h2>
      <div className="text-sm text-[var(--text-secondary)] leading-relaxed space-y-2">{children}</div>
    </div>
  );
}
