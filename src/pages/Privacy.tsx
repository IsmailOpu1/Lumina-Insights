import LegalLayout from '@/components/LegalLayout';
import { LEGAL } from '@/lib/legal';

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      intro={`This policy explains what information ${LEGAL.businessName} collects, why, and who it is shared with. We only use your information to run the service for you.`}
      sections={[
        {
          heading: 'What we collect',
          body: (
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Account details:</strong> your name, email address and password (stored only in encrypted form).</li>
              <li><strong>Business profile:</strong> business name, type, description and currency.</li>
              <li><strong>Business records you enter:</strong> products, orders (including your customers' names), expenses, notes and saved marketing content.</li>
              <li><strong>Payment records:</strong> the plan, amount, date and payment method type. Card and mobile-wallet details are handled by SSLCommerz; we never see or store them.</li>
              <li><strong>Usage:</strong> how many AI requests your workspace makes, to apply plan limits.</li>
            </ul>
          ),
        },
        {
          heading: 'How we use it',
          body: <p>To provide the dashboard, alerts and AI features; to send invitation and account emails; to process payments and apply plan limits; and to keep the service secure. We do not sell your information or use it for advertising.</p>,
        },
        {
          heading: 'Who processes it for us',
          body: (
            <>
              <p>We use these providers to run the service:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>Supabase</strong> — database, sign-in and file storage (servers in Singapore).</li>
                <li><strong>Vercel</strong> — hosting of the web app.</li>
                <li><strong>Google (Gemini)</strong> — when you use an AI feature, a summary of your business data and your question are sent to Google to generate the answer.</li>
                <li><strong>Resend</strong> — sending invitation emails.</li>
                <li><strong>SSLCommerz</strong> — taking payments.</li>
              </ul>
              <p>Each provider only receives what it needs for its job.</p>
            </>
          ),
        },
        {
          heading: 'Who can see your business data',
          body: <p>Each business has its own workspace. Only you and the team members you invite can see its data, according to the role you give them. Our staff access it only when needed to support you or fix a problem.</p>,
        },
        {
          heading: 'How long we keep it',
          body: <p>We keep your data while your account exists, including after a plan expires, so you don't lose anything. If you ask us to delete your workspace, we delete it within 30 days, except payment records we must keep for accounting.</p>,
        },
        {
          heading: 'Your choices',
          body: <p>You can view, edit, export (on plans that include export) and delete your records in the app. To get a copy of all your data or delete your account, email {LEGAL.contactEmail}.</p>,
        },
        {
          heading: 'Security',
          body: <p>Data is sent over encrypted connections, and the database enforces that each workspace can only be accessed by its own members. No system is perfectly secure; if we learn of a breach affecting your data, we will tell you promptly.</p>,
        },
        {
          heading: 'Changes',
          body: <p>If we change this policy in a significant way, we will tell you by email or in the app before the change takes effect.</p>,
        },
      ]}
    />
  );
}
