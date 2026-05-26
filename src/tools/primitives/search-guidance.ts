export function withEmptySearchGuidance(kind: 'companies' | 'people') {
  return (result: unknown, input: Record<string, unknown>): unknown => {
    if (!isEmptySearchResult(result)) {
      return result;
    }

    return {
      ...(isRecord(result) ? result : { response: result }),
      guidance:
        kind === 'people'
          ? peopleSearchFallbackGuidance(input)
          : companySearchFallbackGuidance(input),
    };
  };
}

function peopleSearchFallbackGuidance(input: Record<string, unknown>): Record<string, unknown> {
  const query = searchQueryWithCompany(input, 'LinkedIn');
  return {
    resultInterpretation:
      'The indexed people search completed successfully but returned no records. This is not a failed MCP call.',
    recommendedNextTools: [
      {
        tool: 'search_web',
        reason:
          'Find public web pages or LinkedIn profile URLs for an exact named person and company.',
        suggestedInput: { query, maxResults: 5 },
      },
      {
        tool: 'submit_search',
        reason:
          'Search LinkedIn keyword results and posts when the people index is empty.',
        suggestedInput: {
          type: 'linkedin_keyword',
          query: searchQueryWithCompany(input),
          max_results: 5,
        },
      },
      {
        tool: 'research_person',
        reason:
          'Build a structured dossier after the user asks for broader research about a named person.',
        suggestedInput: {
          name: String(input.query ?? '').trim() || undefined,
          company: firstCompanyName(input) ?? firstCompanyDomain(input),
          includeWebSearch: true,
        },
      },
    ],
    instruction:
      'Try at least one recommended fallback before telling the user no public result was found.',
  };
}

function companySearchFallbackGuidance(input: Record<string, unknown>): Record<string, unknown> {
  const query = searchQueryWithCompany(input, 'company LinkedIn website');
  const companyDomain = firstCompanyDomain(input);
  return {
    resultInterpretation:
      'The indexed company search completed successfully but returned no records. This is not a failed MCP call.',
    recommendedNextTools: [
      {
        tool: 'search_web',
        reason:
          'Find public company pages, websites, or LinkedIn company URLs after an empty company index result.',
        suggestedInput: { query, maxResults: 5 },
      },
      {
        tool: 'find_linkedin_companies',
        reason:
          'Find LinkedIn company pages when you have a company website domain.',
        suggestedInput: companyDomain ? { domains: [companyDomain] } : undefined,
      },
    ],
    instruction:
      'Try a recommended fallback when the user is asking for public company discovery.',
  };
}

function isEmptySearchResult(result: unknown): boolean {
  const payload = payloadFromToolResult(result);
  if (!isRecord(payload) || !isTerminalSuccess(payload)) {
    return false;
  }
  const searchResult = isRecord(payload.result) ? payload.result : payload;
  const data = Array.isArray(searchResult.data) ? searchResult.data : null;
  const results = Array.isArray(searchResult.results) ? searchResult.results : null;
  const meta = isRecord(searchResult.meta) ? searchResult.meta : {};
  const resultCount = typeof meta.resultCount === 'number' ? meta.resultCount : undefined;

  return data?.length === 0 || results?.length === 0 || resultCount === 0;
}

function payloadFromToolResult(result: unknown): unknown {
  if (!isRecord(result)) {
    return result;
  }
  if ('final' in result) {
    return result.final;
  }
  if ('response' in result) {
    return result.response;
  }
  return result;
}

function isTerminalSuccess(payload: Record<string, unknown>): boolean {
  const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : '';
  return ['completed', 'complete', 'done', 'success', 'succeeded'].includes(status);
}

function searchQueryWithCompany(input: Record<string, unknown>, suffix?: string): string {
  const parts = [
    typeof input.query === 'string' ? input.query : null,
    firstCompanyName(input),
    firstCompanyDomain(input),
    suffix,
  ];
  return parts.filter((part): part is string => Boolean(part?.trim())).join(' ');
}

function firstCompanyName(input: Record<string, unknown>): string | undefined {
  const names = companyArray(input, 'names');
  return names[0];
}

function firstCompanyDomain(input: Record<string, unknown>): string | undefined {
  const domains = companyArray(input, 'domains');
  return domains[0];
}

function companyArray(input: Record<string, unknown>, key: string): string[] {
  const filters = isRecord(input.filters) ? input.filters : {};
  const company = isRecord(filters.company) ? filters.company : {};
  const value = company[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
