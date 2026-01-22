# Gemini Live Integration for Open WebUI

Real-time audio and video streaming with Google Gemini, with persistent memory across session timeouts.

## Overview

This integration adds Google Gemini Live capabilities to Open WebUI, allowing:
- Real-time voice conversations with Gemini
- Screen sharing / webcam video streaming
- Persistent memory across the 10-minute session timeout

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Open WebUI                              │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────┐ │
│  │ Gemini Live  │◄──►│   Memory     │◄──►│    Ollama     │ │
│  │  Overlay     │    │   Manager    │    │ (Summarizer)  │ │
│  └──────┬───────┘    └──────┬───────┘    └───────────────┘ │
│         │                   │                               │
│         │            ┌──────▼───────┐                       │
│         │            │  Persistent  │                       │
│         │            │   Storage    │                       │
│         │            │  (SQLite)    │                       │
│         │            └──────────────┘                       │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐                                          │
│  │   Gemini     │  ← Real-time video/audio only            │
│  │   Live API   │  ← 10-minute sessions                    │
│  │              │  ← Context injected on reconnect         │
│  └──────────────┘                                          │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Create an API key

### 2. Configure the API Key

Add to your `.env` file:

```bash
GEMINI_API_KEY='your-api-key-here'
GEMINI_LIVE_ENABLED=true
```

Or configure via Admin Settings (once UI is built).

### 3. Start Using Gemini Live

1. Open a chat in Open WebUI
2. Look for the ⚡ (lightning bolt) button next to the voice mode button
3. Click to start a Gemini Live session
4. Allow microphone (and camera/screen share if desired)
5. Start talking!

## Features

### Real-Time Audio
- Bidirectional voice streaming
- PCM16 audio at 16kHz input / 24kHz output
- Push-to-talk or continuous mode

### Video Streaming
- Webcam support
- Screen share support (via browser's `getDisplayMedia`)
- Frames captured and sent to Gemini for visual context

### Persistent Memory (Coming Soon)
- Automatic transcript logging
- Periodic summarization via local Ollama model
- Context restoration on reconnect
- Seamless continuation after 10-minute timeout

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | `` | Your Gemini API key |
| `GEMINI_LIVE_ENABLED` | `true` | Enable/disable Gemini Live |
| `GEMINI_LIVE_VOICE` | `Aoede` | Voice for Gemini responses |

### Available Voices
- Aoede
- Charon
- Fenrir
- Kore
- Puck

### Supported Models
- `gemini-2.5-flash-preview-native-audio-dialog` (Recommended)
- `gemini-2.0-flash-live-001`
- `gemini-2.0-flash-exp`

## API Endpoints

### Configuration
- `GET /api/v1/gemini/config` - Get admin config
- `POST /api/v1/gemini/config/update` - Update admin config
- `GET /api/v1/gemini/config/user` - Get user-facing config

### Models
- `GET /api/v1/gemini/models` - List all Gemini models
- `GET /api/v1/gemini/models/live` - List Gemini Live models

### Verification
- `POST /api/v1/gemini/verify` - Verify API key is valid
- `GET /api/v1/gemini/api-key` - Get API key for live sessions

## File Structure

```
backend/
├── open_webui/
│   ├── config.py          # Gemini configuration
│   ├── main.py            # Router registration
│   └── routers/
│       └── gemini.py      # API endpoints

src/
├── lib/
│   ├── apis/
│   │   └── gemini/
│   │       └── index.ts   # Frontend API client
│   ├── components/
│   │   └── chat/
│   │       ├── ChatControls.svelte      # Overlay rendering
│   │       ├── MessageInput.svelte      # Live button
│   │       └── MessageInput/
│   │           └── GeminiLiveOverlay.svelte  # Main UI
│   ├── constants.ts       # API base URL
│   └── stores/
│       └── index.ts       # Gemini state stores

static/
└── audio/
    └── gemini-audio-processor.js  # PCM16 AudioWorklet
```

## Development

### Running Locally

```bash
# Backend
cd backend
python -c "import uvicorn; uvicorn.run('open_webui.main:app', host='0.0.0.0', port=8080)"

# Frontend (separate terminal)
npm run dev
```

### Testing the Integration

1. Ensure Ollama is running with at least one model
2. Start backend and frontend
3. Create an account / sign in
4. Configure Gemini API key
5. Open a chat and click the ⚡ button

## Troubleshooting

### Button Not Visible
- Check that `GEMINI_API_KEY` is set in `.env`
- Restart the backend after changing `.env`
- Check browser console for errors

### Connection Fails
- Verify API key at [Google AI Studio](https://aistudio.google.com/)
- Check network connectivity to Google's servers
- Review backend logs for error messages

### Audio Issues
- Ensure microphone permissions are granted
- Check that the browser supports AudioWorklet
- Try a different browser (Chrome recommended)

### 10-Minute Timeout
This is a Gemini API limitation. The persistent memory system (coming soon) will automatically restore context when you reconnect.

## Privacy & Cost

### Privacy
- Real-time audio/video is sent to Google's servers
- Transcript summaries are processed locally via Ollama
- Session data is stored in your Open WebUI database

### Cost
- Gemini API has a free tier (15 RPM, 1M tokens/day for Flash)
- Heavy usage may require a paid plan
- Local summarization via Ollama is free

## Roadmap

- [x] Basic Gemini Live integration
- [ ] Persistent memory system
- [ ] Admin settings UI
- [ ] Session history browser
- [ ] Configurable summarization model

## Contributing

See the main Open WebUI contributing guidelines.

## License

Same as Open WebUI (MIT License).
