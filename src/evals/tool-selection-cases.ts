export interface ToolSelectionCase {
  id: string;
  prompt: string;
  expectedTool: string;
  required: PathExpectation[];
  forbidden?: PathExpectation[];
}

export interface PathExpectation {
  path: string;
  equals?: unknown;
  includes?: string;
  includesAny?: string[];
  present?: boolean;
  absent?: boolean;
}

export const toolSelectionCases: ToolSelectionCase[] = [
  {
    id: 'target-account-global-mobility-timeout',
    prompt:
      'Find global mobility and immigration people at Walmart target accounts. Do not require exact titles. Return quickly if it is still running after about 1 second.',
    expectedTool: 'find_people_at_target_accounts',
    required: [
      { path: 'companyNames', includes: 'Walmart' },
      { path: 'titles', includesAny: ['global mobility', 'immigration'] },
      { path: 'titleMatch', equals: 'similar' },
      { path: 'timeoutSeconds', equals: 1 },
    ],
  },
  {
    id: 'people-search-company-linkedin-selector',
    prompt:
      'Use the primitive people search tool to search for relocation leaders at UPS using the company LinkedIn URL https://www.linkedin.com/company/ups. Use similar title matching and do not enrich contacts.',
    expectedTool: 'search_people',
    required: [
      {
        path: 'filters.company.linkedinUrls',
        includes: 'https://www.linkedin.com/company/ups',
      },
      { path: 'filters.titleMatch', equals: 'similar' },
      { path: 'includeContacts', equals: false },
    ],
    forbidden: [{ path: 'includeContactInfo', present: true }],
  },
  {
    id: 'resume-operation-followup',
    prompt:
      'The prior people search returned operation ID op_live_123. Check whether it is done instead of starting a new search.',
    expectedTool: 'get_operation',
    required: [{ path: 'id', equals: 'op_live_123' }],
    forbidden: [{ path: 'query', present: true }],
  },
  {
    id: 'single-contact-enrichment',
    prompt:
      'Enrich this LinkedIn profile for email only: https://www.linkedin.com/in/example-person',
    expectedTool: 'enrich_contact',
    required: [
      {
        path: 'identifier.linkedin_url',
        equals: 'https://www.linkedin.com/in/example-person',
      },
      { path: 'fields', includes: 'email' },
    ],
  },
  {
    id: 'web-search-routing',
    prompt:
      'Search the web for recent news about Visa global mobility policy. I only need web results, not people search.',
    expectedTool: 'search_web',
    required: [{ path: 'query', includesAny: ['Visa', 'global mobility'] }],
    forbidden: [{ path: 'filters.company.names', present: true }],
  },
  {
    id: 'target-account-domain-current-schema',
    prompt:
      'Find immigration managers at Visa target accounts using the company domain visa.com. Use the target-account workflow.',
    expectedTool: 'find_people_at_target_accounts',
    required: [
      { path: 'companyDomains', includes: 'visa.com' },
      { path: 'titles', includes: 'immigration' },
    ],
    forbidden: [{ path: 'filters', present: true }],
  },
];
