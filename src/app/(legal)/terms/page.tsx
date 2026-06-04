import type { Metadata } from "next";

import { CONTACT_EMAIL, H1, H2, Updated } from "../ui";

export const metadata: Metadata = {
  title: "Terms of Service · Overlapp",
  description:
    "The terms that govern your use of Overlapp, the persistent shared group calendar.",
};

const LAST_UPDATED = "June 4, 2026";

export default function TermsPage() {
  return (
    <>
      <H1>Terms of Service</H1>
      <Updated date={LAST_UPDATED} />

      <p>
        These Terms govern your use of Overlapp (&ldquo;the service&rdquo;). By
        creating an account or using the service, you agree to these Terms. If
        you do not agree, please don&rsquo;t use Overlapp.
      </p>

      <H2>Your account</H2>
      <p>
        You need an account to use Overlapp, and you must provide accurate
        information and keep your login credentials secure. You are responsible
        for activity under your account. You must be at least 13 years old to
        use the service.
      </p>

      <H2>Acceptable use</H2>
      <p>You agree not to:</p>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          use the service to violate any law or the rights of others, including
          inviting people to groups without a legitimate basis;
        </li>
        <li>
          attempt to access data you&rsquo;re not authorized to see — in
          particular, the private event details of other members;
        </li>
        <li>
          disrupt, overload, reverse-engineer, or probe the service or its
          infrastructure for vulnerabilities without permission; or
        </li>
        <li>misuse invitations or notifications to spam others.</li>
      </ul>

      <H2>Your content</H2>
      <p>
        You keep ownership of the information you put into Overlapp (your
        availability, group details, and proposals). You grant us the limited
        permission needed to store and display that information to provide the
        service — for example, showing your aggregated free/busy availability to
        the groups you join, as described in our{" "}
        <a href="/privacy" className="text-indigo-600 hover:underline">
          Privacy Policy
        </a>
        .
      </p>

      <H2>Groups and ownership</H2>
      <p>
        Group owners and admins can manage members, invitations, and group
        settings. If you delete your account, you can transfer ownership of any
        group you own to another member; otherwise that group will be dissolved
        and its members will lose access to it.
      </p>

      <H2>Third-party services</H2>
      <p>
        Overlapp integrates with third-party services such as Google Calendar.
        Your use of those services is governed by their own terms and privacy
        policies. Connecting a calendar is optional and you can disconnect it at
        any time.
      </p>

      <H2>Availability and changes</H2>
      <p>
        We aim to keep Overlapp running smoothly, but the service is provided
        &ldquo;as is&rdquo; without warranties of any kind. We may add, change,
        or discontinue features, and we may suspend or terminate accounts that
        violate these Terms.
      </p>

      <H2>Limitation of liability</H2>
      <p>
        To the maximum extent permitted by law, Overlapp and its operators are
        not liable for indirect, incidental, or consequential damages, or for
        any missed events, scheduling conflicts, or decisions made based on
        availability shown in the service. Overlapp is a coordination tool, not
        a guarantee that any meeting will occur.
      </p>

      <H2>Termination</H2>
      <p>
        You may stop using Overlapp and delete your account at any time from your
        Profile page. These Terms continue to apply to prior use to the extent
        relevant.
      </p>

      <H2>Changes to these Terms</H2>
      <p>
        We may update these Terms from time to time. We will revise the
        &ldquo;last updated&rdquo; date above and, for material changes, provide
        a more prominent notice. Continued use after a change means you accept
        the updated Terms.
      </p>

      <H2>Contact</H2>
      <p>
        Questions about these Terms? Email us at{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-indigo-600 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </>
  );
}
