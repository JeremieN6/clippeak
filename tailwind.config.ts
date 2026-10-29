import type { Config } from 'tailwindcss'

export default <Partial<Config>>{
  content: [
    './app/**/*.{vue,js,ts}',
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './nuxt.config.{js,ts}'
  ],
  theme: {
    extend: {
      colors: {
        // Couleurs du kit du studio (valeurs dans studio.css, variables --st-*).
        st: {
        bg: 'var(--st-bg)',
        surface: 'var(--st-surface)',
        border: 'var(--st-border)',
        borderStrong: 'var(--st-border-strong)',
        raised: 'var(--st-raised)',
        raised2: 'var(--st-raised-2)',
        field: 'var(--st-field)',
        accent: 'var(--st-accent)',
        accentHover: 'var(--st-accent-hover)',
        accentLight: 'var(--st-accent-light)',
        accentBg: 'var(--st-accent-bg)',
        accentText: 'var(--st-accent-text)',
        accentSoft: 'var(--st-accent-soft)',
        accentBorder: 'var(--st-accent-border)',
        accentDeep: 'var(--st-accent-deep)',
        text: 'var(--st-text)',
        muted: 'var(--st-muted)',
        dim: 'var(--st-dim)',
        soft: 'var(--st-soft)',
        okBg: 'var(--st-ok-bg)',
        ok: 'var(--st-ok)',
        warnBg: 'var(--st-warn-bg)',
        warn: 'var(--st-warn)',
        infoBg: 'var(--st-info-bg)',
        info: 'var(--st-info)',
        errorBg: 'var(--st-error-bg)',
        error: 'var(--st-error)',
        okBorder: 'var(--st-ok-border)',
        warnBorder: 'var(--st-warn-border)',
        errorBorder: 'var(--st-error-border)'
        },
        clippeak: {
          bg: '#0a0a0f',
          violet: '#7c3aed',
          violetLight: '#9f67ff',
          surface: '#12121d',
          text: '#f5f5ff',
          muted: '#9fa1b2'
        }
      },
      boxShadow: {
        glow: '0 0 120px rgba(124, 58, 237, 0.35)'
      },
      fontFamily: {
        display: ['Sora', 'sans-serif'],
        body: ['Manrope', 'sans-serif']
      },
      keyframes: {
        riseIn: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        riseIn: 'riseIn 600ms ease-out both'
      }
    }
  }
}
