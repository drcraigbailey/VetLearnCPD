import { supabase } from '../supabaseClient';

export const drugService = {
  async searchDrugs(searchTerm, userId = null) {
    if (!searchTerm) return [];

    const term = String(searchTerm).trim();
    if (term.length < 2) return [];

    const ownOrShared = userId ? `user_id.is.null,user_id.eq.${userId}` : "user_id.is.null";
    const searchDrugRows = (includeOwnershipFilter = true) => {
      let query = supabase
        .from('drugs')
        .select('*')
        .eq('active', true)
        .ilike('name', `%${term}%`)
        .order('name')
        .limit(20);

      if (includeOwnershipFilter) query = query.or(ownOrShared);
      return query;
    };

    const searchAliasRows = async () => {
      const fullAliasRes = await supabase
        .from('drug_aliases')
        .select('drug_id, drug_name, alias, name, type, is_trade_name')
        .or(`alias.ilike.%${term}%,name.ilike.%${term}%,drug_name.ilike.%${term}%`)
        .limit(20);

      if (!fullAliasRes.error) return fullAliasRes;

      const simpleAliasRes = await supabase
        .from('drug_aliases')
        .select('drug_id, drug_name, alias, type, is_trade_name')
        .or(`alias.ilike.%${term}%,drug_name.ilike.%${term}%`)
        .limit(20);

      return simpleAliasRes.error ? { data: [] } : simpleAliasRes;
    };

    let [drugRes, aliasRes] = await Promise.all([
      searchDrugRows(Boolean(userId)),
      searchAliasRows()
    ]);

    if (drugRes.error && userId) {
      drugRes = await searchDrugRows(false);
    }

    if (drugRes.error) throw drugRes.error;

    const aliasDrugIds = [...new Set((aliasRes.data || []).map((item) => item.drug_id).filter(Boolean))];
    let aliasDrugs = [];

    if (aliasDrugIds.length > 0) {
      let aliasDrugRes = await supabase
        .from('drugs')
        .select('*')
        .or(ownOrShared)
        .eq('active', true)
        .in('id', aliasDrugIds);

      if (aliasDrugRes.error && userId) {
        aliasDrugRes = await supabase
          .from('drugs')
          .select('*')
          .eq('active', true)
          .in('id', aliasDrugIds);
      }

      if (aliasDrugRes.error) throw aliasDrugRes.error;
      aliasDrugs = aliasDrugRes.data || [];
    }

    const byId = new Map();
    [...(drugRes.data || []), ...aliasDrugs].forEach((drug) => {
      byId.set(String(drug.id), {
        ...drug,
        drug_aliases: (aliasRes.data || [])
          .filter((alias) => String(alias.drug_id) === String(drug.id) || String(alias.drug_name || '').toLowerCase() === String(drug.name || '').toLowerCase())
          .map((alias) => ({ alias: alias.alias || alias.name, type: alias.type, is_trade_name: alias.is_trade_name }))
          .filter((alias) => alias.alias)
      });
    });

    return Array.from(byId.values()).slice(0, 20);
  },

  async searchCalculatorDrugs(searchTerm, userId = null) {
    const drugs = await this.searchDrugs(searchTerm, userId);
    return drugs;
  },

  async getDrugClinicalDetails(drug) {
    if (!drug?.id && !drug?.name) return null;

    const names = [drug.name].filter(Boolean);
    const ids = [drug.id].filter(Boolean);

    const [aliases, warnings, contraindications, interactions, monitoring, speciesWarnings, drugInfo] = await Promise.all([
      ids.length ? supabase.from('drug_aliases').select('*').in('drug_id', ids) : { data: [] },
      names.length ? supabase.from('drug_warnings').select('*').in('drug_name', names) : { data: [] },
      names.length ? supabase.from('contraindications').select('*').in('drug_name', names) : { data: [] },
      names.length ? supabase.from('drug_interactions').select('*').in('drug_name', names) : { data: [] },
      names.length ? supabase.from('monitoring_recommendations').select('*').in('drug_name', names) : { data: [] },
      names.length ? supabase.from('species_warnings').select('*').in('drug_name', names) : { data: [] },
      names.length ? supabase.from('drug_information').select('*').in('drug_name', names) : { data: [] }
    ]);

    return {
      aliases: aliases.data || [],
      warnings: warnings.data || [],
      contraindications: contraindications.data || [],
      interactions: interactions.data || [],
      monitoring: monitoring.data || [],
      speciesWarnings: speciesWarnings.data || [],
      drugInformation: drugInfo.data || []
    };
  },

  // Legacy comprehensive profile lookup used by older pages.
  async searchRelatedDrugs(searchTerm) {
    if (!searchTerm) return [];

    const { data, error } = await supabase
      .from('drugs')
      .select(`
        id, name, species, category,
        drug_aliases (alias)
      `)
      .or(`name.ilike.%${searchTerm}%,drug_aliases.alias.ilike.%${searchTerm}%`)
      .limit(20);

    if (error) throw error;
    return data;
  },

  // Feature 6: Fetch comprehensive drug profile (lazy loaded via React Query/SWR in practice)
  async getDrugProfile(id) {
    const { data, error } = await supabase
      .from('drugs')
      .select(`
        *,
        drug_aliases(alias),
        drug_warnings(warning_type, warning_text, severity, species),
        drug_contraindications(contraindication),
        drug_interactions(interacting_drug, interaction, severity),
        drug_species_warnings(species, warning)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }
};
