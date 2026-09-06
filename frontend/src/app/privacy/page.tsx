import type { Metadata } from "next";

import { Code, Em, H3, LegalPage, LI, P, Section, Table, UL } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — Chainsilience AI",
  description: "What Chainsilience AI collects, why, and who else sees it.",
};

const TOC = [
  { id: "scope", title: "Scope and our role" },
  { id: "collect", title: "What we collect" },
  { id: "sources", title: "Where it comes from" },
  { id: "why", title: "Why we process it" },
  { id: "ai", title: "What we send to AI providers" },
  { id: "sharing", title: "Who else sees it" },
  { id: "cookies", title: "Cookies and tracking" },
  { id: "transfers", title: "International transfers" },
  { id: "retention", title: "How long we keep it" },
  { id: "security", title: "How we protect it" },
  { id: "rights", title: "Your rights" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      toc={TOC}
      summary={
        <>
          <p>
            We collect what an account needs (your name, work email, company profile) and what
            you put into the product (your supply chain, actions, drafts, feedback). Nothing
            more.
          </p>
          <p>
            <Em>We set no cookies and run no analytics or advertising trackers.</Em> Your login
            is a token held in your own browser&rsquo;s storage.
          </p>
          <p>
            Supply-chain context is sent to an AI provider to score risk. Card details go to
            Stripe and never reach us. Every other recipient is listed on the{" "}
            <a href="/subprocessors" className="text-accent hover:underline">
              Subprocessors
            </a>{" "}
            page.
          </p>
          <p>
            We do not sell your data, and we do not use it to train models. You can ask for a
            copy or a deletion by email, and we will act within 30 days.
          </p>
        </>
      }
    >
      <Section id="scope" n={1} title="Scope and our role">
        <P>
          This policy covers the Chainsilience AI website and platform, operated by{" "}
          {LEGAL.entityLong}. It explains what we do with personal data.
        </P>
        <P>
          We act in two capacities. For your <Em>account and billing data</Em> we are the
          controller: we decide why and how it is processed. For the <Em>content you put into
          your workspace</Em> &mdash; which may name your employees, your suppliers&rsquo; staff
          or your customers &mdash; you are the controller and we are your processor, handling it
          on your instructions to run the service for you.
        </P>
        <P>
          We grant the rights in section 11 to everyone who uses the platform, wherever they are.
          We would rather run one standard than a different one per region.
        </P>
      </Section>

      <Section id="collect" n={2} title="What we collect">
        <H3>Account and identity</H3>
        <Table
          head={["Data", "Detail"]}
          rows={[
            ["Email address", "Your login identifier; also where verification and reset mail is sent."],
            ["Full name", "Shown in the interface and on actions you own."],
            [
              "Password",
              <>
                Stored only as a <Code>pbkdf2_sha256</Code> hash. We never hold the password
                itself and cannot recover it.
              </>,
            ],
            ["Role", "Administrator, manager, analyst or viewer — determines your permissions."],
            [
              "Verification codes",
              <>
                A one-time sign-up code, stored only as an HMAC-SHA256 hash, with a ten-minute
                expiry and an attempt counter.
              </>,
            ],
            [
              "Password-reset tokens",
              "Stored only as a hash, single-use, valid for 30 minutes, deleted once used.",
            ],
          ]}
        />

        <H3>Company profile</H3>
        <P>
          Company name, industry, countries of operation, primary products and risk tolerance.
          This is what the risk engine matches world events against, so it is business
          information rather than personal data &mdash; but it is commercially sensitive, and we
          treat it that way.
        </P>

        <H3>Content you create in the platform</H3>
        <UL>
          <LI>
            <Em>Your digital twin</Em> &mdash; suppliers, factories, warehouses, ports, routes,
            products and components, with their names, locations, countries and attributes such
            as lead time, capacity and dependency share.
          </LI>
          <LI>
            <Em>Risks and actions</Em> &mdash; generated risks, and the mitigation actions you
            track, including the owner&rsquo;s name, department and deadline you assign.
          </LI>
          <LI>
            <Em>Email drafts</Em> &mdash; subject and body of communications drafted for
            suppliers, customers, executives or procurement, saved so you can edit them.
          </LI>
          <LI>
            <Em>Feedback</Em> &mdash; the 1&ndash;5 rating and free-text comment you leave on a
            recommendation.
          </LI>
        </UL>
        <P>
          If you put personal data into these fields, we process it as your processor. Please put
          in only what you actually need.
        </P>

        <H3>Billing</H3>
        <P>
          If you subscribe, we store the Stripe customer and subscription identifiers, your plan
          status and whether it is set to cancel at period end.{" "}
          <Em>We never receive your card number.</Em> Stripe collects and holds payment details
          directly.
        </P>

        <H3>Technical</H3>
        <UL>
          <LI>
            An authentication token (a JWT, valid for 24 hours) held in your browser&rsquo;s{" "}
            <Code>localStorage</Code> &mdash; not a cookie, and never sent anywhere but our API.
          </LI>
          <LI>
            Server-side operational logs from our hosting providers, which include IP addresses
            and request metadata, kept for security and debugging.
          </LI>
        </UL>
        <P>
          The enquiry form on our website composes a message in your own email client &mdash; it
          does not submit anything to our servers. What you send arrives as ordinary email.
        </P>
      </Section>

      <Section id="sources" n={3} title="Where it comes from">
        <P>
          Almost everything comes from you or from people in your workspace. Two exceptions:
          Stripe returns billing status to us after a payment, and the platform continuously
          ingests <Em>publicly published news</Em> from around twenty RSS feeds &mdash; general
          and business outlets alongside shipping and logistics trade press &mdash; refreshed
          roughly every thirty seconds.
        </P>
        <P>
          Those articles are public reporting, not personal data we have gone looking for. We
          store the headline, link, summary and publication time, and the structured disruption
          event extracted from them.
        </P>
      </Section>

      <Section id="why" n={4} title="Why we process it, and on what basis">
        <Table
          head={["Purpose", "Basis"]}
          rows={[
            [
              "Creating your account, authenticating you, and running the platform",
              "Performance of our contract with you",
            ],
            [
              "Verifying your email address and processing password resets",
              "Performance of our contract; our legitimate interest in account security",
            ],
            [
              "Scoring risks, generating recommendations and drafting communications",
              "Performance of our contract",
            ],
            [
              "Taking payment and managing subscriptions",
              "Performance of our contract; legal obligation for tax and accounting records",
            ],
            [
              "Protecting the platform against abuse, and diagnosing faults",
              "Our legitimate interest in a secure, working service",
            ],
            [
              "Replying to you when you contact us",
              "Our legitimate interest in responding to enquiries",
            ],
          ]}
        />
        <P>
          We do not use your data for advertising or profiling, and we do not make automated
          decisions that produce legal or similarly significant effects about individuals. The
          platform scores <Em>supply-chain risk</Em>, not people.
        </P>
      </Section>

      <Section id="ai" n={5} title="What we send to AI providers">
        <P>
          To score a risk and explain it, we send an AI provider the context it needs: the
          disruption event drawn from public news, and the relevant part of your supply-chain
          model &mdash; typically supplier and site names, locations, countries and the
          dependency attributes you have recorded.
        </P>
        <P>
          Requests go to NVIDIA (Nemotron) where configured, and otherwise to OpenAI. If both are
          unreachable, a deterministic scorer runs locally and <Em>nothing leaves our servers</Em>
          . Each call has a hard timeout so a slow provider degrades to that fallback rather than
          holding your data in flight.
        </P>
        <P>We do not send these providers:</P>
        <UL>
          <LI>your password hash, verification codes or reset tokens;</LI>
          <LI>your payment details, which we do not hold in the first place;</LI>
          <LI>your users&rsquo; login identifiers or authentication tokens.</LI>
        </UL>
        <P>
          We send this data through the providers&rsquo; business APIs, under terms that do not
          permit training on it. We do not consent to such training, and if a provider changed
          that position we would move to one that had not.
        </P>
      </Section>

      <Section id="sharing" n={6} title="Who else sees it">
        <P>
          Only the subprocessors we depend on to run the platform. Each one, what it receives and
          why, is listed on the{" "}
          <a href="/subprocessors" className="text-accent hover:underline">
            Subprocessors
          </a>{" "}
          page, which we keep current.
        </P>
        <P>Beyond that, we may disclose data:</P>
        <UL>
          <LI>where the law, a court or a regulator validly requires it;</LI>
          <LI>
            to protect our rights or the safety of our users, where we reasonably believe it is
            necessary;
          </LI>
          <LI>
            to an acquirer, if the business is sold or merges &mdash; in which case this policy
            continues to apply until you are told otherwise, and you will be told before anything
            changes.
          </LI>
        </UL>
        <P>
          <Em>We do not sell personal data, and we never have.</Em> We do not share it with
          advertisers or data brokers.
        </P>
      </Section>

      <Section id="cookies" n={7} title="Cookies and tracking">
        <P>
          <Em>We set no cookies.</Em> There is no analytics, no advertising pixel, no
          fingerprinting and no cross-site tracking on this website or in the platform. That is
          why you are not being asked to dismiss a consent banner.
        </P>
        <P>
          Your session is kept as a token in your browser&rsquo;s <Code>localStorage</Code>,
          which stays on your device and is sent only to our own API. Clearing your browser
          storage logs you out.
        </P>
        <P>
          One third-party script does load on our public site: Calendly&rsquo;s scheduling widget,
          on the pages offering a walkthrough booking. Calendly may set its own cookies when you
          interact with it, under its own privacy policy. It is not loaded inside the platform.
        </P>
      </Section>

      <Section id="transfers" n={8} title="International transfers">
        <P>
          Our infrastructure and our providers are largely United States-based, so your data will
          be transferred to and processed in the United States and potentially other countries
          whose data-protection law differs from your own.
        </P>
        <P>
          Where we transfer personal data out of the UK, the EEA or another region with transfer
          restrictions, we rely on the appropriate safeguards our providers offer &mdash;
          typically Standard Contractual Clauses in their data processing agreements. You can ask
          us which mechanism applies to a particular provider.
        </P>
      </Section>

      <Section id="retention" n={9} title="How long we keep it">
        <Table
          head={["What", "How long"]}
          rows={[
            ["Account and workspace data", "While your account is open"],
            [
              "After you ask us to delete",
              "Removed from live systems within 30 days; residual copies age out of backups within a further 90 days",
            ],
            ["Verification codes", "Ten minutes, then expired and cleared"],
            ["Password-reset tokens", "30 minutes, or immediately once used"],
            [
              "Billing records",
              "As long as tax and accounting law requires, typically seven years",
            ],
            ["Operational logs", "Short-lived, on our hosting providers' retention schedules"],
            ["Public news items and extracted events", "Retained as reference data; not personal to you"],
          ]}
        />
        <P>
          We may keep an anonymised or aggregated record that cannot be traced back to you or your
          company &mdash; for example counts of how often a feature is used.
        </P>
      </Section>

      <Section id="security" n={10} title="How we protect it">
        <UL>
          <LI>
            Passwords are hashed with <Code>pbkdf2_sha256</Code>. Sign-up codes and reset tokens
            are stored only as keyed HMAC-SHA256 hashes, so the values themselves exist nowhere in
            our database.
          </LI>
          <LI>
            Every database read is scoped to the requesting workspace&rsquo;s{" "}
            <Code>company_id</Code>, and that scoping lives in the data-access layer rather than
            being re-applied by each endpoint &mdash; so it cannot be forgotten in a new one.
          </LI>
          <LI>Traffic to the site and API is encrypted in transit with TLS.</LI>
          <LI>
            Sessions expire after 24 hours, and sign-up codes are bounded by a short expiry and an
            attempt limit.
          </LI>
        </UL>
        <P>
          No system is perfectly secure, and we will not pretend otherwise. If a breach affects
          your personal data and is likely to present a risk to you, we will notify you and the
          relevant regulator without undue delay, and tell you what happened and what we did about
          it.
        </P>
        <P>
          If you find a vulnerability, please report it to{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
            {LEGAL.contact}
          </a>
          . See the{" "}
          <a href="/acceptable-use" className="text-accent hover:underline">
            Acceptable Use Policy
          </a>{" "}
          for how to test safely.
        </P>
      </Section>

      <Section id="rights" n={11} title="Your rights, and how to use them">
        <P>Whoever and wherever you are, you can ask us to:</P>
        <UL>
          <LI>tell you what personal data we hold about you, and give you a copy;</LI>
          <LI>correct anything inaccurate;</LI>
          <LI>delete your data, or your whole workspace;</LI>
          <LI>export your workspace in a portable format;</LI>
          <LI>restrict or object to a particular processing activity;</LI>
          <LI>withdraw consent, where we relied on it.</LI>
        </UL>
        <P>
          Email{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
            {LEGAL.contact}
          </a>{" "}
          from the address on the account. <Em>There is no self-service delete button yet</Em>{" "}
          &mdash; these requests are handled by a person, and we will complete them within 30 days
          and confirm when it is done. We may need to verify who you are before acting, and we do
          not charge for this.
        </P>
        <P>
          If the personal data is content inside a customer&rsquo;s workspace, that customer is the
          controller: we will pass your request to them and support them in answering it.
        </P>
        <P>
          If you think we have handled your data badly, please tell us first &mdash; but you are
          entitled to complain to your local data-protection authority, and nothing here removes
          that right.
        </P>
      </Section>

      <Section id="children" n={12} title="Children">
        <P>
          The platform is a business tool, not intended for anyone under 18, and we do not
          knowingly collect data from children. If you believe a child has given us personal data,
          write to us and we will delete it.
        </P>
      </Section>

      <Section id="changes" n={13} title="Changes to this policy">
        <P>
          When this policy changes materially &mdash; a new category of data, a new purpose, a new
          subprocessor handling personal data &mdash; we will update the effective date at the top
          and email account administrators at least 30 days before it takes effect, so you have
          time to object or leave.
        </P>
      </Section>
    </LegalPage>
  );
}
