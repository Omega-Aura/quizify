import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary — blue (interactive, links, focus)
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Support — yellow (highlights, winner states)
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        // Light surfaces — white paper with cool grey steps
        surface: {
          DEFAULT: '#ffffff',
          50: '#f7f8fb',
          100: '#eff1f6',
          200: '#e6e9f1',
          300: '#dadeea',
        },
        // Body text ink — near-black with a blue undertone
        ink: '#171a2e',
        // The four answer colors — the game's identity
        answer: {
          red: '#f4586a',
          'red-hover': '#e23b50',
          blue: '#3d8bff',
          'blue-hover': '#2b6fe0',
          yellow: '#f7b53b',
          'yellow-hover': '#e39c1e',
          green: '#43cf8e',
          'green-hover': '#2fb277',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-display)', 'Fraunces', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-up': 'slideUp 0.5s ease-out forwards',
        'slide-down': 'slideDown 0.3s ease-out forwards',
        'slide-in-left': 'slideInLeft 0.3s ease-out forwards',
        'slide-in-right': 'slideInRight 0.3s ease-out forwards',
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'bounce-in': 'bounceIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
        'scale-in': 'scaleIn 0.3s ease-out forwards',
        'shimmer': 'shimmer 2s linear infinite',
        'confetti': 'confetti 1s ease-out forwards',
        'drift': 'drift 14s ease-in-out infinite',
        'breathe': 'breathe 5s ease-in-out infinite',
        'signal': 'synapseSignal 3.2s linear infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(30px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-30px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(30px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        confetti: {
          '0%': { transform: 'translateY(0) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(-200px) rotate(720deg)', opacity: '0' },
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(2%, -3%) scale(1.04)' },
          '66%': { transform: 'translate(-2%, 2%) scale(0.98)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.45', transform: 'scale(1)' },
          '50%': { opacity: '0.85', transform: 'scale(1.03)' },
        },
        synapseSignal: {
          '0%': { strokeDashoffset: '100', opacity: '0' },
          '12%': { opacity: '1' },
          '88%': { opacity: '1' },
          '100%': { strokeDashoffset: '0', opacity: '0' },
        },
      },
      boxShadow: {
        'glow-brand': '0 0 28px -6px rgba(37, 99, 235, 0.45)',
        'glow-accent': '0 0 28px -6px rgba(245, 158, 11, 0.45)',
        'glow-red': '0 0 24px -4px rgba(244, 88, 106, 0.45)',
        'glow-blue': '0 0 24px -4px rgba(61, 139, 255, 0.45)',
        'glow-yellow': '0 0 24px -4px rgba(247, 181, 59, 0.45)',
        'glow-green': '0 0 24px -4px rgba(67, 207, 142, 0.45)',
      },
    },
  },
  plugins: [],
};

export default config;
