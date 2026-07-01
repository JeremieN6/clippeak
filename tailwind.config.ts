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
