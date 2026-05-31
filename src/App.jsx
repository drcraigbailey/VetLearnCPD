import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";

import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Analytics from "./pages/Analytics";

function App() {
  return (
    <BrowserRouter>
      <div className="bg-slate-100 min-h-screen">

        {/* Header Banner */}
        <div className="sticky top-0 z-50 bg-white shadow-sm">

          <div className="max-w-md mx-auto px-4 py-3">

            <div className="flex items-center justify-center gap-3">

              <img
                src="/logo.png"
                alt="VetLearn CPD"
                className="w-14 h-14 object-contain"
              />

              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  VetLearn
                </h1>

                <p className="text-sm text-teal-500 font-medium">
                  CPD Tracker
                </p>
              </div>

            </div>

          </div>

        </div>

        {/* Mobile App Container */}
        <div className="max-w-md mx-auto min-h-screen pb-24">

          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>

        </div>

        {/* Bottom nav stays fixed */}
        <Navbar />

      </div>
    </BrowserRouter>
  );
}

export default App;