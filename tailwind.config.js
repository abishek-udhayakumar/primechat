/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/**/*.html',
    './public/js/**/*.js',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    fontFamily: {
      sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
    },
    extend: {
      colors: {
        /* ── Surfaces ── */
        surface: {
          0: 'var(--s0)',
          1: 'var(--s1)',
          2: 'var(--s2)',
          3: 'var(--s3)',
          glass: 'var(--sglass)',
        },
        /* ── Text ── */
        ink: {
          DEFAULT: 'var(--ink)',
          soft: 'var(--ink-soft)',
          faint: 'var(--ink-faint)',
          inverse: 'var(--ink-inverse)',
        },
        /* ── Border ── */
        edge: {
          DEFAULT: 'var(--edge)',
          soft: 'var(--edge-soft)',
          focus: 'var(--edge-focus)',
        },
        /* ── Accent: Electric Violet ── */
        prime: {
          50:  '#f0efff',
          100: '#e3e0ff',
          200: '#c7c0ff',
          300: '#a99dff',
          400: '#8b79ff',
          500: '#7c6af5',
          600: '#6d5de8',
          700: '#5a4ad0',
          800: '#473ab4',
          900: '#322a8e',
          DEFAULT: 'var(--prime)',
          hover: 'var(--prime-hover)',
          light: 'var(--prime-light)',
          glow: 'var(--prime-glow)',
        },
        /* ── Semantic ── */
        emerald: { DEFAULT: '#34d399', light: 'rgba(52,211,153,.10)' },
        crimson: { DEFAULT: '#f87171', light: 'rgba(248,113,113,.10)' },
        amber:   { DEFAULT: '#fbbf24', light: 'rgba(251,191,36,.10)' },
        cerulean:{ DEFAULT: '#60a5fa', light: 'rgba(96,165,250,.10)' },
      },
      spacing: {
        safe: 'env(safe-area-inset-bottom,0px)',
        touch: '44px',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        'bubble': '20px',
        'tail':   '5px',
        'pill':   '9999px',
      },
      boxShadow: {
        'xs':       '0 1px 2px rgba(0,0,0,.05)',
        'sm':       '0 1px 3px rgba(0,0,0,.10), 0 1px 2px rgba(0,0,0,.06)',
        'md':       '0 4px 6px rgba(0,0,0,.07), 0 2px 4px rgba(0,0,0,.06)',
        'lg':       '0 10px 15px rgba(0,0,0,.10), 0 4px 6px rgba(0,0,0,.05)',
        'xl':       '0 20px 25px rgba(0,0,0,.12), 0 10px 10px rgba(0,0,0,.04)',
        '2xl':      '0 25px 50px rgba(0,0,0,.20)',
        'glow':     '0 0 20px var(--prime-glow)',
        'glow-sm':  '0 0 10px var(--prime-glow)',
        'bubble-sent': '0 2px 12px rgba(124,106,245,.18)',
        'card':     '0 0 0 1px var(--edge), 0 2px 8px rgba(0,0,0,.08)',
        'inner':    'inset 0 1px 2px rgba(0,0,0,.06)',
      },
      transitionTimingFunction: {
        'spring':  'cubic-bezier(0.34,1.56,0.64,1)',
        'smooth':  'cubic-bezier(0.16,1,0.3,1)',
        'snap':    'cubic-bezier(0.2,0,0,1)',
        'bounce':  'cubic-bezier(0.68,-0.55,0.265,1.55)',
      },
      transitionDuration: {
        '80':  '80ms',
        '120': '120ms',
        '180': '180ms',
        '250': '250ms',
        '350': '350ms',
        '400': '400ms',
        '500': '500ms',
      },
      animation: {
        'message-in':    'msgIn 220ms cubic-bezier(0.34,1.56,0.64,1) both',
        'slide-up':      'slideUp 280ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-down':    'slideDown 220ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-right':   'slideRight 300ms cubic-bezier(0.16,1,0.3,1) both',
        'slide-left':    'slideLeft 280ms cubic-bezier(0.16,1,0.3,1) both',
        'fade-in':       'fadeIn 180ms ease-out both',
        'scale-in':      'scaleIn 200ms cubic-bezier(0.34,1.56,0.64,1) both',
        'shimmer':       'shimmer 1.8s ease-in-out infinite',
        'pulse-dot':     'pulseDot 1.4s ease-in-out infinite',
        'typing':        'typing 1.3s ease-in-out infinite',
        'record':        'record 1.1s ease-in-out infinite',
        'tick-in':       'tickIn 300ms cubic-bezier(0.34,1.56,0.64,1) both',
        'badge-pop':     'badgePop 220ms cubic-bezier(0.34,1.56,0.64,1) both',
        'float':         'float 3s ease-in-out infinite',
        'spin-slow':     'spin 0.75s linear infinite',
      },
      keyframes: {
        msgIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          from: { opacity: '0', transform: 'translateY(-10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          from: { opacity: '0', transform: 'translateX(-100%)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        slideLeft: {
          from: { opacity: '0', transform: 'translateX(100%)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseDot: {
          '0%,100%': { opacity: '0.4', transform: 'scale(0.8)' },
          '50%':     { opacity: '1',   transform: 'scale(1.2)' },
        },
        typing: {
          '0%,60%,100%': { transform: 'translateY(0)',    opacity: '0.3' },
          '30%':         { transform: 'translateY(-6px)', opacity: '1' },
        },
        record: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(248,113,113,0.4)' },
          '50%':     { boxShadow: '0 0 0 10px rgba(248,113,113,0)' },
        },
        tickIn: {
          from: { opacity: '0', transform: 'scale(0) rotate(-20deg)' },
          to:   { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        badgePop: {
          from: { opacity: '0', transform: 'scale(0) rotate(-15deg)' },
          to:   { opacity: '1', transform: 'scale(1) rotate(0deg)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-6px)' },
        },
      },
      backgroundImage: {
        'shimmer-dark':  'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
        'shimmer-light': 'linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.04) 50%, transparent 100%)',
        'prime-gradient': 'linear-gradient(135deg, #7c6af5 0%, #9d8eff 100%)',
        'prime-subtle':   'linear-gradient(135deg, rgba(124,106,245,0.12) 0%, rgba(157,142,255,0.06) 100%)',
        'sent-bubble':    'linear-gradient(145deg, #7c6af5 0%, #8e7cff 60%, #9d8eff 100%)',
        'warm-dark':      'radial-gradient(ellipse at 20% 10%, rgba(124,106,245,0.08) 0%, transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(157,142,255,0.05) 0%, transparent 60%)',
        'warm-light':     'radial-gradient(ellipse at 20% 10%, rgba(124,106,245,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(157,142,255,0.04) 0%, transparent 60%)',
      },
      fontSize: {
        '2xs': ['0.625rem',  { lineHeight: '1.2' }],
        'xs':  ['0.6875rem', { lineHeight: '1.4' }],
        'sm':  ['0.8125rem', { lineHeight: '1.5' }],
        'base':['0.875rem',  { lineHeight: '1.5' }],
        'md':  ['0.9375rem', { lineHeight: '1.45' }],
        'lg':  ['1.0625rem', { lineHeight: '1.4' }],
        'xl':  ['1.25rem',   { lineHeight: '1.3' }],
        '2xl': ['1.5rem',    { lineHeight: '1.2' }],
        '3xl': ['2rem',      { lineHeight: '1.15' }],
        '4xl': ['2.5rem',    { lineHeight: '1.1' }],
        '5xl': ['3.25rem',   { lineHeight: '1.05' }],
      },
      width: { sidebar: '368px' },
      maxWidth: { bubble: '480px' },
      zIndex: {
        dropdown: '100',
        sticky:   '200',
        overlay:  '300',
        modal:    '400',
        toast:    '500',
      },
    },
  },
  plugins: [],
};
