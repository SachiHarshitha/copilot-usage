import type { Metadata } from 'next';
import Link from 'next/link';
import { getRequestLocale } from '@/lib/i18n/server';
import type { AppLocale } from '@/lib/i18n/types';

export const metadata: Metadata = {
  title: 'Impressum · promptstreak.dev',
  description: 'Legal disclosure (Impressum) for promptstreak.dev under § 5 DDG.',
};

interface ImpressumCopy {
  title: string;
  legalHeading: string;
  legalBody: string;
  contactHeading: string;
  contactPrefix: string;
  contactLinkText: string;
  reportPrefix: string;
  reportLinkText: string;
  disclaimerHeading: string;
  disclaimerBody: string;
  disputeHeading: string;
  disputeBody: string;
}

const IMPRESSUM_COPY: Record<AppLocale, ImpressumCopy> = {
  de: {
    title: 'Impressum',
    legalHeading: 'Angaben gemäß § 5 DDG',
    legalBody:
      'Verantwortlich für den Inhalt dieser Website ist der Betreiber von promptstreak.dev. Die Kontaktdaten gemäß § 5 DDG sowie die nach § 18 Abs. 2 MStV verantwortliche Person werden vor dem öffentlichen Launch ergänzt.',
    contactHeading: 'Kontakt',
    contactPrefix: 'Anfragen zu Datenschutz, Sicherheit und Missbrauchsmeldungen richten Sie bitte über die',
    contactLinkText: 'Kontaktseite',
    reportPrefix: 'bzw. das Formular auf',
    reportLinkText: 'Missbrauch melden',
    disclaimerHeading: 'Haftungsausschluss',
    disclaimerBody:
      'Die auf promptstreak.dev angezeigten Nutzungsstatistiken sind selbstberichtete Schätzungen aus lokalen VS Code- bzw. Adapter-Daten. Die Plattform steht in keiner Verbindung zu GitHub, Microsoft oder anderen Anbietern.',
    disputeHeading: 'Streitbeilegung',
    disputeBody:
      'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit. Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
  },
  en: {
    title: 'Legal notice',
    legalHeading: 'Information according to § 5 DDG',
    legalBody:
      'The operator of promptstreak.dev is responsible for this website. Contact information under § 5 DDG and the person responsible under § 18(2) MStV will be completed before public launch.',
    contactHeading: 'Contact',
    contactPrefix: 'For privacy, security, or abuse inquiries, please use the',
    contactLinkText: 'contact page',
    reportPrefix: 'or the form at',
    reportLinkText: 'report abuse',
    disclaimerHeading: 'Disclaimer',
    disclaimerBody:
      'Usage statistics shown on promptstreak.dev are self-reported estimates derived from local VS Code or adapter data. The platform is not affiliated with GitHub, Microsoft, or other providers.',
    disputeHeading: 'Dispute resolution',
    disputeBody:
      'The European Commission provides an Online Dispute Resolution platform. We are neither obligated nor willing to participate in dispute resolution proceedings before a consumer arbitration board.',
  },
  zh: {
    title: '法律声明',
    legalHeading: '依据 § 5 DDG 的信息',
    legalBody:
      'promptstreak.dev 的运营方对本网站内容负责。依据 § 5 DDG 的联系方式以及依据 § 18(2) MStV 的责任人信息将在公开上线前补充。',
    contactHeading: '联系',
    contactPrefix: '关于隐私、安全或滥用举报，请使用',
    contactLinkText: '联系页面',
    reportPrefix: '或',
    reportLinkText: '举报滥用',
    disclaimerHeading: '免责声明',
    disclaimerBody:
      'promptstreak.dev 展示的使用统计为来自本地 VS Code 或适配器数据的用户自报估算值。该平台与 GitHub、Microsoft 或其他提供方无关联。',
    disputeHeading: '争议解决',
    disputeBody:
      '欧盟委员会提供在线争议解决平台。我们没有义务且不愿参与消费者仲裁机构的争议解决程序。',
  },
  es: {
    title: 'Aviso legal',
    legalHeading: 'Informacion segun § 5 DDG',
    legalBody:
      'El operador de promptstreak.dev es responsable del contenido de este sitio web. Los datos de contacto segun § 5 DDG y la persona responsable segun § 18(2) MStV se completaran antes del lanzamiento publico.',
    contactHeading: 'Contacto',
    contactPrefix: 'Para consultas de privacidad, seguridad o abuso, usa la',
    contactLinkText: 'pagina de contacto',
    reportPrefix: 'o el formulario de',
    reportLinkText: 'reportar abuso',
    disclaimerHeading: 'Descargo de responsabilidad',
    disclaimerBody:
      'Las estadisticas mostradas en promptstreak.dev son estimaciones autoinformadas basadas en datos locales de VS Code o del adaptador. La plataforma no esta afiliada con GitHub, Microsoft ni otros proveedores.',
    disputeHeading: 'Resolucion de disputas',
    disputeBody:
      'La Comision Europea ofrece una plataforma de resolucion de disputas en linea. No estamos obligados ni dispuestos a participar en procedimientos ante una junta de arbitraje de consumo.',
  },
};

export default async function ImpressumPage() {
  const locale = await getRequestLocale();
  const copy = IMPRESSUM_COPY[locale];

  return (
    <div className="max-w-2xl mx-auto w-full">
      <LegalCard title={copy.title} lastUpdated="2026-04-21">
        <Section heading={copy.legalHeading}>
          <p>
            {copy.legalBody}
          </p>
        </Section>

        <Section heading={copy.contactHeading}>
          <p>
            {copy.contactPrefix}{' '}
            <Link href="/contact" className={linkClass}>
              {copy.contactLinkText}
            </Link>{' '}
            {copy.reportPrefix}{' '}
            <Link href="/report-abuse" className={linkClass}>
              {copy.reportLinkText}
            </Link>
            .
          </p>
        </Section>

        <Section heading={copy.disclaimerHeading}>
          <p>
            {copy.disclaimerBody}
          </p>
        </Section>

        <Section heading={copy.disputeHeading}>
          <p>
            {copy.disputeBody}{' '}
            <a
              href="https://ec.europa.eu/consumers/odr"
              rel="noopener noreferrer"
              className={linkClass}
            >
              https://ec.europa.eu/consumers/odr
            </a>
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

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="pt-6 first:pt-0 pb-6 last:pb-0">
      <h2 className="text-base font-semibold text-white mb-3">{heading}</h2>
      <div className="text-sm text-[#8b949e] leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

const linkClass = 'text-brand-400 hover:text-brand-300 underline underline-offset-2';

