import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy | Basis" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary="Basis handles unusually personal financial information. This policy explains what the app collects, why it needs it, and where your data goes. Spoiler: not into an ad-targeting blender."
      updated="August 25, 2026"
      sections={[
        { title: "Information Basis collects", paragraphs: [
          <>Basis stores the identity information you provide during sign-in, financial account and transaction data you choose to connect through Plaid or other integrations, documents you upload, and planning inputs you enter. This can include balances, holdings, cost basis, income, tax details, equity compensation, and liabilities.</>,
          <>When you sign in with Google, Basis receives basic account information needed to authenticate you, such as your name, email address, profile image, and Google account identifier. Basis does not request access to Gmail, Drive, contacts, or your Google password.</>,
        ] },
        { title: "How the information is used", paragraphs: [
          <>Your data is used to calculate net worth, reconcile account history, estimate taxes and cost basis, generate planning scenarios, and answer questions you ask inside the product. It is also used to secure your account, operate integrations, diagnose failures, and improve the reliability of those calculations.</>,
          <>Basis does not sell your personal information or use your financial data for third-party advertising. The roast is for you, not for an ad auction.</>,
        ] },
        { title: "Service providers", paragraphs: [
          <>Basis may send the minimum necessary data to providers that operate the service, including authentication, database, hosting, financial-data aggregation, document processing, and AI inference providers. Those providers process data on Basis&apos;s behalf under their own security and privacy obligations.</>,
          <>Institution credentials entered into Plaid Link are handled by Plaid and the relevant financial institution. Basis stores provider tokens or developer credentials only as needed to maintain connections, and encrypts supported secrets at rest.</>,
        ] },
        { title: "Data control and retention", paragraphs: [
          <>You can disconnect financial institutions and request deletion of your Basis account and associated personal data. Some records may be retained when reasonably necessary for security, dispute resolution, legal obligations, or backups before they cycle out.</>,
          <>To request access, correction, export, or deletion, contact <a className="font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100" href="mailto:ryanho87@gmail.com">ryanho87@gmail.com</a>.</>,
        ] },
        { title: "Security and changes", paragraphs: [
          <>Basis uses access controls, encrypted transport, account-level data separation, and secret encryption where supported. No internet service can promise zero risk, so do not upload information the product does not need.</>,
          <>This policy may change as Basis adds providers or capabilities. Material changes will be reflected here with an updated date.</>,
        ] },
      ]}
    />
  );
}
