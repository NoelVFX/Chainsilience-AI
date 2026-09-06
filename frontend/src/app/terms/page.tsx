import type { Metadata } from "next";

import { Code, Em, H3, LegalPage, LI, P, Section, UL } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service — Chainsilience AI",
  description: "The agreement between you and Chainsilience AI.",
};

const TOC = [
  { id: "parties", title: "Who this is between" },
  { id: "service", title: "What the platform is" },
  { id: "accounts", title: "Accounts and workspaces" },
  { id: "billing", title: "Plans, billing, cancellation" },
  { id: "your-data", title: "Your data" },
  { id: "ai", title: "AI outputs and their limits" },
  { id: "use", title: "Acceptable use" },
  { id: "availability", title: "Availability and changes" },
  { id: "ip", title: "Our intellectual property" },
  { id: "confidentiality", title: "Confidentiality" },
  { id: "termination", title: "Suspension and termination" },
  { id: "disclaimer", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnity" },
  { id: "changes", title: "Changes to these terms" },
  { id: "law", title: "Governing law" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      toc={TOC}
      summary={
        <>
          <p>
            Chainsilience AI scores supply-chain risk. It is decision support, not professional
            advice, and its scores are estimates that can be wrong &mdash; check anything
            consequential before acting on it.
          </p>
          <p>
            Your supply-chain data stays yours. We use it to run the service for you, and we do
            not sell it or use it to train anyone&rsquo;s models.
          </p>
          <p>
            The platform is free to use after onboarding. Growth is an optional{" "}
            {LEGAL.growthPrice}/month upgrade you can cancel at any time; cancelling runs to the
            end of the period you have paid for.
          </p>
          <p>This is early-stage software with no uptime guarantee, and our liability is capped.</p>
        </>
      }
    >
      <Section id="parties" n={1} title="Who this is between">
        <P>
          These terms are an agreement between {LEGAL.entityLong} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;) and the organisation on whose behalf you use the platform
          (&ldquo;you&rdquo;). If you are opening an account for a company, you confirm you are
          authorised to accept these terms for it, and &ldquo;you&rdquo; means that company.
        </P>
        <P>
          By creating an account, or by using the platform, you accept these terms, the{" "}
          <a href="/acceptable-use" className="text-accent hover:underline">
            Acceptable Use Policy
          </a>{" "}
          and the{" "}
          <a href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </a>
          . If you do not accept them, do not use the platform.
        </P>
        <P>
          The platform is for business use. It is not offered to consumers, and you must be at
          least 18 years old to open an account.
        </P>
      </Section>

      <Section id="service" n={2} title="What the platform is">
        <P>
          Chainsilience AI ingests public news sources, extracts disruption events from them,
          matches those events against a model of your supply chain, and scores the resulting
          risk. It proposes mitigation actions, drafts communications, and lets you track those
          actions to completion.
        </P>
        <P>
          <Em>It is an analytical tool, not professional advice.</Em> Nothing it produces is
          legal, financial, insurance, safety or regulatory advice, and nothing in it should be
          treated as a substitute for your own judgement or for a qualified adviser. You remain
          solely responsible for every decision you take, and for every action you take or do not
          take, on the strength of what the platform shows you.
        </P>
      </Section>

      <Section id="accounts" n={3} title="Accounts and workspaces">
        <UL>
          <LI>
            Sign-up requires a verified email address. We send a one-time code that expires after
            ten minutes and allows five attempts.
          </LI>
          <LI>
            Each account belongs to exactly one company workspace. Users hold a role
            (administrator, manager, analyst or viewer) that governs what they can do.
          </LI>
          <LI>
            You are responsible for your credentials and for what the people you invite do with
            their access. Tell us promptly at{" "}
            <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
              {LEGAL.contact}
            </a>{" "}
            if you believe an account has been compromised.
          </LI>
          <LI>
            You must give accurate registration and company information. The quality of what the
            platform produces depends directly on the accuracy of the supply chain you describe
            to it.
          </LI>
          <LI>
            The public demonstration account is shared, seeded with fictional data, and reset
            without notice. Do not put real information into it.
          </LI>
        </UL>
      </Section>

      <Section id="billing" n={4} title="Plans, billing and cancellation">
        <H3>What costs money</H3>
        <P>
          Core access to the platform is currently free once you have completed onboarding.{" "}
          <Em>Growth</Em> is an optional upgrade at {LEGAL.growthPrice} per month.{" "}
          <Em>Enterprise</Em> is priced by separate written agreement, which prevails over these
          terms where the two conflict.
        </P>

        <H3>How payment works</H3>
        <P>
          Payments are processed by Stripe. We never see or store your card details &mdash; we
          hold only the customer and subscription identifiers Stripe returns to us. Your use of
          Stripe is governed by Stripe&rsquo;s own terms.
        </P>
        <P>
          Growth renews monthly until cancelled. Fees are exclusive of taxes, which are added
          where applicable. Prices are quoted in US dollars.
        </P>

        <H3>Cancelling</H3>
        <P>
          You may cancel at any time from the billing screen. Cancellation takes effect at the end
          of the period you have already paid for; you keep Growth features until then, and we do
          not refund part-months. If a payment fails and is not resolved, we may downgrade the
          workspace to the free tier.
        </P>
        <P>
          We will give at least 30 days&rsquo; notice by email before increasing the price of a
          plan you are on. If you do not accept the new price, cancel before it takes effect.
        </P>
      </Section>

      <Section id="your-data" n={5} title="Your data">
        <P>
          Everything you put into the platform &mdash; your supply-chain graph, actions, drafts,
          feedback and company profile &mdash; is <Em>your content</Em>, and it stays yours. We
          claim no ownership of it.
        </P>
        <P>
          You grant us a limited licence to host, copy, transmit and process your content, and to
          pass the parts described in the{" "}
          <a href="/privacy" className="text-accent hover:underline">
            Privacy Policy
          </a>{" "}
          to the subprocessors listed on the{" "}
          <a href="/subprocessors" className="text-accent hover:underline">
            Subprocessors
          </a>{" "}
          page, strictly for the purpose of operating the platform for you. That licence exists so
          the software can run; it is not a licence to do anything else with your data.
        </P>
        <P>
          We do not sell your content, and we do not use it to train AI models &mdash; ours or
          anyone else&rsquo;s.
        </P>
        <P>
          Every query the platform runs is scoped to the workspace that made it. You warrant that
          you have the right to provide the content you upload, including any personal data it
          contains about your staff or your suppliers&rsquo; staff.
        </P>
        <P>
          You can request an export or deletion of your workspace at any time by writing to{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
            {LEGAL.contact}
          </a>
          . See the Privacy Policy for how we handle those requests and how long they take.
        </P>
      </Section>

      <Section id="ai" n={6} title="AI outputs and their limits">
        <P>
          Risk scores, severity ratings, reasoning text, predicted impacts, mitigation scenarios
          and drafted emails are produced in part by large language models and in part by
          deterministic rules. They are <Em>estimates</Em>. They can be incomplete, out of date,
          or simply wrong, and confident-sounding language is not evidence that a particular
          output is correct.
        </P>
        <P>
          The platform is deliberately built to degrade rather than fail: when the AI providers
          are unavailable, a deterministic scorer produces the score instead. That protects
          availability, not accuracy &mdash; a fallback score is a coarser answer than a model
          score, and it is still an estimate.
        </P>
        <P>
          The platform reads public news sources. We do not control those sources, we do not
          verify their reporting, and their being surfaced in the product is neither our
          endorsement of them nor any indication that a report is accurate.
        </P>
        <P>
          Before acting on any output &mdash; particularly one that would move money, change a
          supplier relationship, or be communicated outside your organisation &mdash; verify it
          against your own records and judgement. Drafted communications are drafts: you are the
          sender, and you are responsible for what you send.
        </P>
      </Section>

      <Section id="use" n={7} title="Acceptable use">
        <P>
          Your use of the platform is subject to the{" "}
          <a href="/acceptable-use" className="text-accent hover:underline">
            Acceptable Use Policy
          </a>
          , which forms part of these terms. In outline: do not break the law with it, do not
          attempt to reach another customer&rsquo;s data, do not try to extract or replicate the
          models, and do not resell its outputs as a competing service.
        </P>
      </Section>

      <Section id="availability" n={8} title="Availability and changes to the service">
        <P>
          The platform is early-stage software. We offer <Em>no uptime commitment</Em> and no
          service level agreement unless one is set out in a signed Enterprise agreement. We may
          change, add or remove features, and we may take the service down for maintenance.
        </P>
        <P>
          If we discontinue the platform, or materially reduce what a paid plan includes, we will
          give you at least 30 days&rsquo; notice by email and a reasonable opportunity to export
          your data.
        </P>
        <P>
          Some capabilities depend on third parties &mdash; AI inference providers, payment
          processing, email delivery, news feeds. When those are unavailable, parts of the
          platform will be degraded or unavailable too.
        </P>
      </Section>

      <Section id="ip" n={9} title="Our intellectual property">
        <P>
          The platform itself &mdash; the software, the interface, the scoring methodology, the
          prompts, the name and the marks &mdash; is ours and stays ours. These terms grant you a
          limited, non-exclusive, non-transferable right to use it for your own business purposes
          for as long as your account is in good standing, and nothing more.
        </P>
        <P>
          If you send us feedback or suggestions, we may use them without obligation or
          compensation to you. That covers ideas about the product; it does not extend to your
          content.
        </P>
      </Section>

      <Section id="confidentiality" n={10} title="Confidentiality">
        <P>
          Each of us may learn confidential information about the other. We will not disclose
          yours except to the subprocessors listed on the Subprocessors page, to our own staff and
          advisers who need it, or where the law requires it &mdash; and we will use at least
          reasonable care to protect it. The same applies to you in respect of anything non-public
          you learn about the platform.
        </P>
      </Section>

      <Section id="termination" n={11} title="Suspension and termination">
        <P>
          You may stop using the platform and close your account at any time. We may suspend or
          terminate an account that breaches these terms or the Acceptable Use Policy, that
          creates a security or legal risk, or whose fees are unpaid. Where circumstances allow,
          we will warn you first and give you a chance to put it right.
        </P>
        <P>
          On termination your right to use the platform ends. Ask us for an export before you
          close the account: after closure we delete workspace data on the timetable in the
          Privacy Policy, and once it is deleted we cannot recover it. Sections <Code>05</Code>,{" "}
          <Code>09</Code>, <Code>10</Code>, <Code>12</Code>, <Code>13</Code> and <Code>14</Code>{" "}
          survive termination.
        </P>
      </Section>

      <Section id="disclaimer" n={12} title="Disclaimers">
        <P>
          To the fullest extent the law allows, the platform is provided <Em>as is</Em> and{" "}
          <Em>as available</Em>, without warranties of any kind, whether express or implied,
          including any implied warranty of merchantability, fitness for a particular purpose, or
          non-infringement.
        </P>
        <P>
          In particular, we do not warrant that risk scores, event extractions, impact estimates
          or recommendations are accurate, complete or current; that the platform will identify
          any given disruption; or that it will operate without interruption or error. Some
          jurisdictions do not allow the exclusion of certain warranties, in which case the
          exclusions above apply only so far as that law permits.
        </P>
      </Section>

      <Section id="liability" n={13} title="Limitation of liability">
        <P>
          To the fullest extent the law allows, neither party is liable for indirect, incidental,
          special or consequential loss, nor for lost profits, lost revenue, lost business, lost
          goodwill, or loss or corruption of data, however caused.
        </P>
        <P>
          Our total aggregate liability arising out of or relating to the platform is limited to
          the greater of (a) the fees you paid us in the twelve months before the event giving
          rise to the claim, and (b) US$100.
        </P>
        <P>
          Nothing in these terms excludes liability that cannot lawfully be excluded, including
          liability for fraud or for death or personal injury caused by negligence.
        </P>
      </Section>

      <Section id="indemnity" n={14} title="Indemnity">
        <P>
          You will defend and indemnify us against claims, damages and reasonable costs arising
          from your content, from your use of the platform in breach of these terms or the
          Acceptable Use Policy, or from your breach of any law or third-party right &mdash;
          including any claim that content you uploaded infringes someone&rsquo;s rights or was
          provided without the necessary consent.
        </P>
      </Section>

      <Section id="changes" n={15} title="Changes to these terms">
        <P>
          We may update these terms. For material changes we will give at least 30 days&rsquo;
          notice by email to account administrators, or by prominent notice in the platform, and
          we will update the effective date at the top of this page. Continuing to use the
          platform after a change takes effect means you accept it; if you do not, close your
          account before then.
        </P>
      </Section>

      <Section id="law" n={16} title="Governing law and disputes">
        <P>
          These terms are governed by the laws of {LEGAL.jurisdiction}, without regard to
          conflict-of-laws rules, and the parties submit to the exclusive jurisdiction of{" "}
          {LEGAL.courts}.
        </P>
        <P>
          Before starting proceedings, please write to us at{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
            {LEGAL.contact}
          </a>{" "}
          so we can try to resolve the matter directly. If any provision of these terms is held
          unenforceable, the rest remains in force.
        </P>
      </Section>
    </LegalPage>
  );
}
