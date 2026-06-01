import React, { useState, useEffect } from 'react';
import { notesService } from '../services/notesService';

export default function UserNotes({ userId, drugId }) {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('saved'); // 'saved', 'saving', 'typing'

  // Load existing note
  useEffect(() => {
    notesService.getUserNote(userId, drugId).then(data => {
      if (data) setNote(data.note);
    });
  }, [userId, drugId]);

  // Feature 4: Autosave with 2-second debounce
  useEffect(() => {
    if (status !== 'typing') return;

    const timer = setTimeout(async () => {
      setStatus('saving');
      try {
        await notesService.upsertUserNote(userId, drugId, note);
        setStatus('saved');
      } catch (err) {
        console.error("Failed to save note", err);
        setStatus('error');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [note, status, userId, drugId]);

  return (
    <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-100">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-yellow-800">My Notes (Private)</h3>
        <span className={`text-xs ${status === 'saved' ? 'text-green-600' : 'text-gray-500'}`}>
          {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setStatus('typing');
        }}
        className="w-full h-32 p-3 rounded-md border border-yellow-200 focus:ring-yellow-500 focus:border-yellow-500 resize-none bg-white"
        placeholder="Add personal clinical observations or clinic-specific protocols here..."
      />
    </div>
  );
}