import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Impressum · promptstreak.dev',
  description: 'Legal disclosure (Impressum) for promptstreak.dev under § 5 DDG.',
};

export default function ImpressumPage() {
  return (
    <div className="max-w-2xl mx-auto w-full">
      <LegalCard title="Impressum" lastUpdated="2026-04-21">
        <Section heading="Angaben gemäß § 5 DDG">
          <p>
            Verantwortlich für den Inhalt dieser Website ist der Betreiber von promptstreak.dev.
            Die Kontaktdaten gemäß § 5 DDG sowie die nach § 18 Abs. 2 MStV verantwortliche Person
            werden vor dem öffentlichen Launch ergänzt.
          </p>
        </Section>

        <Section heading="Kontakt">
          <p>
            Anfragen zu Datenschutz, Sicherheit und Missbrauchsmeldungen richten Sie bitte über
            die{' '}
            <Link href="/contact" className={linkClass}>
              Kontaktseite
            </Link>{' '}
            bzw. das Formular auf{' '}
            <Link href="/report-abuse" className={linkClass}>
              Missbrauch melden
            </Link>
            .
          </p>
        </Section>

        <Section heading="Haftungsausschluss">
          <p>
            Die auf promptstreak.dev angezeigten Nutzungsstatistiken sind selbstberichtete
            Schätzungen aus lokalen VS Code- bzw. Adapter-Daten. Die Plattform steht in keiner
            Verbindung zu GitHub, Microsoft oder anderen Anbietern.
          </p>
        </Section>

        <Section heading="Streitbeilegung">
          <p>
            Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS)
            bereit:{' '}
            <a
              href="https://ec.europa.eu/consumers/odr"
              rel="noopener noreferrer"
              className={linkClass}
            >
              https://ec.europa.eu/consumers/odr
            </a>
            . Wir sind nicht verpflichtet und nicht bereit, an einem
            Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.
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

