import React, { useState, useMemo } from 'react';

export default function DoseCalculator({ drug }) {
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState('kg');
  const [concentration, setConcentration] = useState('');

  // Feature 2: Instant calculation using useMemo for performance
  const calculations = useMemo(() => {
    if (!weight || isNaN(weight)) return null;

    const weightInKg = unit === 'lbs' ? parseFloat(weight) * 0.453592 : parseFloat(weight);
    const minDoseMg = weightInKg * parseFloat(drug.dose_min);
    const maxDoseMg = weightInKg * parseFloat(drug.dose_max);

    let minVol = null, maxVol = null;
    if (concentration && !isNaN(concentration)) {
      minVol = minDoseMg / parseFloat(concentration);
      maxVol = maxDoseMg / parseFloat(concentration);
    }

    return { minDoseMg, maxDoseMg, minVol, maxVol };
  }, [weight, unit, drug, concentration]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Dose Calculator</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
          <div className="flex rounded-md shadow-sm">
            <input 
              type="number" 
              value={weight} 
              onChange={e => setWeight(e.target.value)}
              className="flex-1 rounded-l-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 sm:text-sm p-2 border"
              placeholder="e.g. 4.5"
            />
            <select 
              value={unit} 
              onChange={e => setUnit(e.target.value)}
              className="rounded-r-md border-l-0 border-gray-300 bg-gray-50 text-gray-500 p-2 border"
            >
              <option value="kg">kg</option>
              <option value="lbs">lbs</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Concentration (mg/ml)</label>
          <input 
            type="number" 
            value={concentration} 
            onChange={e => setConcentration(e.target.value)}
            className="w-full rounded-md border-gray-300 shadow-sm p-2 border sm:text-sm"
            placeholder="Optional"
          />
        </div>
      </div>

      {calculations && (
        <div className="bg-blue-50 p-4 rounded-md">
          <p className="text-sm text-blue-800 font-medium">Required Dose:</p>
          <p className="text-2xl font-bold text-blue-900">
            {calculations.minDoseMg.toFixed(2)} - {calculations.maxDoseMg.toFixed(2)} {drug.dose_unit}
          </p>
          
          {calculations.minVol && (
            <div className="mt-2 pt-2 border-t border-blue-200">
              <p className="text-sm text-blue-800 font-medium">Volume to administer:</p>
              <p className="text-xl font-bold text-blue-900">
                {calculations.minVol.toFixed(2)} - {calculations.maxVol.toFixed(2)} ml
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}