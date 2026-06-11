/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/**/*.html',
    './public/js/**/*.js',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    fontFamily: {
      sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      mono: ['SF Mono', 'Fira Code', 'monospace'],
    },
    fontSize: {
      'xs':   ['0.6875rem', { lineHeight: '1.2' }],   // 11px
      'sm':   ['0.75rem',   { lineHeight: '1.5' }],   // 12px
      'base': ['0.875rem',  { lineHeight: '1.5' }],   // 14px
      'md':   ['1rem',      { lineHeight: '1.5' }],   // 16px
      'lg':   ['1.125rem',  { lineHeight: '1.2' }],   // 18px
      'xl':   ['1.25rem',   { lineHeight: '1.2' }],   // 20px
      '2xl':  ['1.5rem',    { lineHeight: '1.2' }],   // 24px
      '3xl':  ['2rem',      { lineHeight: '1.2' }],   // 32px
      '4xl':  ['2.5rem',    { lineHeight: '1.2' }],   // 40px
    },
    extend: {
      colors: {
        // Background layers (dark theme — defaults)
        'bg-primary':   'var(--color-bg-primary)',
        'bg-secondary': 'var(--color-bg-secondary)',
        'bg-tertiary':  'var(--color-bg-tertiary)',
        'bg-elevated':  'var(--color-bg-elevated)',
        'bg-hover':     'var(--color-bg-hover)',
        'bg-active':    'var(--color-bg-active)',
        'bg-input':     'var(--color-bg-input)',

        // Text
        'primary':   'var(--color-text-primary)',
        'secondary': 'var(--color-text-secondary)',
        'tertiary':  'var(--color-text-tertiary)',

        // Borders
        'border':       'var(--color-border)',
        'border-hover': 'var(--color-border-hover)',
        'border-focus': 'var(--color-border-focus)',

        // Accent / Brand
        'accent': {
          DEFAULT: '#6366f1',
          hover:   '#7577f5',
          light:   'rgba(99, 102, 241, 0.15)',
        },

        // Semantic
        'success':       { DEFAULT: '#22c55e', light: 'rgba(34, 197, 94, 0.15)' },
        'warning':       { DEFAULT: '#f59e0b', light: 'rgba(245, 158, 11, 0.15)' },
        'danger':        { DEFAULT: '#ef4444', light: 'rgba(239, 68, 68, 0.15)' },
        'info':          { DEFAULT: '#3b82f6', light: 'rgba(59, 130, 246, 0.15)' },

        // Chat bubbles
        'bubble-sent':      '#6366f1',
        'bubble-sent-text': '#ffffff',
        'bubble-recv':      'var(--color-bg-elevated)',
        'bubble-recv-text': 'var(--color-text-primary)',

        // Status
        'online':  '#22c55e',
        'offline': '#5c5c6e',
        'away':    '#f59e0b',

        // Surface (subtle overlays)
        'surface':        'rgba(255, 255, 255, 0.03)',
        'surface-hover':  'rgba(255, 255, 255, 0.06)',
        'surface-active': 'rgba(255, 255, 255, 0.09)',
      },

      borderRadius: {
        'bubble':      '18px',
        'bubble-tail': '4px',
      },

      boxShadow: {
        'sm':   '0 1px 3px rgba(0, 0, 0, 0.12)',
        'md':   '0 4px 12px rgba(0, 0, 0, 0.15)',
        'lg':   '0 8px 30px rgba(0, 0, 0, 0.2)',
        'xl':   '0 16px 50px rgba(0, 0, 0, 0.3)',
        'glow': '0 0 20px rgba(99, 102, 241, 0.3)',
        'glow-success': '0 0 20px rgba(34, 197, 94, 0.3)',
        'bubble-sent': '0 1px 4px rgba(0,0,0,0.2), 0 4px 12px rgba(99,102,241,0.15)',
        'bubble-recv': '0 1px 2px rgba(0,0,0,0.08)',
      },

      backdropBlur: {
        'glass': '20px',
      },

      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      zIndex: {
        'dropdown': '100',
        'sticky':   '200',
        'overlay':  '300',
        'modal':    '400',
        'toast':    '500',
      },

      animation: {
        'shimmer':      'shimmer 1.4s infinite',
        'spin-fast':    'spin 0.6s linear infinite',
        'msg-in':       'msgIn 0.2s ease-out',
        'fade-in':      'fadeIn 0.15s ease-out',
        'slide-up':     'slideUp 0.2s ease-out',
        'slide-down':   'slideDown 0.15s ease-out',
        'slide-right':  'slideInRight 0.25s ease-out',
        'badge-pop':    'badgePop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'empty-pulse':  'emptyPulse 4s ease-in-out infinite',
        'record-pulse': 'recordPulse 1s ease-in-out infinite',
        'typing-bounce': 'typingBounce 1.4s ease-in-out infinite',
        'check-pop':    'checkPop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'orb-float':    'orbFloat 8s ease-in-out infinite',
      },

      keyframes: {
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        msgIn: {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        slideDown: {
          from: { transform: 'translateY(-10px)', opacity: '0' },
          to:   { transform: 'translateY(0)',     opacity: '1' },
        },
        slideInRight: {
          from: { transform: 'translateX(110%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        badgePop: {
          from: { transform: 'scale(0.6)', opacity: '0' },
          to:   { transform: 'scale(1)',   opacity: '1' },
        },
        emptyPulse: {
          '0%, 100%': { transform: 'scale(1)',    boxShadow: '0 0 0 0 rgba(99,102,241,0.3)' },
          '50%':      { transform: 'scale(1.02)', boxShadow: '0 0 0 16px rgba(99,102,241,0)' },
        },
        recordPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.4)' },
          '50%':      { boxShadow: '0 0 0 10px rgba(239,68,68,0)' },
        },
        typingBounce: {
          '0%, 60%, 100%': { transform: 'translateY(0)',    opacity: '0.5' },
          '30%':           { transform: 'translateY(-6px)', opacity: '1' },
        },
        checkPop: {
          from: { transform: 'scale(0) rotate(-45deg)', opacity: '0' },
          to:   { transform: 'scale(1) rotate(0deg)',   opacity: '1' },
        },
        orbFloat: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%':      { transform: 'translate(15px, -15px) scale(1.06)' },
        },
      },

      spacing: {
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-t': 'env(safe-area-inset-top, 0px)',
      },

      width: {
        'sidebar': '380px',
      },

      height: {
        'header': '64px',
        'input':  '64px',
      },
    },
  },
  plugins: [],
};
