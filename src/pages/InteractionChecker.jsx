import React, { useState, useEffect } from 'react';
import { drugService } from '../services/drugService';
import { interactionService } from '../services/interactionService';

export default function InteractionChecker() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDrugs, setSelectedDrugs] = useState([]);
  const [interactions, setInteractions] = useState([]);

  // Feature 7: Debounced search
  useEffect(() => {
    const delay = setTimeout(async () => {
      if (searchTerm.length > 2) {
        const results = await drugService.searchDrugs(searchTerm);
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(delay);
  }, [searchTerm]);

  // Feature 1: Real-time interaction checking
  useEffect(() => {
    const fetchInteractions = async () => {
      if (selectedDrugs.length < 2) {
        setInteractions([]);
        return;
      }
      const data = await interactionService.checkInteractions(selectedDrugs);
      setInteractions(data);
    };
    fetchInteractions();
  }, [selectedDrugs]);

  const addDrug = (drug) => {
    if (!selectedDrugs.find(d => d.id === drug.id)) {
      setSelectedDrugs([...selectedDrugs, drug]);
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  const removeDrug = (id) => {
    setSelectedDrugs(selectedDrugs.filter(d => d.id !== id));
  };

  const getSeverityStyle = (severity) => {
    switch(severity?.toLowerCase()) {
      case 'high': return 'bg-red-50 border-red-200 text-red-800';
      case 'moderate': return 'bg-orange-50 border-orange-200 text-orange-800';
      case 'low': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Interaction Checker</h1>
      
      {/* Search Input */}
      <div className="relative mb-6">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search and add drugs..."
          className="w-full p-4 rounded-lg border shadow-sm focus:ring-blue-500 focus:border-blue-500"
        />
        {searchResults.length > 0 && (
          <ul className="absolute z-10 w-full bg-white border border-gray-200 mt-1 rounded-md shadow-lg max-h-60 overflow-auto">
            {searchResults.map(drug => (
              <li 
                key={drug.id} 
                onClick={() => addDrug(drug)}
                className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-0"
              >
                <span className="font-medium">{drug.name}</span>
                {drug.drug_aliases?.length > 0 && (
                  <span className="text-gray-500 text-sm ml-2">
                    ({drug.drug_aliases.map(a => a.alias).join(', ')})
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Selected Drugs Chips */}
      <div className="flex flex-wrap gap-2 mb-8">
        {selectedDrugs.map(drug => (
          <div key={drug.id} className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full flex items-center shadow-sm">
            {drug.name}
            <button onClick={() => removeDrug(drug.id)} className="ml-2 text-blue-500 hover:text-blue-900">
              &times;
            </button>
          </div>
        ))}
      </div>

      {/* Interactions Display */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-gray-800">Detected Interactions ({interactions.length})</h2>
        {interactions.map(interaction => (
          <div key={interaction.id} className={`p-4 rounded-lg border ${getSeverityStyle(interaction.severity)}`}>
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-lg">
                {interaction.drugs.name} + {interaction.interacting_drug}
              </h3>
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-white bg-opacity-50">
                {interaction.severity}
              </span>
            </div>
            <p className="mb-2 font-medium">{interaction.interaction}</p>
          </div>
        ))}
        {selectedDrugs.length > 1 && interactions.length === 0 && (
          <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg">
            No known interactions found between selected drugs.
          </div>
        )}
      </div>
    </div>
  );
}