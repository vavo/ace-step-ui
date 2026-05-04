#!/bin/bash
# ACE-Step UI Setup Script

set -e

echo "=================================="
echo "  ACE-Step UI Setup"
echo "=================================="

# Check if ACE-Step exists
ACESTEP_PATH="${ACESTEP_PATH:-../ACE-Step-1.5}"

if [ ! -d "$ACESTEP_PATH" ]; then
    echo "Error: ACE-Step not found at $ACESTEP_PATH"
    echo ""
    echo "Please clone ACE-Step first:"
    echo "  cd .."
    echo "  git clone https://github.com/ace-step/ACE-Step-1.5"
    echo "  cd ACE-Step-1.5"
    echo "  uv venv && uv pip install -e ."
    echo "  cd ../ace-step-ui"
    echo "  ./setup.sh"
    exit 1
fi

if [ ! -d "$ACESTEP_PATH/.venv" ]; then
    echo "Error: ACE-Step venv not found. Please set up ACE-Step first:"
    echo "  cd $ACESTEP_PATH"
    echo "  uv venv && uv pip install -e ."
    exit 1
fi

echo "Found ACE-Step at: $ACESTEP_PATH"

# Get absolute path
ACESTEP_PATH=$(cd "$ACESTEP_PATH" && pwd)

# Create .env file
echo "Creating .env file..."
cat > .env << EOF
# ACE-Step UI Configuration

# Server
PORT=3001
NODE_ENV=development
FRONTEND_PORT=3000

# Database (SQLite)
DATABASE_PATH=./data/acestep.db

# ACE-Step API and local checkout
ACESTEP_API_URL=http://localhost:8001
ACESTEP_GRADIO_URL=
ACESTEP_PATH=$ACESTEP_PATH

# Storage
AUDIO_DIR=./public/audio

# Frontend
FRONTEND_URL=http://localhost:3000
VITE_API_URL=http://localhost:3001
PUBLIC_API_URL=http://localhost:3001
PASSWORD_RESET_BASE_URL=http://localhost:3000

# JWT Secret (for local session management)
JWT_SECRET=ace-step-ui-local-secret
AUTH_SESSION_DAYS=30
SUPERADMIN_EMAIL=
SUPERADMIN_EMAILS=

# Product calendar day for credit streaks
PRODUCT_TIME_ZONE=Europe/Bratislava

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3001/api/auth/google/callback

# Optional: Pexels API Key (for video backgrounds)
# Get a free API key at https://www.pexels.com/api/
PEXELS_API_KEY=

# Optional: Gemini API Key (for AI format actions in the UI)
# Get a key at https://ai.google.dev/
GEMINI_API_KEY=

# Optional: OpenAI API Key (used for lyrics and AI format actions)
# Get a key at https://platform.openai.com/api-keys
OPENAI_API_KEY=

# Optional: OpenAI model and reasoning effort for lyrics and AI format actions
OPENAI_MODEL=gpt-5.5
OPENAI_REASONING_EFFORT=high

# AI format provider:
# - auto: try OpenAI first, then Gemini fallback
# - openai: force OpenAI (fallback to Gemini if OpenAI key missing)
# - gemini: force Gemini (fallback to OpenAI if Gemini key missing)
FORMAT_PROVIDER=auto
EOF

# Install frontend dependencies
echo ""
echo "Installing frontend dependencies..."
npm install

# Install server dependencies
echo ""
echo "Installing server dependencies..."
cd server
npm install
cd ..

# Initialize database
echo ""
echo "Initializing database..."
cd server
npm run db:migrate 2>/dev/null || echo "Database migration failed or was already applied, continuing..."
cd ..

echo ""
echo "=================================="
echo "  Setup Complete!"
echo "=================================="
echo ""
echo "To start the application:"
echo ""
echo "  # Terminal 1 - Start backend"
echo "  cd server && npm run dev"
echo ""
echo "  # Terminal 2 - Start frontend"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:3000"
echo ""
