/** @type {import('tailwindcss').Config} */
const webappConfig = require('../webapp/tailwind.config.js')
// build 会使用这里的配置文件
module.exports = {
  // Inherit and extend the webapp config
  ...webappConfig,
  // Override content paths to include desktop-specific files
  content: [
    // Include webapp content paths with proper relative paths
    '../webapp/pages/**/*.{ts,tsx}',
    '../webapp/components/**/*.{ts,tsx}',
    '../webapp/app/**/*.{ts,tsx}',
    '../webapp/src/**/*.{ts,tsx}',
    '../webapp/src/**/*.{ts,tsx}',
    '../webapp/src/app/colors.css',
    '../webapp/src/app/globals.css',
    // Desktop-specific paths
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './src/app/colors.css',
    './src/app/globals.css',
  ],
}
