import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

import {
  BookOpen,
  Clock3,
  GraduationCap
} from "lucide-react";

export default function DashboardCards() {

  const [stats, setStats] = useState({
    articles: 0,
    hours: 0,
    cpd: 0
  });

  const loadStats = async () => {

    const { data, error } = await supabase
      .from("cpd_reading")
      .select("*");

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

  }, []);

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
          className="
          bg-white
          rounded-[28px]
          p-4
          shadow-sm
          "
        >

          <div
            className="
            bg-[#E8F8F5]
            w-fit
            p-3
            rounded-2xl
            mb-4
            text-[#062F63]
            "
          >
            {card.icon}
          </div>

          <div
            className="
            text-2xl
            font-bold
            text-[#062F63]
            "
          >
            {card.value}
          </div>

          <div
            className="
            text-xs
            text-slate-500
            "
          >
            {card.title}
          </div>

        </div>

      ))}

    </div>

  );

}