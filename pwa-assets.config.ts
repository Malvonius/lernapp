import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Icons aus public/icon.svg erzeugen: npx pwa-assets-generator
// Danach pwa-192x192.png / pwa-512x512.png in icon-192.png / icon-512.png umbenennen, pwa-64x64.png löschen.
const background = '#19181d';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0, resizeOptions: { background } },
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
});
