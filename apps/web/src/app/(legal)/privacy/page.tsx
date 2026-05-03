import type { Metadata } from 'next';
import Link from 'next/link';
import { getRequestLocale } from '@/lib/i18n/server';
import type { AppLocale } from '@/lib/i18n/types';

export const metadata: Metadata = {
  title: 'Privacy · promptstreak.dev',
  description:
    'Privacy notice for promptstreak.dev — what we collect, why, and how to exercise your GDPR rights.',
};

interface PrivacyCopy {
  title: string;
  summaryHeading: string;
  summaryBody: string;
  cookiesHeading: string;
  cookiesBody: string;
  dataHeading: string;
  dataItems: string[];
  legalBasisHeading: string;
  legalBasisBody: string;
  rightsHeading: string;
  rightsItems: string[];
  subprocessorsHeading: string;
  subprocessorsBody: string;
  contactHeading: string;
  contactPrefix: string;
  contactLinkText: string;
  abusePrefix: string;
  abuseLinkText: string;
}

const PRIVACY_COPY: Record<AppLocale, PrivacyCopy> = {
  en: {
    title: 'Privacy notice',
    summaryHeading: 'Summary',
    summaryBody:
      'promptstreak.dev shows aggregated coding-assistant usage statistics that you choose to upload from your editor or adapter. We never receive your prompts, completions, source code, terminal output, secrets, environment variables, diffs, patches or chat transcripts. The ingestion endpoint actively rejects payloads that contain such fields.',
    cookiesHeading: 'Cookies',
    cookiesBody:
      'We use only essential cookies required for sign-in sessions and CSRF protection. We do not use analytics, advertising or tracking cookies. Therefore no cookie consent banner is shown.',
    dataHeading: 'Data we process',
    dataItems: [
      'GitHub OAuth profile (id, username, avatar, email).',
      'Aggregated usage telemetry: per-day and per-repo request counts, token totals, model identifiers and adapter version. No raw content.',
      'Hashed device identifiers and IP-derived rate-limit tokens. The raw IP is hashed with a server-side salt and never stored.',
      'Audit log entries for security-relevant actions (e.g. account deletion). These records reference your account by id only.',
    ],
    legalBasisHeading: 'Legal basis',
    legalBasisBody:
      'Processing is based on Art. 6(1)(b) GDPR (performance of the service you signed up for) and Art. 6(1)(f) GDPR (legitimate interest in service security and abuse prevention).',
    rightsHeading: 'Your rights',
    rightsItems: [
      'Access & export: request a machine-readable copy of your data from account settings.',
      'Erasure: delete your account from settings; soft-delete is immediate, full purge follows the documented retention window.',
      'Rectification: change your display name and public profile flag in settings at any time.',
      'Complaint: you can lodge a complaint with your local data protection authority.',
    ],
    subprocessorsHeading: 'Sub-processors',
    subprocessorsBody:
      'We host on a single EU region with managed PostgreSQL and use GitHub for OAuth. No data is sold or shared with third parties for marketing.',
    contactHeading: 'Contact',
    contactPrefix: 'Privacy questions:',
    contactLinkText: 'contact',
    abusePrefix: 'Abuse reports:',
    abuseLinkText: 'report abuse',
  },
  de: {
    title: 'Datenschutzhinweis',
    summaryHeading: 'Zusammenfassung',
    summaryBody:
      'promptstreak.dev zeigt aggregierte Coding-Assistant-Nutzungsstatistiken an, die du selbst aus deinem Editor oder Adapter hochlädst. Wir erhalten niemals deine Prompts, Completions, Quellcode, Terminalausgaben, Geheimnisse, Umgebungsvariablen, Diffs, Patches oder Chat-Transkripte. Der Ingestion-Endpunkt weist solche Felder aktiv zurück.',
    cookiesHeading: 'Cookies',
    cookiesBody:
      'Wir verwenden nur essenzielle Cookies für Anmeldungssitzungen und CSRF-Schutz. Wir verwenden keine Analyse-, Werbe- oder Tracking-Cookies. Daher zeigen wir kein Cookie-Banner an.',
    dataHeading: 'Verarbeitete Daten',
    dataItems: [
      'GitHub-OAuth-Profildaten (ID, Benutzername, Avatar, E-Mail).',
      'Aggregierte Nutzungsdaten: tägliche und repo-bezogene Request-Zahlen, Token-Summen, Modellkennungen und Adapter-Version. Keine Rohinhalte.',
      'Gehashte Gerätekennungen und IP-abgeleitete Rate-Limit-Token. Die Roh-IP wird mit serverseitigem Salt gehasht und nie gespeichert.',
      'Audit-Log-Einträge für sicherheitsrelevante Aktionen (z. B. Kontolöschung). Diese Einträge referenzieren dein Konto nur über die ID.',
    ],
    legalBasisHeading: 'Rechtsgrundlage',
    legalBasisBody:
      'Die Verarbeitung beruht auf Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) und Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an Sicherheit und Missbrauchsprävention).',
    rightsHeading: 'Deine Rechte',
    rightsItems: [
      'Auskunft & Export: Fordere in den Kontoeinstellungen eine maschinenlesbare Kopie deiner Daten an.',
      'Löschung: Lösche dein Konto in den Einstellungen; Soft-Delete erfolgt sofort, die vollständige Löschung folgt dem dokumentierten Aufbewahrungsfenster.',
      'Berichtigung: Ändere Anzeigename und öffentliche Profilsichtbarkeit jederzeit in den Einstellungen.',
      'Beschwerde: Du kannst dich bei deiner zuständigen Datenschutzaufsichtsbehörde beschweren.',
    ],
    subprocessorsHeading: 'Unterauftragsverarbeiter',
    subprocessorsBody:
      'Wir hosten in einer EU-Region mit Managed PostgreSQL und verwenden GitHub für OAuth. Daten werden nicht zu Marketingzwecken verkauft oder an Dritte weitergegeben.',
    contactHeading: 'Kontakt',
    contactPrefix: 'Datenschutzfragen:',
    contactLinkText: 'Kontakt',
    abusePrefix: 'Missbrauchsmeldungen:',
    abuseLinkText: 'Missbrauch melden',
  },
  zh: {
    title: '隐私说明',
    summaryHeading: '摘要',
    summaryBody:
      'promptstreak.dev 展示你自愿从编辑器或适配器上传的聚合式编码助手使用统计。我们不会接收你的原始提示词、补全、源代码、终端输出、密钥、环境变量、差异补丁或聊天记录。摄取接口会主动拒绝包含此类字段的载荷。',
    cookiesHeading: 'Cookies',
    cookiesBody:
      '我们仅使用用于登录会话和 CSRF 防护的必要 Cookie。我们不使用分析、广告或跟踪 Cookie，因此不显示 Cookie 同意横幅。',
    dataHeading: '我们处理的数据',
    dataItems: [
      'GitHub OAuth 资料（ID、用户名、头像、邮箱）。',
      '聚合遥测数据：按天和按仓库的请求数、Token 总量、模型标识和适配器版本。不含原始内容。',
      '设备标识哈希与基于 IP 的限流令牌。原始 IP 会经服务端盐值哈希处理且不会存储。',
      '安全相关操作的审计日志（如账号删除）。这些记录仅通过账号 ID 关联。',
    ],
    legalBasisHeading: '法律依据',
    legalBasisBody:
      '处理依据为 GDPR 第 6(1)(b) 条（履行你请求的服务）和第 6(1)(f) 条（服务安全与防滥用的正当利益）。',
    rightsHeading: '你的权利',
    rightsItems: [
      '访问与导出：可在账号设置中申请机器可读的数据副本。',
      '删除：可在设置中删除账号；软删除会立即生效，完整清除按文档中的保留窗口执行。',
      '更正：可随时在设置中修改显示名和公开资料开关。',
      '投诉：你可向所在地数据保护机构提出投诉。',
    ],
    subprocessorsHeading: '子处理方',
    subprocessorsBody:
      '我们在单一欧盟区域托管并使用托管 PostgreSQL，OAuth 使用 GitHub。我们不会出于营销目的出售或共享数据。',
    contactHeading: '联系',
    contactPrefix: '隐私问题：',
    contactLinkText: '联系页面',
    abusePrefix: '滥用举报：',
    abuseLinkText: '举报滥用',
  },
  es: {
    title: 'Aviso de privacidad',
    summaryHeading: 'Resumen',
    summaryBody:
      'promptstreak.dev muestra estadisticas agregadas de uso de asistentes de codigo que eliges subir desde tu editor o adaptador. Nunca recibimos prompts, completions, codigo fuente, salida de terminal, secretos, variables de entorno, diffs, parches ni transcripciones de chat. El endpoint de ingesta rechaza activamente cargas con esos campos.',
    cookiesHeading: 'Cookies',
    cookiesBody:
      'Solo usamos cookies esenciales para sesiones de inicio de sesion y proteccion CSRF. No usamos cookies de analitica, publicidad ni rastreo. Por eso no mostramos banner de consentimiento.',
    dataHeading: 'Datos que procesamos',
    dataItems: [
      'Perfil OAuth de GitHub (id, usuario, avatar, correo).',
      'Telemetria agregada: conteos diarios y por repositorio de solicitudes, totales de tokens, identificadores de modelo y version de adaptador. Sin contenido bruto.',
      'Identificadores de dispositivo hasheados y tokens de limite derivados de IP. La IP en bruto se hashea con sal del servidor y no se almacena.',
      'Entradas de auditoria para acciones de seguridad (por ejemplo, eliminacion de cuenta). Esos registros referencian la cuenta solo por id.',
    ],
    legalBasisHeading: 'Base legal',
    legalBasisBody:
      'El tratamiento se basa en el art. 6(1)(b) del RGPD (prestacion del servicio) y el art. 6(1)(f) del RGPD (interes legitimo en seguridad y prevencion de abuso).',
    rightsHeading: 'Tus derechos',
    rightsItems: [
      'Acceso y exportacion: solicita una copia legible por maquina de tus datos desde la configuracion de cuenta.',
      'Supresion: elimina tu cuenta desde configuracion; el borrado suave es inmediato y la purga completa sigue la ventana de retencion documentada.',
      'Rectificacion: cambia tu nombre visible y el ajuste de perfil publico en cualquier momento desde configuracion.',
      'Reclamacion: puedes presentar una reclamacion ante tu autoridad local de proteccion de datos.',
    ],
    subprocessorsHeading: 'Subencargados',
    subprocessorsBody:
      'Alojamos en una sola region de la UE con PostgreSQL gestionado y usamos GitHub para OAuth. No vendemos ni compartimos datos con terceros para marketing.',
    contactHeading: 'Contacto',
    contactPrefix: 'Preguntas de privacidad:',
    contactLinkText: 'contacto',
    abusePrefix: 'Reportes de abuso:',
    abuseLinkText: 'reportar abuso',
  },
};

