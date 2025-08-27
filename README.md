# Environment Setup

Install Node.js (v20.19.4) and pnpm
TIP: Recommend using nvm to manage Node.js versions (https://github.com/nvm-sh/nvm)

# Getting Started
Step 1: Install dependencies
```bash
corepack pnpm i
```

Step 2: Build MSIX package
```bash
pnpm run build:dev
```

Step 3: Install certificate
```bash
pnpm run install-certificate
```

Step 4: Install application
```bash
cd apps/desktop-backend/out
```
Then double-click Manus.msix to install Manus






