/**
 * Every fact the legal pages assert about who we are and where we are.
 *
 * These are the only things in the policies that a lawyer or an incorporation
 * decision can change, so they live in one file rather than being spelled out
 * four times. Change them here and all four documents follow.
 *
 * TODO before these go live: confirm ENTITY and JURISDICTION with counsel, and
 * move CONTACT off a consumer mailbox onto the product domain.
 */
export const LEGAL = {
  /** Registered legal entity. Until incorporation, the trading name stands in. */
  entity: "Chainsilience AI",
  /** Set once incorporated, e.g. "Chainsilience AI Limited (CR no. ...)". */
  entityLong: "Chainsilience AI",
  jurisdiction: "Hong Kong SAR",
  courts: "the courts of Hong Kong SAR",
  contact: "chainsilienceai@gmail.com",
  /** Bump whenever a document changes materially, and tell users. */
  effective: "5 September 2026",
  /** Monthly list price of the optional paid tier, as shown on the site. */
  growthPrice: "US$499",
} as const;

export type LegalDoc = {
  slug: string;
  title: string;
  blurb: string;
};

/** The four documents, in the order they appear in the footer and the switcher. */
export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "/terms",
    title: "Terms of Service",
    blurb: "The agreement between you and us.",
  },
  {
    slug: "/privacy",
    title: "Privacy Policy",
    blurb: "What we collect, why, and who else sees it.",
  },
  {
    slug: "/acceptable-use",
    title: "Acceptable Use",
    blurb: "What you may not do with the platform.",
  },
  {
    slug: "/subprocessors",
    title: "Subprocessors",
    blurb: "Every third party that touches your data.",
  },
];
