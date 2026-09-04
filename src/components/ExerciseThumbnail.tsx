import React from 'react';
import { MuscleGroup } from '../types';

interface ExerciseThumbnailProps {
  exerciseId: string;
  muscle: MuscleGroup;
  nameEn?: string;
  size?: number;
  image?: string;
  onClick?: () => void;
}

export const ExerciseThumbnail: React.FC<ExerciseThumbnailProps> = ({
  exerciseId,
  muscle,
  nameEn = '',
  size = 54,
  image,
  onClick,
}) => {
  const clickProps = onClick
    ? {
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onClick();
        },
        style: { cursor: 'pointer' as const },
      }
    : {};

  if (image) {
    return (
      <div
        {...clickProps}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--border-subtle)',
          flexShrink: 0,
          ...(clickProps.style || {}),
        }}
      >
        <img
          src={image}
          alt={nameEn}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }

  // Define custom visual styling for specific exercises or fall back to muscle group illustration
  const isDeadlift = exerciseId.includes('deadlift');
  const isHipThrust = exerciseId.includes('hip-thrust');
  const isLegCurl = exerciseId.includes('leg-curl');
  const isAdduction = exerciseId.includes('adduction');
  const isAbduction = exerciseId.includes('abduction');
  const isCrunch = exerciseId.includes('crunch') || muscle === 'core';
  const isSquat = exerciseId.includes('squat') || exerciseId.includes('bulgarian');
  const isBench = exerciseId.includes('bench') || exerciseId.includes('chest');
  const isRow = exerciseId.includes('row') || exerciseId.includes('pulldown') || muscle === 'back';
  const isShoulder = muscle === 'shoulders';
  const isArm = muscle === 'biceps' || muscle === 'triceps';

  const glowColor = 'var(--color-blue)'; // Neon Mint Accent
  const bodyColor = '#8E95A5';
  const machineColor = '#4B5563';

  return (
    <div
      {...clickProps}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: 12,
        backgroundColor: 'var(--bg-surface-2)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        ...(clickProps.style || {}),
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size - 8}
        height={size - 8}
        style={{ overflow: 'visible' }}
      >
        <defs>
          <linearGradient id={`glow-${exerciseId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-blue)" />
            <stop offset="100%" stopColor="#00C980" />
          </linearGradient>
          <filter id={`drop-shadow-${exerciseId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="var(--color-blue)" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* ================= DEADLIFT ================= */}
        {isDeadlift && (
          <g>
            {/* Barbell */}
            <line x1="15" y1="72" x2="85" y2="72" stroke="#6B7280" strokeWidth="4" strokeLinecap="round" />
            <rect x="20" y="58" width="6" height="28" rx="2" fill="#4B5563" />
            <rect x="74" y="58" width="6" height="28" rx="2" fill="#4B5563" />
            {/* Lifter Body */}
            <circle cx="50" cy="24" r="7" fill={bodyColor} /> {/* Head */}
            <path d="M50 31 L50 54" stroke={glowColor} strokeWidth="7" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} /> {/* Spine/Back */}
            <path d="M50 54 L36 72 M50 54 L64 72" stroke={glowColor} strokeWidth="6" strokeLinecap="round" /> {/* Legs/Glutes */}
            <path d="M47 38 L30 70 M53 38 L70 70" stroke={bodyColor} strokeWidth="4" strokeLinecap="round" /> {/* Arms */}
          </g>
        )}

        {/* ================= HIP THRUST MACHINE ================= */}
        {isHipThrust && (
          <g>
            {/* Machine Frame */}
            <rect x="16" y="32" width="14" height="48" rx="3" fill={machineColor} />
            <line x1="28" y1="68" x2="84" y2="68" stroke={machineColor} strokeWidth="4" />
            <rect x="68" y="52" width="16" height="16" rx="2" fill="#374151" />
            {/* Person in Hip Thrust */}
            <circle cx="78" cy="46" r="6" fill={bodyColor} />
            <path d="M74 52 L54 50" stroke={bodyColor} strokeWidth="6" strokeLinecap="round" /> {/* Torso */}
            <circle cx="52" cy="50" r="7" fill={glowColor} filter={`url(#drop-shadow-${exerciseId})`} /> {/* Glutes Target */}
            <path d="M52 50 L42 66 L30 66" stroke={glowColor} strokeWidth="5" strokeLinecap="round" /> {/* Thigh & Foot */}
          </g>
        )}

        {/* ================= SEATED LEG CURL ================= */}
        {isLegCurl && (
          <g>
            {/* Machine Backrest & Seat */}
            <rect x="25" y="28" width="8" height="42" rx="3" fill={machineColor} />
            <rect x="25" y="62" width="34" height="8" rx="3" fill={machineColor} />
            {/* Person */}
            <circle cx="34" cy="22" r="6" fill={bodyColor} />
            <line x1="33" y1="28" x2="35" y2="60" stroke={bodyColor} strokeWidth="6" strokeLinecap="round" />
            <line x1="35" y1="60" x2="62" y2="60" stroke={bodyColor} strokeWidth="6" strokeLinecap="round" />
            {/* Hamstrings glowing curl */}
            <path d="M62 60 L68 80" stroke={glowColor} strokeWidth="6" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} />
            <circle cx="68" cy="80" r="4" fill="#6B7280" /> {/* Roller */}
          </g>
        )}

        {/* ================= HIP ADDUCTION MACHINE ================= */}
        {isAdduction && (
          <g>
            {/* Machine Seat */}
            <rect x="36" y="24" width="28" height="34" rx="4" fill={machineColor} />
            <rect x="28" y="54" width="44" height="8" rx="3" fill={machineColor} />
            {/* Person front view */}
            <circle cx="50" cy="18" r="6" fill={bodyColor} />
            <path d="M50 24 L50 54" stroke={bodyColor} strokeWidth="8" strokeLinecap="round" />
            {/* Inner Thighs squeezed together */}
            <path d="M42 54 L44 76 M58 54 L56 76" stroke={glowColor} strokeWidth="7" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} />
            <rect x="34" y="60" width="8" height="12" rx="2" fill="#4B5563" />
            <rect x="58" y="60" width="8" height="12" rx="2" fill="#4B5563" />
          </g>
        )}

        {/* ================= HIP ABDUCTION MACHINE ================= */}
        {isAbduction && (
          <g>
            {/* Machine Seat */}
            <rect x="36" y="24" width="28" height="34" rx="4" fill={machineColor} />
            <rect x="28" y="54" width="44" height="8" rx="3" fill={machineColor} />
            {/* Person */}
            <circle cx="50" cy="18" r="6" fill={bodyColor} />
            <path d="M50 24 L50 54" stroke={bodyColor} strokeWidth="8" strokeLinecap="round" />
            {/* Outer hips spreading apart */}
            <path d="M46 54 L28 72 M54 54 L72 72" stroke={glowColor} strokeWidth="7" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} />
            <rect x="20" y="62" width="8" height="12" rx="2" fill="#4B5563" />
            <rect x="72" y="62" width="8" height="12" rx="2" fill="#4B5563" />
          </g>
        )}

        {/* ================= CABLE CRUNCH / ABS ================= */}
        {isCrunch && (
          <g>
            {/* Cable Station Top */}
            <line x1="20" y1="14" x2="80" y2="14" stroke={machineColor} strokeWidth="4" />
            <line x1="50" y1="14" x2="50" y2="34" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="3,2" />
            <circle cx="50" cy="34" r="3" fill="#6B7280" />
            {/* Kneeling Body */}
            <circle cx="54" cy="38" r="6" fill={bodyColor} />
            {/* Curled Abdomen Target */}
            <path d="M54 44 C 44 48, 42 62, 52 66" stroke={glowColor} strokeWidth="7" strokeLinecap="round" fill="none" filter={`url(#drop-shadow-${exerciseId})`} />
            <path d="M52 66 L68 76 L76 76" stroke={bodyColor} strokeWidth="5" strokeLinecap="round" /> {/* Legs kneeling */}
            <line x1="52" y1="40" x2="50" y2="34" stroke={bodyColor} strokeWidth="3" /> {/* Arms holding rope */}
          </g>
        )}

        {/* ================= SQUAT / BULGARIAN SPLIT SQUAT ================= */}
        {isSquat && !isDeadlift && (
          <g>
            {/* Dumbbells or Bench */}
            <rect x="68" y="58" width="18" height="14" rx="2" fill={machineColor} />
            <circle cx="44" cy="22" r="6" fill={bodyColor} />
            <path d="M44 28 L44 54" stroke={bodyColor} strokeWidth="6" strokeLinecap="round" />
            {/* Front Leg Quads target */}
            <path d="M44 54 L32 64 L34 82" stroke={glowColor} strokeWidth="6" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} />
            {/* Rear Leg on bench */}
            <path d="M44 54 L60 62 L74 60" stroke={bodyColor} strokeWidth="5" strokeLinecap="round" />
            {/* Dumbbell in hand */}
            <rect x="42" y="46" width="4" height="12" rx="1" fill="#9CA3AF" />
          </g>
        )}

        {/* ================= BENCH PRESS / CHEST ================= */}
        {isBench && !isDeadlift && !isSquat && (
          <g>
            <rect x="20" y="60" width="60" height="8" rx="2" fill={machineColor} />
            <circle cx="70" cy="52" r="6" fill={bodyColor} />
            <path d="M66 56 L38 56" stroke={bodyColor} strokeWidth="6" strokeLinecap="round" />
            {/* Chest Target */}
            <circle cx="50" cy="53" r="6" fill={glowColor} filter={`url(#drop-shadow-${exerciseId})`} />
            <line x1="38" y1="56" x2="30" y2="76" stroke={bodyColor} strokeWidth="5" strokeLinecap="round" />
            <line x1="22" y1="36" x2="78" y2="36" stroke="#9CA3AF" strokeWidth="4" />
            <path d="M54 54 L50 36 M46 54 L50 36" stroke={bodyColor} strokeWidth="3" />
          </g>
        )}

        {/* ================= BACK / ROWS / PULLDOWN ================= */}
        {isRow && !isDeadlift && !isCrunch && (
          <g>
            <circle cx="50" cy="22" r="6" fill={bodyColor} />
            <path d="M50 28 L50 56" stroke={glowColor} strokeWidth="8" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} />
            <path d="M50 56 L40 76 M50 56 L60 76" stroke={bodyColor} strokeWidth="5" strokeLinecap="round" />
            <line x1="25" y1="38" x2="75" y2="38" stroke="#6B7280" strokeWidth="3" />
            <path d="M50 34 L32 38 M50 34 L68 38" stroke={bodyColor} strokeWidth="4" />
          </g>
        )}

        {/* ================= SHOULDERS ================= */}
        {isShoulder && !isBench && !isRow && (
          <g>
            <circle cx="50" cy="22" r="6" fill={bodyColor} />
            <path d="M50 28 L50 60" stroke={bodyColor} strokeWidth="7" strokeLinecap="round" />
            {/* Deltoid Shoulders Target */}
            <circle cx="40" cy="32" r="5" fill={glowColor} filter={`url(#drop-shadow-${exerciseId})`} />
            <circle cx="60" cy="32" r="5" fill={glowColor} filter={`url(#drop-shadow-${exerciseId})`} />
            <path d="M40 32 L26 44 M60 32 L74 44" stroke={bodyColor} strokeWidth="4" strokeLinecap="round" />
          </g>
        )}

        {/* ================= ARMS ================= */}
        {isArm && !isShoulder && (
          <g>
            <circle cx="50" cy="22" r="6" fill={bodyColor} />
            <path d="M50 28 L50 60" stroke={bodyColor} strokeWidth="7" strokeLinecap="round" />
            <path d="M46 32 L36 44 L44 50" stroke={glowColor} strokeWidth="6" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} />
            <path d="M54 32 L64 44 L56 50" stroke={glowColor} strokeWidth="6" strokeLinecap="round" filter={`url(#drop-shadow-${exerciseId})`} />
          </g>
        )}

        {/* Fallback default if not matched */}
        {!isDeadlift && !isHipThrust && !isLegCurl && !isAdduction && !isAbduction && !isCrunch && !isSquat && !isBench && !isRow && !isShoulder && !isArm && (
          <g>
            <circle cx="50" cy="24" r="7" fill={bodyColor} />
            <path d="M50 31 L50 58" stroke={bodyColor} strokeWidth="7" strokeLinecap="round" />
            <circle cx="50" cy="42" r="6" fill={glowColor} filter={`url(#drop-shadow-${exerciseId})`} />
            <path d="M50 58 L38 78 M50 58 L62 78" stroke={bodyColor} strokeWidth="5" strokeLinecap="round" />
          </g>
        )}
      </svg>
    </div>
  );
};
