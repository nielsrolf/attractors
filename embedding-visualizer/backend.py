from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import json
import glob
import asyncio
import hashlib
import os
from sklearn.manifold import TSNE
import numpy as np
from cache_on_disk import DCache
from embed import get_embedding

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration - specify the conversation batch path here
CONVERSATION_PATH = "conversations/3_ends/*.json"

# Set up cache for t-SNE results
_tsne_cache = DCache(cache_dir=os.path.expanduser("~/.cache/tsne"))


@_tsne_cache
def compute_tsne(embeddings_array: np.ndarray, n_components: int = 2, perplexity: int = 30, random_state: int = 42):
    """
    Compute t-SNE dimensionality reduction with caching.

    Optimized for semantic embeddings to emphasize local structure:
    - Uses cosine metric (better for normalized embeddings)
    - Higher early_exaggeration for better cluster separation
    - More iterations for better convergence
    """
    tsne = TSNE(
        n_components=n_components,
        random_state=random_state,
        perplexity=perplexity,
        metric='cosine',  # Better for embeddings than euclidean
        early_exaggeration=20.0,  # Increased from default 12 to emphasize clusters more
        learning_rate='auto',  # Adaptive learning rate
        n_iter=1500,  # Increased from default 1000 for better convergence
        init='pca'  # PCA initialization for more stable results
    )
    return tsne.fit_transform(embeddings_array)


class Message(BaseModel):
    text: str
    speaker: str
    conversation_id: str
    message_index: int
    x: float
    y: float


class VisualizationData(BaseModel):
    messages: List[Message]
    conversations: List[Dict[str, Any]]


async def load_conversations(pattern: str) -> List[Dict[str, Any]]:
    """Load all conversation JSON files matching the pattern."""
    file_paths = glob.glob(pattern)
    conversations = []

    for file_path in file_paths:
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                data['file_path'] = file_path
                conversations.append(data)
        except Exception as e:
            print(f"Error loading {file_path}: {e}")

    return conversations


async def compute_embeddings_and_reduce(conversations: List[Dict[str, Any]], method: str = "tsne") -> VisualizationData:
    """Compute embeddings for all messages and reduce dimensionality."""

    # Collect all messages with metadata
    all_messages = []
    for conv_idx, conv in enumerate(conversations):
        for msg_idx, msg in enumerate(conv.get('messages', [])):
            content = msg.get('content', '').strip()
            if content:  # Skip empty messages
                all_messages.append({
                    'text': content,
                    'speaker': msg.get('speaker', 'unknown'),
                    'conversation_id': f"conv_{conv_idx}",
                    'message_index': msg_idx,
                    'conversation_data': conv
                })

    if not all_messages:
        raise HTTPException(status_code=404, detail="No messages found in conversations")

    # Compute embeddings for all messages in parallel
    print(f"Computing embeddings for {len(all_messages)} messages...")
    embedding_tasks = [get_embedding(msg['text']) for msg in all_messages]
    embeddings = await asyncio.gather(*embedding_tasks)
    embeddings_array = np.array(embeddings)

    # Reduce dimensionality
    print(f"Reducing dimensionality with {method}...")
    if method == "tsne":
        # Use t-SNE for dimensionality reduction (with caching)
        perplexity = min(30, len(all_messages) - 1)
        coords_2d = compute_tsne(embeddings_array, n_components=2, perplexity=perplexity, random_state=42)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown method: {method}")

    # Create message objects with coordinates
    messages = []
    for i, msg in enumerate(all_messages):
        messages.append(Message(
            text=msg['text'],
            speaker=msg['speaker'],
            conversation_id=msg['conversation_id'],
            message_index=msg['message_index'],
            x=float(coords_2d[i, 0]),
            y=float(coords_2d[i, 1])
        ))

    # Create conversation metadata
    conversations_meta = []
    for conv_idx, conv in enumerate(conversations):
        conversations_meta.append({
            'id': f"conv_{conv_idx}",
            'model_a': conv.get('model_a', 'unknown'),
            'model_b': conv.get('model_b', 'unknown'),
            'file_path': conv.get('file_path', ''),
            'message_count': len(conv.get('messages', []))
        })

    return VisualizationData(messages=messages, conversations=conversations_meta)


@app.get("/api/visualize")
async def get_visualization(method: str = "tsne", path: Optional[str] = None):
    """
    Get visualization data with embeddings and dimensionality reduction.

    Args:
        method: Dimensionality reduction method ('tsne' for now)
        path: Optional custom conversation path pattern (defaults to CONVERSATION_PATH)
    """
    conversation_path = path if path else CONVERSATION_PATH

    try:
        conversations = await load_conversations(conversation_path)

        if not conversations:
            raise HTTPException(status_code=404, detail=f"No conversations found at {conversation_path}")

        print(f"Loaded {len(conversations)} conversations")

        visualization_data = await compute_embeddings_and_reduce(conversations, method)

        return visualization_data

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)