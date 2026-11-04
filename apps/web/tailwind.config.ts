import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--ds-font-sans)'],
        mono: ['var(--ds-font-mono)'],
      },
      colors: {
        // All design-system semantic tokens exposed as Tailwind utilities
        ds: {
          bg: 'var(--ds-bg)',
          'bg-raised': 'var(--ds-bg-raised)',
          'bg-elevated': 'var(--ds-bg-elevated)',
          'bg-overlay': 'var(--ds-bg-overlay)',
          'bg-hover': 'var(--ds-bg-hover)',
          'bg-active': 'var(--ds-bg-active)',
          'bg-selected': 'var(--ds-bg-selected)',
          border: 'var(--ds-border)',
          'border-subtle': 'var(--ds-border-subtle)',
          'border-strong': 'var(--ds-border-strong)',
          'border-focus': 'var(--ds-border-focus)',
          'text-primary': 'var(--ds-text-primary)',
          'text-secondary': 'var(--ds-text-secondary)',
          'text-tertiary': 'var(--ds-text-tertiary)',
          'text-disabled': 'var(--ds-text-disabled)',
          'text-inverse': 'var(--ds-text-inverse)',
          'text-link': 'var(--ds-text-link)',
          accent: 'var(--ds-accent)',
          'accent-hover': 'var(--ds-accent-hover)',
          'accent-subtle': 'var(--ds-accent-subtle)',
          'accent-fg': 'var(--ds-accent-fg)',
          success: 'var(--ds-success)',
          warning: 'var(--ds-warning)',
          error: 'var(--ds-error)',
        },
      },
      borderRadius: {
        xs: 'var(--ds-radius-xs)',
        sm: 'var(--ds-radius-sm)',
        md: 'var(--ds-radius-md)',
        lg: 'var(--ds-radius-lg)',
        xl: 'var(--ds-radius-xl)',
        '2xl': 'var(--ds-radius-2xl)',
        full: 'var(--ds-radius-full)',
      },
      boxShadow: {
        xs: 'var(--ds-shadow-xs)',
        sm: 'var(--ds-shadow-sm)',
        md: 'var(--ds-shadow-md)',
        lg: 'var(--ds-shadow-lg)',
        accent: 'var(--ds-shadow-accent)',
        brand: 'var(--ds-shadow-brand)',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        fast: 'var(--ds-t-fast)',
        base: 'var(--ds-t-base)',
        slow: 'var(--ds-t-slow)',
      },
      keyframes: {
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-left': 'slide-in-left 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
