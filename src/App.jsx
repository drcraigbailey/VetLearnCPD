import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";

import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Analytics from "./pages/Analytics";
import FutureReading from "./pages/FutureReading";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gradient-to-b from-[#F9FCFB] to-[#EAF5F3] text-[#113247]">

        <div className="sticky top-0 z-40 border-b border-[#DCEDEA] bg-white/85 backdrop-blur-xl">

          <div className="max-w-md mx-auto px-5 py-3">

            <div className="flex items-center gap-3">

              <img
                src="/logo.png"
                alt="VetLearn CPD"
                className="w-12 h-12 object-contain"
              />

              <div>
                <h1 className="text-xl font-black tracking-normal text-[#113247]">
                  VetLearn
                </h1>

                <p className="text-sm text-[#0F8F83] font-semibold">
                  CPD Tracker
                </p>
              </div>

            </div>

          </div>

        </div>

        <div className="max-w-md mx-auto min-h-screen px-4 pt-5 pb-28">

          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/future" element={<FutureReading />} />
            <Route path="/history" element={<History />} />
            <Route path="/analytics" element={<Analytics />} />
          </Routes>

        </div>

        <Navbar />

      </div>
    </BrowserRouter>
  );
}

export default App;