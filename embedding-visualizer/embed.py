from typing import Optional
from cache_on_disk import DCache
import os
import openai
import tiktoken


_embedding_cache = DCache(cache_dir=os.path.expanduser("~/.cache/embeddings"))
client = openai.AsyncOpenAI()


def  truncate(text, max_tokens=8192):
    enc = tiktoken.encoding_for_model("gpt-4o")  # or the model you’re targeting
    tokens = enc.encode(text)
    truncated = tokens[:max_tokens]
    return enc.decode(truncated)


@_embedding_cache
async def get_embedding(text: str, model: str = "text-embedding-3-small"):
    """Synchronous wrapper for OpenAI embeddings API with caching."""
    response = await client.embeddings.create(
        model=model,
        input=truncate(text)
    )
    return response.data[0].embedding
