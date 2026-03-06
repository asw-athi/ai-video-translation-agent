# AI Video Translation and Summarization Agent

## Overview
This project is an AI-powered system that captures audio from foreign-language videos, transcribes the speech, translates it into English if necessary, and generates a concise summary. The final summary can be sent to the user via email.

The system combines a Chrome extension for capturing tab audio with a FastAPI backend that performs transcription, translation, and summarization using Groq AI models.

## Features
- Capture audio from videos playing in the browser
- Convert speech to text using Whisper
- Automatically translate non-English speech to English
- Generate structured summaries using a large language model
- Send summaries to users via email
- Process audio in chunks for continuous transcription

## System Architecture
The system consists of two main components:

Chrome Extension
- Captures tab audio from videos
- Records audio in chunks
- Sends audio data to the backend

FastAPI Backend
- Handles transcription requests
- Translates and summarizes text
- Sends results through email

## Technologies Used

Backend
- Python
- FastAPI
- Groq API
- Whisper Large v3
- LLaMA 3.3 70B

Frontend
- Chrome Extension (Manifest V3)
- JavaScript
- HTML
- CSS

Other Tools
- MediaRecorder API
- Chrome Tab Capture API
- SMTP Email Service

## Workflow
1. User starts audio capture from the Chrome extension.
2. Audio from the video is recorded and sent to the backend.
3. The backend transcribes speech using Whisper.
4. When recording stops, all transcriptions are combined.
5. The text is translated (if necessary) and summarized.
6. The final summary is sent to the user's email.

## Setup

### Backend
Install dependencies:

pip install -r requirements.txt

Create a `.env` file with:

GROQ_API_KEY=your_api_key  
SMTP_EMAIL=your_email  
SMTP_PASSWORD=your_app_password  

Run the server:

uvicorn main:app --reload

### Chrome Extension
1. Open Chrome and go to chrome://extensions
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select the extension folder

## Applications
- Understanding foreign-language video content
- Summarizing lectures or webinars
- Multilingual media accessibility
