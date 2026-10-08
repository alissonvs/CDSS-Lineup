/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cco: {
          darkest: '#090d16',
          bg: '#0c1220',
          panel: '#131b2e',
          card: '#18223a',
          border: '#223254',
          subtle: '#2c3e66',
          hover: '#1e2b48',
          accent: '#06b6d4', // Cyan
        },
        maritime: {
          orange: '#f97316', // Laranja (ETA Previsto)
          red: '#ef4444',    // Vermelho (Fundeio Real)
          gray: '#94a3b8',   // Cinza (Liberado / Livre Prática)
          green: '#10b981',  // Verde (Operando Berço Único)
          blue: '#3b82f6',   // Azul (Previsão Operacional Futura)
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}
