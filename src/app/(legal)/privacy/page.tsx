import type { Metadata } from "next";

import { CONTACT_EMAIL, H1, H2, Updated } from "../ui";

export const metadata: Metadata = {
  title: "Privacy Policy · Overlapp",
  description:
    "How Overlapp collects, uses, shares, and protects your data — including the free/busy-only sharing model and Google user data handling.",
};

const LAST_UPDATED = "June 4, 2026";

export default function PrivacyPage() {
  return (
    <>
      <H1>Privacy Policy</H1>
      <Updated date={LAST_UPDATED} />

      <p>
        Overlapp is a persistent shared group calendar. It exists so a group can
        see when everyone is free without sharing what each person is actually
        doing. Privacy is the product, not a footnote: co-members only ever see
        <strong> free/busy</strong> availability — never your event titles,
        descriptions, locations, or attendees. This policy explains what we
        collect, how we use it, what we share, and the choices you have.
      </p>

      <H2>What we collect</H2>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          <strong>Account information</strong> — your email address, first and
          last name, an optional display name, and your time zone.
        </li>
        <li>
          <strong>Group activity</strong> — the groups you create or join, your
          role in them, and invitations you send or accept.
        </li>
        <li>
          <strong>Availability you enter</strong> — manual availability blocks
          (including any recurrence), and your responses to scheduling proposals.
        </li>
        <li>
          <strong>Connected-calendar data</strong> — if you connect a calendar
          (e.g. Google Calendar), we read your events&rsquo; start/end times,
          their free/busy (&ldquo;busy&rdquo;) status, category, and title so you
          can apply per-event and per-category overrides. Titles are stored for
          your own use and are <strong>never shown to other members</strong>.
        </li>
        <li>
          <strong>Technical data</strong> — basic information your browser sends
          (such as your IP address) and, if you opt in, a push-notification
          subscription for your device.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> sell your data, and we do not use your data
        or your Google user data to serve advertising.
      </p>

      <H2>How sharing works (free/busy only)</H2>
      <p>
        When you join a group, other members can see <strong>when</strong> you
        are free or busy in aggregate — for example, that a particular 30-minute
        slot has 4 of 5 members free. They cannot see <strong>why</strong> you
        are busy: event titles, descriptions, calendar names, and categories
        never leave your account. This boundary is enforced on our servers, not
        just in the interface.
      </p>

      <H2>Google user data</H2>
      <p>
        If you connect Google Calendar, Overlapp&rsquo;s use of information
        received from Google APIs adheres to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="text-honey-700 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including its <strong>Limited Use</strong> requirements. Specifically:
      </p>
      <ul className="ml-5 list-disc space-y-1">
        <li>
          We request read access to your calendar (
          <code>calendar.readonly</code>) to import your busy times, and — only
          if you turn on calendar write-back — permission to add a finalized
          event to your calendar (<code>calendar.events</code>).
        </li>
        <li>
          We use Google Calendar data solely to provide and improve the
          scheduling features you see in Overlapp. We do not transfer it to
          others except as needed to provide the service, comply with the law,
          or as part of a merger with appropriate protections; and we do not use
          it for advertising.
        </li>
        <li>
          You can <strong>disconnect</strong> a calendar at any time on the
          Calendars page; doing so deletes the stored access tokens and the
          imported events. You can also revoke Overlapp&rsquo;s access from your{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-honey-700 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google account permissions
          </a>
          .
        </li>
      </ul>

      <H2>How we store and protect your data</H2>
      <p>
        Your data is stored with our infrastructure providers (Supabase for the
        database and authentication; Resend for transactional email). Access is
        governed by per-row database security policies so that members only see
        the de-identified availability described above. Calendar access tokens
        are kept in a server-only store that is never exposed to the browser or
        to other users.
      </p>

      <H2>Data retention &amp; account deletion</H2>
      <p>
        You can delete your account at any time from your Profile page. Deleting
        your account permanently removes your profile, availability, calendar
        connections and imported events, push subscriptions, and group
        memberships. For any group you own, you can transfer ownership to another
        member to keep the group alive, or it will be dissolved. We retain
        information only as long as needed to provide the service or to meet
        legal obligations.
      </p>

      <H2>Your choices</H2>
      <ul className="ml-5 list-disc space-y-1">
        <li>Connect or disconnect calendars whenever you like.</li>
        <li>Turn push notifications on or off per device.</li>
        <li>Edit your profile, or delete your account entirely.</li>
      </ul>

      <H2>Children</H2>
      <p>
        Overlapp is not directed to children under 13, and we do not knowingly
        collect personal information from them.
      </p>

      <H2>Changes to this policy</H2>
      <p>
        We may update this policy as the product evolves. We will revise the
        &ldquo;last updated&rdquo; date above and, for material changes, provide
        a more prominent notice.
      </p>

      <H2>Contact</H2>
      <p>
        Questions about privacy? Email us at{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="text-honey-700 hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </>
  );
}
