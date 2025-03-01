# Real-time Fact Checker

A browser-based application that performs real-time fact checking on spoken content from videos or webcam input using AI language models.

## Overview

Real-time Fact Checker is a standalone HTML/JS application that lets you analyze statements from videos or webcam streams in real-time. It transcribes speech using the Web Speech API and checks factual accuracy using AI language models like OpenAI's GPT, Anthropic's Claude, xAI's Grok, or local Ollama models.

[Live Demo](https://steveseguin.github.io/live-fact-checker/)

![image](https://github.com/user-attachments/assets/da39a37e-8b88-4f81-9f60-a69e03e26045)

## Features

- **Multiple Input Sources**: Supports uploaded video files or live webcam input
- **Real-time Speech Recognition**: Transcribes spoken content as it plays
- **AI-Powered Fact Checking**: Uses LLMs to analyze factual accuracy
- **Multiple AI Provider Support**:
  - OpenAI (GPT models)
  - Anthropic (Claude models)
  - xAI (Grok)
  - Ollama (local models)
  - Custom API endpoints
- **Adjustable Sensitivity**: Control how strict the fact checking should be
- **Fact Check History**: View and export your fact check results
- **Dark Mode**: Toggle between light and dark themes
- **Offline-Capable**: Works with local Ollama models without internet
- **Audio Feedback**: Optional sound notifications for fact check results
- **Settings Persistence**: Saves your settings and fact checks between sessions

## How It Works

1. Select a video file or use your webcam
2. Enter your API key for your chosen AI provider
3. Start fact checking
4. As statements are spoken, the app:
   - Transcribes speech in real-time
   - Filters out filler words and short phrases
   - Sends meaningful statements to the AI for fact checking
   - Displays results with confidence levels
   - Stores results in your fact check history

## Setup & Usage

### Quick Start

1. Clone this repository or download the HTML file
2. Open the HTML file in your browser
3. Configure your AI provider settings:
   - Select a provider (OpenAI, Anthropic, xAI, Ollama, or Custom)
   - Enter your API key
   - Adjust the fact checking sensitivity
4. Click "Select Video File" or "Use Webcam"
5. Click "Start Fact Checking"

### Using with Local Models

For privacy or offline usage, you can use Ollama with locally-running models:

1. Install [Ollama](https://ollama.ai/)
2. Pull a model (e.g., `ollama pull llama3`)
3. Start Ollama
4. In the app, select "Ollama" as your provider
5. The endpoint should be `http://localhost:11434/api/generate`
6. Set the model name (e.g., "llama3")

## Privacy & Data

- All processing happens in your browser
- Your API key is stored only in your browser's local storage
- Video and audio are not uploaded anywhere (only transcribed text is sent to AI APIs)
- Fact check results are stored in your browser's local storage only

## Technical Details

- Built with vanilla JavaScript, HTML, and CSS
- Uses the Web Speech API for speech recognition
- Supports modern browsers (Chrome, Edge, Firefox, Safari)
- No dependencies or server requirements

## Limitations

- Speech recognition requires browser support (best in Chrome)
- Accuracy depends on speech clarity and AI model quality
- Language support depends on your browser's speech recognition capabilities
- May require internet connection depending on the AI provider

## Contributions

Contributions, issues, and feature requests are welcome! Feel free to check the issues page.
