import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Impressum · promptstreak.dev',
  description: 'Legal disclosure (Impressum) for promptstreak.dev under § 5 DDG.',
};

export default function ImpressumPage() {
  return (
    <article className="prose prose-invert max-w-2xl">
      <h1>Impressum</h1>
      <p className="text-sm text-[#8b949e]">Last updated: 2026-04-21</p>

      <h2>Angaben gemäß § 5 DDG</h2>
      <p>
        Verantwortlich für den Inhalt dieser Website ist der Betreiber von
        promptstreak.dev. Die Kontaktdaten gemäß § 5 DDG sowie die nach
        § 18 Abs. 2 MStV verantwortliche Person werden vor dem öffentlichen
        Launch ergänzt.
      </p>

      <h2>Kontakt</h2>
      <p>
        Anfragen zu Datenschutz, Sicherheit und Missbrauchsmeldungen richten
        Sie bitte über die <a href="/contact">Kontaktseite</a> bzw. das
        Formular auf <a href="/report-abuse">Missbrauch melden</a>.
      </p>

      <h2>Haftungsausschluss</h2>
      <p>
        Die auf promptstreak.dev angezeigten Nutzungsstatistiken sind
        selbstberichtete Schätzungen aus lokalen VS Code- bzw. Adapter-Daten.
        Die Plattform steht in keiner Verbindung zu GitHub, Microsoft oder
        anderen Anbietern.
      </p>

      <h2>Streitbeilegung</h2>
      <p>
        Die Europäische Kommission stellt eine Plattform zur
        Online-Streitbeilegung (OS) bereit:
        <a href="https://ec.europa.eu/consumers/odr" rel="noopener noreferrer">
          https://ec.europa.eu/consumers/odr
        </a>
        . Wir sind nicht verpflichtet und nicht bereit, an einem
        Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle
        teilzunehmen.
      </p>
    </article>
  );
}
