import { supabase } from '../supabaseClient';

export const networkService = {
  // 1. Search for colleagues by name
  async searchColleagues(searchQuery, currentUserId) {
    if (!searchQuery || searchQuery.length < 3) return [];
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, title, qualifications')
      .ilike('full_name', `%${searchQuery}%`)
      .neq('id', currentUserId) // Don't search yourself
      .limit(10);

    if (error) throw error;
    return data;
  },

  // 2. Send a connection request (UPDATED to prevent 409 Conflict)
  async sendRequest(requesterId, receiverId) {
    const { error } = await supabase
      .from('connections')
      .upsert(
        { requester_id: requesterId, receiver_id: receiverId, status: 'pending' },
        { onConflict: 'requester_id, receiver_id' } // Note: requires a unique constraint in Supabase
      );
    
    if (error) throw error;
  },

  // 3. Get pending requests sent TO the user
  async getPendingRequests(userId) {
    const { data, error } = await supabase
      .from('connections')
      .select(`
        id, created_at,
        requester:profiles!connections_requester_id_fkey(id, full_name, title, qualifications)
      `)
      .eq('receiver_id', userId)
      .eq('status', 'pending');

    if (error) throw error;
    return data;
  },

  // 4. Get active connections (friends list)
  async getActiveConnections(userId) {
    // We have to check both where the user is the requester OR the receiver
    const { data, error } = await supabase
      .from('connections')
      .select(`
        id, requester_id, receiver_id,
        requester:profiles!connections_requester_id_fkey(id, full_name, title),
        receiver:profiles!connections_receiver_id_fkey(id, full_name, title)
      `)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

    if (error) throw error;

    // Flatten the data so it's easy to render (always show the *other* person)
    return data.map(conn => {
      const isRequester = conn.requester_id === userId;
      return {
        connection_id: conn.id,
        colleague: isRequester ? conn.receiver : conn.requester
      };
    });
  },

  // 5. Update Request Status (Accept/Reject)
  async respondToRequest(connectionId, newStatus) {
    const { error } = await supabase
      .from('connections')
      .update({ status: newStatus })
      .eq('id', connectionId);
    
    if (error) throw error;
  },

  // 6. Share an item with a colleague
  async shareRecord(senderId, receiverId, recordType, recordId, recordTitle) {
    const { error } = await supabase
      .from('shared_records')
      .insert({
        sender_id: senderId,
        receiver_id: receiverId,
        record_type: recordType,
        record_id: String(recordId),
        record_title: recordTitle
      });

    if (error) throw error;
  },

  // 7. Get user's inbox of shared items
  async getInbox(userId) {
    const { data, error } = await supabase
      .from('shared_records')
      .select(`
        *,
        sender:profiles!shared_records_sender_id_fkey(full_name, title)
      `)
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // 8. Remove an active connection (NEW)
  async removeConnection(connectionId) {
    const { error } = await supabase
      .from('connections')
      .delete()
      .eq('id', connectionId);

    if (error) throw error;
  }
};