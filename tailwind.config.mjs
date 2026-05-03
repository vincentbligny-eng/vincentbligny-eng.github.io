/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,svelte,ts,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        night:    { 900: '#07080c', 800: '#0d0f16', 700: '#131724', 600: '#1d2236' },
        mist:     { 50: '#f8fafc', 100: '#e2e6ef', 300: '#9aa3b7', 500: '#6b7388' },
        neon:     { DEFAULT: '#a3e635', glow: '#d9f99d' },      // hint / bingo
        ember:    { DEFAULT: '#fb923c', glow: '#fdba74' },      // player accent
        ice:      { DEFAULT: '#38bdf8', glow: '#7dd3fc' },      // info
        rose:     { DEFAULT: '#fb7185', glow: '#fda4af' },      // warning
        tile:     { cream: '#f5e7c9', edge: '#d4b88b' },
        prem: {
          dl: '#38bdf8',     // sky — letter ×2
          tl: '#2563eb',     // royal blue — letter ×3
          dw: '#fb7185',     // warm pink — word ×2
          tw: '#dc2626',     // crimson — word ×3
          center: '#fbbf24', // amber — start
        },
      },
      boxShadow: {
        tile: 'inset 0 -3px 0 rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.4)',
        glow: '0 0 24px -6px currentColor',
      },
      animation: {
        'pop-in': 'pop-in 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
      },
      keyframes: {
        'pop-in': {
          '0%':   { transform: 'scale(0.6)', opacity: '0' },
          '100%': { transform: 'scale(1)',   opacity: '1' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',   opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
