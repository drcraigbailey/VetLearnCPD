import React from "react";

export default function HeartbeatLoader({ size = 64, className = "" }) {
  // Calculates height based on the 64:48 viewBox ratio
  const height = (size * 48) / 64; 

  return (
    <div className={`flex justify-center items-center ${className}`}>
      <svg 
        width={size} 
        height={height} 
        viewBox="0 0 64 48" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>
          {`
            .hb-line {
              fill: none;
              stroke-width: 3;
              stroke-linecap: round;
              stroke-linejoin: round;
            }
            .hb-back {
              stroke: #0F8F83; /* App's deep green */
              opacity: 0.2;
            }
            .hb-front {
              stroke: #71CFC2; /* App's bright teal */
              stroke-dasharray: 48, 144;
              stroke-dashoffset: 192;
              animation: dash_682 1.4s linear infinite;
            }
            @keyframes dash_682 {
              72.5% { opacity: 0; }
              to { stroke-dashoffset: 0; }
            }
          `}
        </style>
        <polyline 
          className="hb-line hb-back" 
          points="0.157 23.954, 14 23.954, 21.843 48, 43 0, 50 24, 64 24" 
        />
        <polyline 
          className="hb-line hb-front" 
          points="0.157 23.954, 14 23.954, 21.843 48, 43 0, 50 24, 64 24" 
        />
      </svg>
    </div>
  );
}