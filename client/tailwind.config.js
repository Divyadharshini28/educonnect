/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#FAF8F4',
        ink: '#1A1A1A',
        muted: '#6B6B6B',
        line: '#E4E0D8',
        accent: {
          DEFAULT: '#C2410C',
          soft: '#F6E7DE',
          hover: '#9A3412',
        },
        ok: '#2F6B3F',
        warn: '#8A5A00',
        bad: '#9B2C2C',
      },
      fontFamily: {
        serif: ['Fraunces', 'Newsreader', 'Georgia', 'serif'],
        sans: ['Inter', 'Geist', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['var(--font-size-page-title)', { lineHeight: '1.25' }],
        'section-title': ['var(--font-size-section-title)', { lineHeight: '1.3' }],
        'card-title': ['var(--font-size-card-title)', { lineHeight: '1.35' }],
        'body': ['var(--font-size-body)', { lineHeight: '1.6' }],
        'label': ['var(--font-size-label)', { lineHeight: '1.4' }],
        'button': ['var(--font-size-button)', { lineHeight: '1.4' }],
        'helper': ['var(--font-size-helper)', { lineHeight: '1.5' }],
        'caption': ['var(--font-size-caption)', { lineHeight: '1.4' }],
        'badge': ['var(--font-size-badge)', { lineHeight: '1.2' }],
      },
      borderRadius: {
        DEFAULT: '4px',
        none: '0px',
        sm: '4px',
        md: '4px',
        lg: '4px',
        xl: '4px',
        '2xl': '4px',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        DEFAULT: 'none',
        sm: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
      },
      maxWidth: {
        editorial: '768px',
        form: '448px',
      }
    },
  },
  plugins: [],
}
