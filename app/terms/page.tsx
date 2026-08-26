import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms of Service | Basis" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      summary="These terms cover access to Basis and the limits of its planning estimates. The short version: use the tool to think more clearly, not as a substitute for a licensed professional who signs their name to the result."
      updated="August 25, 2026"
      sections={[
        { title: "Using Basis", paragraphs: [
          <>You must use accurate account information, protect your sign-in credentials, and access only profiles you are authorized to use. You may not probe, disrupt, reverse engineer, or use the service to violate law or another person&apos;s rights.</>,
          <>Access may be limited to invited users while Basis is in testing. Basis can suspend access when reasonably necessary to protect users, data, providers, or the service.</>,
        ] },
        { title: "Planning estimates, not professional advice", paragraphs: [
          <>Basis provides informational calculations and planning estimates. It does not provide tax, legal, accounting, or investment advice, and it is not a broker, adviser, bank, tax preparer, or fiduciary.</>,
          <>Market prices, institution feeds, tax assumptions, imported documents, cost basis, and AI-generated explanations can be delayed, incomplete, or wrong. Verify important decisions with original records and qualified professionals. Your concentrated position may be objectively spicy; the decision to sell it is still yours.</>,
        ] },
        { title: "Connected services", paragraphs: [
          <>Basis depends on third-party services such as Google, Plaid, financial institutions, hosting providers, and AI providers. Their availability and terms can change, and Basis is not responsible for outages, errors, or acts controlled by those providers.</>,
          <>You authorize Basis and its providers to retrieve and process the data needed to provide features you choose to use. You can revoke supported connections from the product or the relevant provider.</>,
        ] },
        { title: "Availability and liability", paragraphs: [
          <>The service is provided on an as-available basis without guarantees that every calculation, connection, or recommendation will be uninterrupted or error-free. To the maximum extent allowed by law, Basis is not liable for indirect, special, incidental, or consequential losses arising from use of the service.</>,
          <>Do not use Basis as the only record of your finances. Keep source statements and tax documents somewhere more durable than a weekend software project with excellent jokes.</>,
        ] },
        { title: "Changes and contact", paragraphs: [
          <>Basis may update these terms as the product changes. Continued use after an update means you accept the revised terms. If a material change affects your rights, Basis will provide reasonable notice when practical.</>,
          <>Questions about these terms can be sent to <a className="font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100" href="mailto:ryanho87@gmail.com">ryanho87@gmail.com</a>.</>,
        ] },
      ]}
    />
  );
}
