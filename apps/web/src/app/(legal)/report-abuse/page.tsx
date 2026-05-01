import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Report abuse · promptstreak.dev',
  description:
    'Report abuse, harassment or content violations on promptstreak.dev.',
};

export default function ReportAbusePage() {
  return (
    <article className="prose prose-invert max-w-2xl">
      <h1>Report abuse</h1>
      <p>
        Use this page to report harassment, impersonation, unlawful
        content, or any other violation of our{' '}
        <a href="/terms">Terms of Use</a>.
      </p>
      <p>
        A self-service abuse-report form will be available before public
        launch. Until then, please send a written report to the contact
        address listed in the <a href="/impressum">Impressum</a> and
        include:
      </p>
      <ul>
        <li>The URL of the offending profile, repo or badge.</li>
        <li>A short description of the violation.</li>
        <li>Your contact email so we can confirm receipt.</li>
      </ul>
      <p>
        We acknowledge legitimate reports within a reasonable time and act
        on confirmed violations by suspending the account, redacting the
        content, or deleting the account in accordance with our{' '}
        <a href="/privacy">privacy notice</a>.
      </p>
    </article>
  );
}
