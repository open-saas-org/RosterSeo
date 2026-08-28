// Real Google PageSpeed Insights (Lighthouse) Core Web Vitals for a single
// URL - used by Page Analyzer and Site Audit to score real pages, not
// synthetic/mock numbers. GOOGLE_PAGESPEED_API_KEY is optional (the API
// works unauthenticated at a much lower rate limit); pass it when set to
// avoid throttling on multi-page runs.

export interface PageSpeedMetrics {
  lcp: number;
  cls: number;
  inp: number;
}

export async function fetchPageSpeedMetrics(url: string): Promise<PageSpeedMetrics | null> {
  try {
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
    let endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=performance`;

    if (apiKey) {
      endpoint += `&key=${apiKey}`;
    }

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      // A real Lighthouse run can legitimately take 10-20s, but must never
      // hang indefinitely and block a caller that's sampling many URLs.
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      console.warn(`PageSpeed Insights API returned ${res.status} for ${url}`);
      return null;
    }

    const data = await res.json();

    const lighthouse = data.lighthouseResult?.audits;
    if (!lighthouse) {
      return null;
    }

    const lcp = lighthouse["largest-contentful-paint"]?.numericValue ?? 0;
    const cls = lighthouse["cumulative-layout-shift"]?.numericValue ?? 0;
    const inpCrux =
      data.loadingExperience?.metrics?.INTERACTION_TO_NEXT_PAINT_FIT?.percentile ??
      lighthouse["max-potential-fid"]?.numericValue ??
      0;

    return {
      lcp: Number((lcp / 1000).toFixed(2)),
      cls: Number(cls.toFixed(3)),
      inp: Number(inpCrux),
    };
  } catch (error) {
    console.error(`Error fetching PageSpeed for ${url}:`, error);
    return null;
  }
}
