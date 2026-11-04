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
        // Expose DS semantic tokens as Tailwind utilities, e.g. `bg-ds-bg`
        ds: {
          bg: 'var(--ds-bg)',
          'bg-elevated': 'var(--ds-bg-elevated)',
          'bg-overlay': 'var(--ds-bg-overlay)',
          border: 'var(--ds-border)',
          'border-subtle': 'var(--ds-border-subtle)',
          'text-primary': 'var(--ds-text-primary)',
          'text-secondary': 'var(--ds-text-secondary)',
          'text-disabled': 'var(--ds-text-disabled)',
          accent: 'var(--ds-accent)',
          'accent-hover': 'var(--ds-accent-hover)',
          'accent-fg': 'var(--ds-accent-fg)',
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
      transitionDuration: {
        fast: '100ms',
        base: '200ms',
        slow: '350ms',
      },
    },
  },
  plugins: [],
};

export default config;
