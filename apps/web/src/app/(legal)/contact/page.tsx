import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact · promptstreak.dev',
  description: 'Contact promptstreak.dev for privacy, security or general questions.',
};

export default function ContactPage() {
  return (
    <article className="prose prose-invert max-w-2xl">
      <h1>Contact</h1>
      <p>
        For privacy, security or general questions about promptstreak.dev,
        please open an issue on the project repository or use the contact
        address listed in the <a href="/impressum">Impressum</a> once it is
        published before public launch.
      </p>
      <p>
        For abuse, harassment or content takedown requests, see{' '}
        <a href="/report-abuse">Report abuse</a>.
      </p>
    </article>
  );
}
