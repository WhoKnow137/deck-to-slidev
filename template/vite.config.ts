import { defineConfig } from 'vite'

// Studio component metadata is a Vue custom block. Plain Slidev can render the
// components without the editor when DECK_PLAIN=1 and slidev.addons is empty.
export default defineConfig({
  plugins: process.env.DECK_PLAIN === '1' ? [{
    name: 'deck-plain-studio-metadata',
    enforce: 'pre',
    transform(_source, id) {
      if (id.includes('?vue&type=studio&')) return 'export default {}'
    },
  }] : [],
})
