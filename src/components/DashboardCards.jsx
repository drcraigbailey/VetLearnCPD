import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

import {
  BookOpen,
  Clock3,
  GraduationCap
} from "lucide-react";

export default function DashboardCards({user,darkMode=false}) {

  const [stats, setStats] = useState({
    articles: 0,
    hours: 0,
    cpd: 0
  });

  const loadStats = async () => {

    if(!user) return;

    const { data, error } = await supabase
      .from("cpd_reading")
      .select("*")
      .eq("user_id",user.id);

    if (error) return;

    const articles = data.length;

    const totalMinutes = data.reduce(
      (sum, item) => sum + (item.duration_minutes || 0),
      0
    );

    const hours = (totalMinutes / 60).toFixed(1);

    const annualTarget = 35;

    const cpd = Math.min(
      Math.round((hours / annualTarget) * 100),
      100
    );

    setStats({
      articles,
      hours,
      cpd
    });
  };

  useEffect(() => {

    loadStats();

    const refresh = () => loadStats();

    window.addEventListener(
      "cpdUpdated",
      refresh
    );

    return () => {
      window.removeEventListener(
        "cpdUpdated",
        refresh
      );
    };

  }, [user]);

  const cards = [

    {
      title: "Articles",
      value: stats.articles,
      icon: <BookOpen size={18}/>
    },

    {
      title: "Hours",
      value: stats.hours,
      icon: <Clock3 size={18}/>
    },

    {
      title: "CPD",
      value: `${stats.cpd}%`,
      icon: <GraduationCap size={18}/>
    }

  ];

  return (

    <div className="grid grid-cols-3 gap-3 mb-6">

      {cards.map((card,index)=>(

        <div
          key={index}
          className={`
          border
          rounded-lg
          p-4
          ${darkMode?"bg-white/10 border-white/10 shadow-[0_10px_24px_rgba(0,0,0,0.18)]":"bg-white/90 border-[#DCEDEA] shadow-[0_10px_24px_rgba(11,55,96,0.06)]"}
          `}
        >

          <div
            className={`
            w-fit
            p-3
            rounded-lg
            mb-4
            ${darkMode?"bg-white/10 text-[#71CFC2]":"bg-[#E8F8F5] text-[#0B3760]"}
            `}
          >
            {card.icon}
          </div>

          <div
            className={`
            text-2xl
            font-black
            ${darkMode?"text-white":"text-[#0B3760]"}
            `}
          >
            {card.value}
          </div>

          <div
            className={`
            text-xs
            font-medium
            ${darkMode?"text-slate-300":"text-slate-500"}
            `}
          >
            {card.title}
          </div>

        </div>

      ))}

    </div>

  );

}