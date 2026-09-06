import type { Metadata } from "next";

import { Em, LegalPage, LI, P, Section, Table, UL } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Subprocessors — Chainsilience AI",
  description: "Every third party that processes data on behalf of Chainsilience AI.",
};

const TOC = [
  { id: "what", title: "What a subprocessor is" },
  { id: "list", title: "The current list" },
  { id: "conditional", title: "Only when enabled" },
  { id: "sources", title: "News sources are not subprocessors" },
  { id: "choosing", title: "How we choose them" },
  { id: "changes", title: "Notice of changes" },
];

export default function SubprocessorsPage() {
  return (
    <LegalPage
      title="Subprocessors"
      toc={TOC}
      summary={
        <>
          <p>
            These are every third party that processes data on our behalf. There is nothing on
            this page you have to go digging for &mdash; if a company touches your data, it is
            listed here.
          </p>
          <p>
            The list is short by design. We have no analytics vendor, no advertising network, no
            customer-data platform and no email marketing tool, because we do not do those things.
          </p>
        </>
      }
    >
      <Section id="what" n={1} title="What a subprocessor is">
        <P>
          A subprocessor is a company we engage that may process personal data or your workspace
          content in the course of providing part of our service &mdash; hosting it, computing on
          it, or delivering a message about it. They act on our instructions, under contract, for
          the purpose named below and nothing else.
        </P>
      </Section>

      <Section id="list" n={2} title="The current list">
        <Table
          head={["Provider", "What it does for us", "What it receives", "Primary location"]}
          rows={[
            [
              <Em key="render">Render</Em>,
              "Runs the API and hosts the primary database",
              "All platform data at rest: accounts, company profiles, digital twins, risks, actions, drafts and feedback",
              "United States",
            ],
            [
              <Em key="vercel">Vercel</Em>,
              "Hosts and serves the web application",
              "HTTP request metadata, including IP address and user agent. No workspace content is stored here",
              "United States and global edge network",
            ],
            [
              <Em key="nvidia">NVIDIA</Em>,
              "Nemotron inference — risk scoring, reasoning, event extraction",
              "The disruption event and the relevant slice of your supply-chain model: supplier and site names, locations, countries and dependency attributes",
              "United States",
            ],
            [
              <Em key="openai">OpenAI</Em>,
              "Fallback inference when NVIDIA is unavailable or unconfigured",
              "The same context as above",
              "United States",
            ],
            [
              <Em key="stripe">Stripe</Em>,
              "Takes payment and manages subscriptions",
              "Your name, email, billing address and card details, which you give to Stripe directly. We receive only customer and subscription identifiers back",
              "United States and global",
            ],
            [
              <Em key="google">Google (Gmail SMTP)</Em>,
              "Delivers transactional email — sign-up codes and password-reset links",
              "The recipient's email address and the contents of that message",
              "United States and global",
            ],
            [
              <Em key="calendly">Calendly</Em>,
              "Scheduling widget on our public website only",
              "Whatever you enter when booking a call, plus the cookies Calendly sets in your browser. It is not loaded inside the platform",
              "United States",
            ],
          ]}
        />
      </Section>

      <Section id="conditional" n={3} title="Only when enabled">
        <P>
          Two entries above are conditional on configuration, and we would rather list them than
          have you discover them later:
        </P>
        <UL>
          <LI>
            <Em>Inference providers.</Em> Requests go to NVIDIA where it is configured, and
            otherwise to OpenAI. If neither is reachable, a deterministic scorer runs on our own
            servers and no supply-chain context leaves them at all.
          </LI>
          <LI>
            <Em>Neo4j Aura.</Em> Where a deployment enables the graph store, your supply-chain
            nodes and relationships are mirrored into a managed Neo4j database, one subgraph per
            company, for dependency-path queries. Where it is not enabled, the relational database
            on Render remains the only store.
          </LI>
        </UL>
      </Section>

      <Section id="sources" n={4} title="News sources are not subprocessors">
        <P>
          The platform reads roughly twenty public RSS feeds &mdash; general and business outlets
          alongside shipping and logistics trade press. We <Em>fetch</Em> from them; we send them
          nothing about you. They receive an ordinary HTTP request from our servers and no
          customer data whatsoever, so they are sources rather than subprocessors.
        </P>
      </Section>

      <Section id="choosing" n={5} title="How we choose them">
        <P>Before we engage a subprocessor we check that it:</P>
        <UL>
          <LI>is contractually bound to protect the data and to use it only for our instructions;</LI>
          <LI>
            offers an appropriate transfer mechanism for personal data leaving the UK, the EEA or
            another restricted region;
          </LI>
          <LI>
            does not claim a right to train models on, mine, or otherwise repurpose what we send
            it;
          </LI>
          <LI>is actually necessary &mdash; the shortest list we can operate on is the goal.</LI>
        </UL>
      </Section>

      <Section id="changes" n={6} title="Notice of changes">
        <P>
          We will update this page and its effective date whenever the list changes, and we will
          email account administrators at least 30 days before a new subprocessor begins
          processing personal data &mdash; so there is time to object.
        </P>
        <P>
          If you object on reasonable data-protection grounds, tell us at{" "}
          <a href={`mailto:${LEGAL.contact}`} className="text-accent hover:underline">
            {LEGAL.contact}
          </a>
          . We will try to offer an alternative; if we cannot, you may terminate the affected part
          of the service and we will refund any fees you have paid for a period you will not
          receive.
        </P>
      </Section>
    </LegalPage>
  );
}
