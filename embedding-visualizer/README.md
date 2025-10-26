# Conversation Embeddings Visualizer

A tool for visualizing model-to-model conversations using embeddings and dimensionality reduction.

## Features

- Computes embeddings for each message using OpenAI's embedding API
- Reduces dimensionality using t-SNE
- Interactive 2D scatter plot visualization
- Color-coded by model/speaker
- Shows conversation flow as lines connecting messages
- Click on points to view message details

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure you have an OpenAI API key set in your environment:
```bash
export OPENAI_API_KEY="your-key-here"
```

## Usage

### Running the Backend

1. Configure the conversation path in `backend.py`:
```python
CONVERSATION_PATH = "conversations/3/*.json"  # Change this to your desired path
```

2. Start the FastAPI server:
```bash
cd embedding-visualizer
python backend.py
```

The server will start at `http://localhost:8000`

### Running the Frontend

1. Open `index.html` in a web browser, or serve it with a simple HTTP server:
```bash
python -m http.server 8080
```

Then navigate to `http://localhost:8080`

2. Click "Load Visualization" to compute embeddings and display the scatter plot

3. Hover over points to highlight them, click to see message details

## Architecture

### Backend (`backend.py`)
- FastAPI server that loads conversation JSON files
- Computes embeddings using `embed.py` (with caching)
- Performs t-SNE dimensionality reduction
- Returns visualization data via REST API

### Frontend (`index.html`, `style.css`, `script.js`)
- Vanilla HTML/CSS/JS (no frameworks)
- Canvas-based scatter plot visualization
- Interactive hover and click functionality
- Model legend and message details panel

## Configuration

- **Backend URL**: Change `BACKEND_URL` in `script.js` (default: `http://localhost:8000`)
- **Conversation Path**: Change `CONVERSATION_PATH` in `backend.py`
- **Embedding Model**: Change in `embed.py` (default: `text-embedding-3-small`)

## Future Enhancements

The frontend is designed to be deployed on GitHub Pages. To prepare for static deployment:
1. Pre-compute embeddings and t-SNE coordinates
2. Export data as a JSON file
3. Modify `script.js` to load from static JSON instead of API
4. Remove backend dependency

## Conversation File Format

Expected JSON format:
```json
{
  "model_a": "model-name-1",
  "model_b": "model-name-2",
  "messages": [
    {
      "speaker": "model-name-1",
      "content": "message text",
      "role": "assistant"
    }
  ]
}
```