const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourceIcon = path.join(__dirname, '../llm-translator-chrome-extention/assets/icon/icon.png');
const outputDir = path.dirname(sourceIcon);
const sizes = [16, 48, 128];

if (!fs.existsSync(sourceIcon)) {
  console.error(`Error: Source icon not found at ${sourceIcon}`);
  process.exit(1);
}

async function resizeIcons() {
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon${size}.png`);
    try {
      await sharp(sourceIcon)
        .resize(size, size)
        .toFile(outputPath);
      console.log(`Generated: ${outputPath}`);
    } catch (err) {
      console.error(`Error generating ${size}x${size} icon:`, err);
    }
  }
}

resizeIcons();
