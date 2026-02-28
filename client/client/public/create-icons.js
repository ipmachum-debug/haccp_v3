// Simple icon creation using canvas (Node.js)
const fs = require('fs');

// Create a simple blue square with "H" text as placeholder
// In production, use proper icon generation tools

const svg192 = `<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
  <rect width="192" height="192" fill="#0ea5e9" rx="24"/>
  <text x="96" y="130" font-size="80" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial, sans-serif">H</text>
</svg>`;

const svg512 = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0ea5e9" rx="64"/>
  <text x="256" y="350" font-size="220" font-weight="bold" text-anchor="middle" fill="white" font-family="Arial, sans-serif">H</text>
</svg>`;

fs.writeFileSync('icon-192.svg', svg192);
fs.writeFileSync('icon-512.svg', svg512);

console.log('Icon SVG files created. Use a tool like Inkscape or online converter to create PNG files.');
