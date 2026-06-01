import { supabase } from '../supabaseClient';

export const interactionService = {
  // Feature 1: Check interactions between selected drugs
  async checkInteractions(selectedDrugs) {
    if (selectedDrugs.length < 2) return [];

    const ids = selectedDrugs.map(d => d.id);
    const names = selectedDrugs.map(d => d.name);

    // Query interactions where drug A is in our list, and the interacting drug B is also in our list
    const { data, error } = await supabase
      .from('drug_interactions')
      .select('*, drugs(name)') 
      .in('drug_id', ids)
      .in('interacting_drug', names);

    if (error) throw error;
    return data;
  }
};