export default async function PrivacyPage() {
  const locale = await getRequestLocale();
  const copy = PRIVACY_COPY[locale];

  return (
    <div className="max-w-2xl mx-auto w-full">
      <LegalCard title={copy.title} lastUpdated="2026-04-21">
        <Section id="summary" heading={copy.summaryHeading}>
          <p>
            {copy.summaryBody}
          </p>
        </Section>

        <Section id="cookies" heading={copy.cookiesHeading}>
          <p>
            {copy.cookiesBody}
          </p>
        </Section>

        <Section id="data" heading={copy.dataHeading}>
          <ul className="list-disc list-inside space-y-1.5">
            {copy.dataItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section id="legal-basis" heading={copy.legalBasisHeading}>
          <p>
            {copy.legalBasisBody}
          </p>
        </Section>

        <Section id="rights" heading={copy.rightsHeading}>
          <ul className="list-disc list-inside space-y-1.5">
            {copy.rightsItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section id="sub-processors" heading={copy.subprocessorsHeading}>
          <p>
            {copy.subprocessorsBody}
          </p>
        </Section>

        <Section id="contact" heading={copy.contactHeading}>
          <p>
            {copy.contactPrefix}{' '}
            <Link href="/contact" className={linkClass}>
              {copy.contactLinkText}
            </Link>
            . {copy.abusePrefix}{' '}
            <Link href="/report-abuse" className={linkClass}>
              {copy.abuseLinkText}
            </Link>
            .
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
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <span className="text-xs text-[#484f58] bg-[#161b22] border border-[#30363d] rounded px-2 py-0.5">
          Last updated: {lastUpdated}
        </span>
      </div>
      <div className="divide-y divide-[#21262d]">{children}</div>
    </div>
  );
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="pt-6 first:pt-0 pb-6 last:pb-0">
      <h2 className="text-base font-semibold text-white mb-3">{heading}</h2>
      <div className="text-sm text-[#8b949e] leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

const linkClass = 'text-brand-400 hover:text-brand-300 underline underline-offset-2';

