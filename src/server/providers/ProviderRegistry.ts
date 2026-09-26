/**
 * XAVIRA — PROVIDER REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages all configured providers and implements the provider waterfall:
 *
 *   Growjo → configured licensed provider → public legitimate source → unknown
 *
 * Each provider is OPTIONAL. If Growjo is unavailable, the system continues
 * with whatever providers are configured. Contacts are never guessed.
 */
import type { CanonicalCompany, CanonicalPerson, CanonicalContact, Provenance, SourceEntry } from './Model';
import { CompanyDataProvider, type ProviderLookupResult } from './ProviderInterface';

export interface ProviderConfig {
  /** Unique key for this provider instance. */
  key: string;
  /** The provider instance. */
  provider: CompanyDataProvider;
  /** Priority in the waterfall (lower = earlier). */
  priority: number;
}

export class ProviderRegistry {
  private readonly providers: ProviderConfig[] = [];

  add(config: ProviderConfig): void {
    this.providers.push(config);
    this.providers.sort((a, b) => a.priority - b.priority);
  }

  /** All registered providers (ordered by waterfall priority). */
  getProviders(): CompanyDataProvider[] {
    return this.providers.map(p => p.provider);
  }

  /** Whether any contact-verification provider is available. */
  get hasContactProvider(): boolean {
    return this.providers.some(p => p.provider.capabilities.verifyContact && p.provider.enabled);
  }

  /**
   * Waterfall lookup: try each provider in priority order.
   * Returns all companies found (multiple providers may contribute
   * for the same company — provenance is preserved).
   */
  async lookupCompany(nameOrDomain: string): Promise<ProviderLookupResult> {
    const companies: CanonicalCompany[] = [];
    const contributing: string[] = [];
    const tried: string[] = [];

    for (const pc of this.providers) {
      if (!pc.provider.enabled) continue;
      tried.push(pc.key);
      try {
        if (pc.provider.capabilities.resolveCompany) {
          const found = await pc.provider.resolveCompany(nameOrDomain);
          if (found) {
            companies.push(found);
            contributing.push(pc.key);
          }
        }
      } catch (e) {
        // Provider failure does not kill the pipeline — just skip.
        tried.push(`${pc.key}:error`);
      }
    }

    // Also try CSVProvider-style parseCsv if the provider supports it
    return {
      companies,
      contributing_providers: [...new Set(contributing)],
      tried_providers: tried,
      has_contact_provider: this.hasContactProvider,
    };
  }

  /**
   * Search all providers for companies matching a query.
   * Aggregates results from every provider that supports search.
   */
  async searchCompany(query: string): Promise<CanonicalCompany[]> {
    const results: CanonicalCompany[] = [];
    for (const pc of this.providers) {
      if (!pc.provider.enabled || !pc.provider.capabilities.searchCompanies) continue;
      try {
        const hits = await pc.provider.searchCompanies(query);
        results.push(...hits);
      } catch {
        // skip failed provider
      }
    }
    return results;
  }

  /**
   * Contact waterfall for a person:
   *   1. licensed provider data (already attached by import)
   *   2. findContacts via configured licensed provider (Hunter, Apollo)
   *   3. publicly listed professional contact
   *   4. CONTACT_UNKNOWN
   */
  async resolveContacts(person: CanonicalPerson): Promise<CanonicalContact[]> {
    const contacts: CanonicalContact[] = [];

    // 1. Any contacts already attached to the person (from CSV import etc.)
    // These carry their own provenance.

    // 2. Query each contact-capable provider
    for (const pc of this.providers) {
      if (!pc.provider.enabled || !pc.provider.capabilities.findContacts) continue;
      try {
        const found = await pc.provider.findContacts(person);
        contacts.push(...found);
      } catch {
        // skip
      }
    }

    // 3. Public professional sources — handled by LivePublicObservationProvider
    // in the main pipeline (PeopleExtractor finds LinkedIn profiles etc.)

    // 4. If nothing found, the caller can mark as CONTACT_UNKNOWN
    return contacts;
  }

  /** Collect all sources from all providers for the SourceRegistry. */
  getAllSources(): SourceEntry[] {
    const sources: SourceEntry[] = [];
    for (const pc of this.providers) {
      const providerSources = pc.provider.getSources?.() || [];
      sources.push(...providerSources);
    }
    return sources;
  }
}
