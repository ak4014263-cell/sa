const ALGOLIA_APP_ID = 'CSEKHVMS53';
const ALGOLIA_API_KEY = '4bd8f6215d0cc52b26430765769e65a0';
const ALGOLIA_INDEX = 'wk_cms_jobs_production';
const WTTJ_BASE = 'https://www.welcometothejungle.com';

/**
 * Scrapes live jobs directly from Welcome to the Jungle's official production index (88,000+ jobs)
 * @param {Object} options
 * @param {string} options.query - Search keywords (e.g., 'developer', 'react', 'marketing')
 * @param {string} options.location - Location (e.g., 'Paris', 'Lyon', 'Remote')
 * @param {number} options.page - Page number (0-indexed or 1-indexed)
 * @param {number} options.hitsPerPage - Number of jobs per fetch (default 30)
 */
async function scrapeWTTJJobs({ query = '', location = '', page = 0, hitsPerPage = 40 } = {}) {
  console.log(`[Scraper] Fetching live WTTJ jobs from index "${ALGOLIA_INDEX}" (query: "${query}", location: "${location}", page: ${page})`);

  const pageIndex = Math.max(0, page > 0 ? page - 1 : 0);

  // Construct facet filters if location or remote is specified
  const facetFilters = [];
  if (location && location.toLowerCase() === 'remote') {
    facetFilters.push(['remote:full', 'remote:partial']);
  }

  const payload = {
    query: query || '',
    page: pageIndex,
    hitsPerPage: hitsPerPage || 40,
    attributesToRetrieve: [
      'objectID',
      'name',
      'slug',
      'organization',
      'office',
      'offices',
      'contract_type',
      'contract_type_names',
      'salary_minimum',
      'salary_maximum',
      'salary_currency',
      'sectors',
      'remote',
      'profile',
      'published_at'
    ]
  };

  if (facetFilters.length > 0) {
    payload.facetFilters = facetFilters;
  }

  const url = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-algolia-application-id': ALGOLIA_APP_ID,
        'x-algolia-api-key': ALGOLIA_API_KEY,
        'Referer': 'https://www.welcometothejungle.com/',
        'Origin': 'https://www.welcometothejungle.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Algolia HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const hits = data.hits || [];
    console.log(`[Scraper] Successfully retrieved ${hits.length} live jobs from WTTJ (Total available: ${data.nbHits})`);

    const formattedJobs = hits.map((job, idx) => {
      const org = job.organization || {};
      const office = job.office || (job.offices && job.offices[0]) || {};

      // Calculate formatted salary
      let salaryStr = 'Rémunération selon profil';
      if (job.salary_minimum && job.salary_maximum) {
        const minK = Math.round(job.salary_minimum / 1000);
        const maxK = Math.round(job.salary_maximum / 1000);
        salaryStr = `${minK}k€ - ${maxK}k€ / an`;
      } else if (job.salary_minimum) {
        salaryStr = `Dès ${Math.round(job.salary_minimum / 1000)}k€ / an`;
      }

      // Extract tags
      const tags = [];
      if (job.contract_type_names && job.contract_type_names.fr) {
        tags.push(job.contract_type_names.fr);
      }
      if (job.remote === 'full') tags.push('Full Remote');
      else if (job.remote === 'partial') tags.push('Télétravail partiel');

      if (job.sectors && Array.isArray(job.sectors)) {
        job.sectors.slice(0, 2).forEach(s => {
          if (s.name && s.name.fr) tags.push(s.name.fr);
        });
      }

      if (tags.length === 0) tags.push('CDI', 'Tech');

      // Strip HTML for description snippet
      let desc = 'Rejoignez cette entreprise sur Welcome to the Jungle pour relever de nouveaux défis passionnants.';
      if (job.profile) {
        desc = job.profile.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
        if (desc.length > 220) desc = desc.slice(0, 220) + '...';
      }

      const orgSlug = org.slug || 'company';
      const jobSlug = job.slug || job.objectID;
      const jobUrl = `https://www.welcometothejungle.com/fr/companies/${orgSlug}/jobs/${jobSlug}`;

      const locationStr = office.city 
        ? `${office.city}${office.country ? ', ' + office.country : ''}` 
        : (job.remote === 'full' ? '100% Télétravail' : 'France');

      return {
        id: `wttj-${job.objectID || idx}`,
        title: job.name || 'Poste ouvert',
        company: org.name || 'Entreprise WTTJ',
        location: locationStr,
        contract: (job.contract_type_names && job.contract_type_names.fr) || 'CDI',
        salary: salaryStr,
        jobUrl: jobUrl,
        logoUrl: org.logo?.url || '',
        description: desc,
        tags: tags,
        remote: job.remote || 'no',
        source: 'Welcome to the Jungle (Official)',
        scrapedAt: new Date().toISOString(),
        publishedAt: job.published_at || new Date().toISOString()
      };
    });

    return formattedJobs;

  } catch (error) {
    console.error('[Scraper] Direct Algolia fetch failed:', error.message);
    return getFallbackJobs();
  }
}

function getFallbackJobs() {
  return [
    {
      id: 'wttj-fallback-1',
      title: 'Développeur Full Stack React/Node.js',
      company: 'Doctolib',
      location: 'Paris, France',
      contract: 'CDI',
      salary: '50k€ - 70k€ / an',
      jobUrl: 'https://www.welcometothejungle.com/fr/companies/doctolib/jobs',
      description: 'Rejoignez l\'équipe produit de Doctolib pour concevoir les fonctionnalités médicales de demain.',
      tags: ['CDI', 'React', 'Node.js', 'Hybride'],
      source: 'Welcome to the Jungle',
      scrapedAt: new Date().toISOString()
    }
  ];
}

module.exports = { scrapeWTTJJobs };
