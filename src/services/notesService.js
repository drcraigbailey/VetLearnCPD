import { supabase } from '../supabaseClient';

export const notesService = {
  async getUserNote(userId, drugId) {
    const { data, error } = await supabase
      .from('user_drug_notes')
      .select('*')
      .eq('user_id', userId)
      .eq('drug_id', drugId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async upsertUserNote(userId, drugId, noteText) {
    const { data, error } = await supabase
      .from('user_drug_notes')
      .upsert({ 
        user_id: userId, 
        drug_id: drugId, 
        note: noteText,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id, drug_id' }) // Ensure unique constraint exists in DB for this to work perfectly
      .select();

    if (error) throw error;
    return data;
  }
};