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


class AxisConfig(BaseModel):
    method: str  # 'tsne', 'similarity', 'llm_judge'
    config: Dict[str, Any] = {}


class VisualizationSettings(BaseModel):
    dimensionMode: str = '2d'  # '2d' or '3d'
    axes: Dict[str, AxisConfig] = {
        'x': AxisConfig(method='tsne', config={}),
        'y': AxisConfig(method='tsne', config={}),
        'z': AxisConfig(method='tsne', config={})
    }


class Message(BaseModel):
    text: str
    speaker: str
    conversation_id: str
    message_index: int
    x: float
    y: float
    z: Optional[float] = None


class VisualizationData(BaseModel):
    messages: List[Message]
    conversations: List[Dict[str, Any]]
    dimensionMode: str = '2d'


async def compute_similarity_projection(embeddings_array: np.ndarray, reference_text: str) -> np.ndarray:
    """
    Compute similarity-based projection onto a reference text embedding.
    Returns a 1D array of similarity scores (dot product with reference embedding).
    """
    # Get embedding for reference text
    reference_embedding = await get_embedding(reference_text)
    reference_array = np.array(reference_embedding)

    # Normalize embeddings (they should already be normalized from OpenAI, but just in case)
    reference_norm = reference_array / np.linalg.norm(reference_array)

    # Project each embedding onto the reference
    # For normalized embeddings, dot product gives cosine similarity
    similarities = embeddings_array @ reference_norm

    return similarities


async def compute_llm_judge_projection(all_messages: List[Dict[str, Any]], prompt: str) -> np.ndarray:
    """
    Placeholder for LLM Judge projection.
    TODO: Implement LLM-based scoring using the provided prompt.

    For now, returns random values as a placeholder.
    """
    # TODO: Implement actual LLM judge logic
    # This would involve:
    # 1. For each message, call an LLM with the judge prompt
    # 2. Extract a score from the LLM response
    # 3. Return array of scores

    print(f"LLM Judge called with prompt: {prompt[:100]}... (not yet implemented)")

    # Placeholder: return random scores
    return np.random.randn(len(all_messages))


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


async def compute_axis_coordinates(
    embeddings_array: np.ndarray,
    all_messages: List[Dict[str, Any]],
    axis_config: AxisConfig,
    axis_name: str,
    tsne_coords: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Compute coordinates for a single axis based on the configuration.
    """
    method = axis_config.method
    config = axis_config.config

    if method == "tsne":
        if tsne_coords is None:
            raise ValueError("t-SNE coordinates must be precomputed")
        # Return the appropriate column from t-SNE results
        axis_idx = {'x': 0, 'y': 1, 'z': 2}.get(axis_name, 0)
        if axis_idx >= tsne_coords.shape[1]:
            raise ValueError(f"t-SNE does not have enough dimensions for axis {axis_name}")
        return tsne_coords[:, axis_idx]

    elif method == "similarity":
        reference_text = config.get('text', '')
        if not reference_text:
            raise HTTPException(status_code=400, detail=f"Similarity method requires 'text' config for {axis_name}-axis")
        print(f"Computing similarity projection for {axis_name}-axis with reference: '{reference_text}'")
        return await compute_similarity_projection(embeddings_array, reference_text)

    elif method == "llm_judge":
        prompt = config.get('prompt', '')
        if not prompt:
            raise HTTPException(status_code=400, detail=f"LLM Judge method requires 'prompt' config for {axis_name}-axis")
        print(f"Computing LLM judge projection for {axis_name}-axis")
        return await compute_llm_judge_projection(all_messages, prompt)

    else:
        raise HTTPException(status_code=400, detail=f"Unknown method: {method}")


async def compute_embeddings_and_reduce(
    conversations: List[Dict[str, Any]],
    settings: VisualizationSettings
) -> VisualizationData:
    """Compute embeddings for all messages and reduce dimensionality based on settings."""

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

    # Determine if we need t-SNE
    n_dimensions = 3 if settings.dimensionMode == '3d' else 2
    axes_to_compute = ['x', 'y'] if settings.dimensionMode == '2d' else ['x', 'y', 'z']

    # Check if any axis uses t-SNE
    uses_tsne = any(settings.axes[axis].method == 'tsne' for axis in axes_to_compute)

    tsne_coords = None
    if uses_tsne:
        print(f"Computing t-SNE with {n_dimensions} dimensions...")
        perplexity = min(30, len(all_messages) - 1)
        tsne_coords = compute_tsne(
            embeddings_array,
            n_components=n_dimensions,
            perplexity=perplexity,
            random_state=42
        )

    # Compute coordinates for each axis
    coords = {}
    for axis in axes_to_compute:
        coords[axis] = await compute_axis_coordinates(
            embeddings_array,
            all_messages,
            settings.axes[axis],
            axis,
            tsne_coords
        )

    # Create message objects with coordinates
    messages = []
    for i, msg in enumerate(all_messages):
        message_data = {
            'text': msg['text'],
            'speaker': msg['speaker'],
            'conversation_id': msg['conversation_id'],
            'message_index': msg['message_index'],
            'x': float(coords['x'][i]),
            'y': float(coords['y'][i])
        }

        if settings.dimensionMode == '3d':
            message_data['z'] = float(coords['z'][i])

        messages.append(Message(**message_data))

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

    return VisualizationData(
        messages=messages,
        conversations=conversations_meta,
        dimensionMode=settings.dimensionMode
    )


@app.post("/api/visualize")
async def post_visualization(settings: VisualizationSettings, path: Optional[str] = None):
    """
    Get visualization data with embeddings and dimensionality reduction using custom settings.

    Args:
        settings: Visualization settings including dimension mode and axis configurations
        path: Optional custom conversation path pattern (defaults to CONVERSATION_PATH)
    """
    conversation_path = path if path else CONVERSATION_PATH

    try:
        conversations = await load_conversations(conversation_path)

        if not conversations:
            raise HTTPException(status_code=404, detail=f"No conversations found at {conversation_path}")

        print(f"Loaded {len(conversations)} conversations")
        print(f"Settings: {settings.dimensionMode} mode")

        visualization_data = await compute_embeddings_and_reduce(conversations, settings)

        return visualization_data

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/visualize")
async def get_visualization(method: str = "tsne", path: Optional[str] = None):
    """
    Get visualization data with embeddings and dimensionality reduction (legacy endpoint).

    Args:
        method: Dimensionality reduction method ('tsne' for now)
        path: Optional custom conversation path pattern (defaults to CONVERSATION_PATH)
    """
    # Convert to new settings format for backward compatibility
    settings = VisualizationSettings(
        dimensionMode='2d',
        axes={
            'x': AxisConfig(method='tsne', config={}),
            'y': AxisConfig(method='tsne', config={}),
            'z': AxisConfig(method='tsne', config={})
        }
    )

    return await post_visualization(settings, path)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)