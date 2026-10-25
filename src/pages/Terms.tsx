import LegalLayout from '@/components/LegalLayout';
import { LEGAL } from '@/lib/legal';

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      intro={`These terms are an agreement between you and ${LEGAL.legalEntity} ("we", "us") for using ${LEGAL.businessName}, an online business management service. By creating an account you agree to them.`}
      sections={[
        {
          heading: 'Your account',
          body: (
            <>
              <p>You must give accurate details and keep your password safe. You are responsible for everything done in your workspace, including by team members you invite.</p>
              <p>You must be at least 18 years old, or have permission from your business, to use the service.</p>
            </>
          ),
        },
        {
          heading: 'Free trial, plans and payment',
          body: (
            <>
              <p>New workspaces get a 14-day free trial of the Pro plan. After the trial, the workspace becomes read-only until you buy a plan; your data is kept.</p>
              <p>Plans are paid in advance for a month or a year through SSLCommerz. Plans do not renew automatically. Paying again while a plan is active adds the new period after the current one ends.</p>
              <p>Each plan has limits (for example orders per month, team members and AI usage) shown on the pricing and Billing pages. We may change prices or limits for future periods with at least 30 days' notice; changes never affect a period you have already paid for.</p>
            </>
          ),
        },
        {
          heading: 'Refunds',
          body: <p>If you were charged in error or the service was unavailable for a significant part of a paid period, contact us within 14 days of the payment and we will review a full or partial refund. Refunds are made through the original payment method where possible.</p>,
        },
        {
          heading: 'Your data',
          body: (
            <>
              <p>You own the business data you put into the service. You give us permission to store and process it only to provide the service to you, as described in our Privacy Policy.</p>
              <p>You can delete records at any time. If you close your account, contact us to have your workspace deleted.</p>
            </>
          ),
        },
        {
          heading: 'AI features',
          body: <p>AI insights, assistant answers and marketing content are generated automatically from your data and may be inaccurate or incomplete. They are suggestions, not professional financial, legal or tax advice. Check important decisions yourself.</p>,
        },
        {
          heading: 'Acceptable use',
          body: <p>Don't use the service for anything illegal, to sell prohibited goods, to send spam, or to try to access other businesses' data or disrupt the service. We may suspend accounts that do.</p>,
        },
        {
          heading: 'Availability and liability',
          body: (
            <>
              <p>We work to keep the service running and your data safe, but we can't promise it will always be available or error-free.</p>
              <p>To the extent the law allows, our total liability to you for any claim is limited to the amount you paid us in the 12 months before the claim. We are not liable for indirect losses such as lost profits.</p>
            </>
          ),
        },
        {
          heading: 'Changes and governing law',
          body: <p>We may update these terms; if a change is significant we will tell you by email or in the app before it takes effect. These terms are governed by the laws of Bangladesh, and disputes will be handled by the courts of Dhaka.</p>,
        },
      ]}
    />
  );
}
