import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: '#05070a',
          panel: '#091018',
          panelDark: '#070b10',
          terminal: '#000000',
          border: 'rgba(34, 211, 238, 0.2)',
          text: '#e5e7eb',
          muted: '#71717a',
          cyan: '#67e8f9',
          green: '#86efac',
          amber: '#fcd34d',
          rose: '#fda4af',
        },
      },
      borderRadius: {
        cockpit: '6px',
      },
      fontFamily: {
        sans: ['Inter', 'Microsoft YaHei', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Mono', 'JetBrains Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        cockpitGlow: '0 0 28px rgba(34, 211, 238, 0.16)',
      },
    },
  },
} satisfies Config
