import { supabase } from '../supabaseClient';

export const drugService = {
  // Feature 3 & 7: Search drugs by name or alias (with performance)
  async searchDrugs(searchTerm) {
    if (!searchTerm) return [];
    
    // Using an OR query to match either the primary name or an alias
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