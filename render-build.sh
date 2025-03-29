#!/bin/bash

# Set production flag
export NODE_ENV=production

# Install dependencies
npm install

# Explicitly install Chrome for Puppeteer
echo "Installing Chrome for Puppeteer..."
mkdir -p /tmp/puppeteer
npx puppeteer browsers install chrome@stable --path /tmp/puppeteer

# List contents to verify
echo "Installed Chrome at:"
ls -la /tmp/puppeteer/chrome

echo "Build completed successfully"