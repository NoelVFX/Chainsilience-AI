import type { Metadata } from "next";

import { Code, Em, LegalPage, LI, P, Section, UL } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — Chainsilience AI",
  description: "What you may not do with the Chainsilience AI platform.",
};

const TOC = [
  { id: "scope", title: "What this covers" },
  { id: "lawful", title: "Lawful use" },
  { id: "isolation", title: "Other customers' data" },
  { id: "integrity", title: "Platform integrity" },
  { id: "content", title: "What you upload" },
  { id: "extraction", title: "Extraction and resale" },
  { id: "automation", title: "Automated access" },
  { id: "research", title: "Security research" },
  { id: "enforcement", title: "Enforcement" },
];

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      toc={TOC}
      summary={
        <>
          <p>
            Short version: use the platform for your own supply chain, lawfully, and do not go
            looking for anyone else&rsquo;s data.
          </p>
          <p>
            Do not try to extract the models or resell the outputs as a competing risk feed. Do
            not upload personal data you have no right to hold, and keep what you do upload to
            what the job needs.
          </p>
          <p>
            Genuine security research is welcome, within the rules in section 8. Report what you
            find rather than exploiting it.
          </p>
        </>
      }
    >
      <Section id="scope" n={1} title="What this covers">
        <P>
          This policy applies to everyone who uses Chainsilience AI, and it forms part of the{" "}
          <a href="/terms" className="text-accent hover:underline">
            Terms of Service
          </a>
          . It exists because a multi-tenant risk platform holds commercially sensitive
          information about a lot of companies at once, and that only works if everybody stays in
          their own workspace.
        </P>
      </Section>

      <Section id="lawful" n={2} title="Lawful use">
        <P>Do not use the platform to:</P>
        <UL>
          <LI>break any applicable law, or help anyone else to;</LI>
          <LI>
            evade sanctions, export controls or customs obligations &mdash; the platform reports
            on trade restrictions, and using it to route around one is a misuse of it;
          </LI>
          <LI>infringe anyone&rsquo;s intellectual property, privacy or confidentiality;</LI>
          <LI>
            harass, defame or endanger anyone, including through communications you draft in the
            product and then send.
          </LI>
        </UL>
      </Section>

      <Section id="isolation" n={3} title="Other customers&rsquo; data">
        <P>Do not attempt, by any means, to reach data belonging to another workspace. Specifically:</P>
        <UL>
          <LI>
            do not manipulate identifiers, tokens or requests to see records outside your own{" "}
            <Code>company_id</Code>;
          </LI>
          <LI>
            do not attempt to make the AI features reveal another customer&rsquo;s data through
            prompt injection or any similar technique;
          </LI>
          <LI>
            do not use credentials that are not yours, share your own, or keep using an account
            after your access should have ended.
          </LI>
        </UL>
        <P>
          If you come across another customer&rsquo;s data through a fault of ours, stop, do not
          copy or keep it, and tell us at once at{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
            {LEGAL.contact}
          </a>
          . We will treat that as a responsible report, not a breach by you.
        </P>
      </Section>

      <Section id="integrity" n={4} title="Platform integrity">
        <P>Do not:</P>
        <UL>
          <LI>
            place load on the platform that degrades it for others, whether deliberately or
            through a runaway script;
          </LI>
          <LI>
            probe, scan or stress-test our infrastructure outside the terms of section 8, or
            circumvent authentication, rate limits or quotas;
          </LI>
          <LI>upload malware, or use the platform to distribute it;</LI>
          <LI>
            interfere with our providers &mdash; that includes using our AI features to send
            prohibited content to the inference providers we depend on.
          </LI>
        </UL>
      </Section>

      <Section id="content" n={5} title="What you upload">
        <UL>
          <LI>
            Upload only content you have the right to provide, including anything that identifies
            your staff, your suppliers&rsquo; staff or your customers.
          </LI>
          <LI>
            <Em>Keep personal data to a minimum.</Em> The platform models suppliers, sites and
            routes; it needs an action owner&rsquo;s name, not their home address.
          </LI>
          <LI>
            Do not upload special-category data &mdash; health, biometric, racial or ethnic
            origin, political opinions, religious beliefs, trade union membership, sexual
            orientation &mdash; or government identifiers, payment card numbers or credentials.
            The platform is not built to hold them, and we do not want them.
          </LI>
          <LI>
            Do not put real or confidential data into the shared public demonstration account.
          </LI>
        </UL>
      </Section>

      <Section id="extraction" n={6} title="Extraction and resale">
        <P>Do not:</P>
        <UL>
          <LI>
            reverse engineer, decompile or attempt to derive the source of the platform, except so
            far as the law expressly permits despite a contractual restriction;
          </LI>
          <LI>
            systematically extract scores, reasoning, prompts or event data in order to train a
            model, reconstruct our scoring methodology, or build a competing product;
          </LI>
          <LI>
            resell, sublicense or redistribute the platform&rsquo;s outputs as a standalone risk
            feed or data product.
          </LI>
        </UL>
        <P>
          Using outputs inside your own business &mdash; in your reports, your board packs, your
          conversations with suppliers &mdash; is exactly what the platform is for, and is not
          caught by this section.
        </P>
      </Section>

      <Section id="automation" n={7} title="Automated access">
        <P>
          You may access your own workspace programmatically through our API at a reasonable rate.
          Do not scrape the web interface, run concurrent sessions designed to multiply your
          quota, or share one account across a fleet of automated clients. If you need higher
          volume, ask us rather than working around a limit.
        </P>
      </Section>

      <Section id="research" n={8} title="Security research">
        <P>
          We would rather hear about a vulnerability than read about it. You may test against your
          own workspace, provided you:
        </P>
        <UL>
          <LI>
            do not access, modify or retain data belonging to anyone else, and stop as soon as you
            reach another tenant&rsquo;s data;
          </LI>
          <LI>
            do not run denial-of-service tests, spam our users, or use social engineering against
            our staff or providers;
          </LI>
          <LI>
            give us a reasonable chance to fix the issue before disclosing it publicly;
          </LI>
          <LI>
            report what you find to{" "}
            <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
              {LEGAL.contact}
            </a>{" "}
            with enough detail to reproduce it.
          </LI>
        </UL>
        <P>
          Research conducted within these limits is authorised, and we will not pursue you for it.
          We do not currently run a paid bounty programme.
        </P>
      </Section>

      <Section id="enforcement" n={9} title="Enforcement">
        <P>
          If you breach this policy we may limit, suspend or terminate access &mdash; and where
          the breach is serious or ongoing, we may do so without prior warning. Where the
          circumstances allow, we will tell you what the problem is and give you a chance to fix
          it first.
        </P>
        <P>
          Report suspected misuse to{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
            {LEGAL.contact}
          </a>
          .
        </P>
      </Section>
    </LegalPage>
  );
}
