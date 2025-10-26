"""Data models for LLM conversations."""
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, List
from datetime import datetime


@dataclass
class ModelConfig:
    """Configuration for a language model."""
    name: str
    model_id: str  # OpenRouter model ID
    system_prompt: str
    temperature: float = 0.7
    max_tokens: Optional[int] = None


@dataclass
class Conversation:
    """A conversation between two models."""
    model_a: str  # Model name
    model_b: str  # Model name
    initial_message: str
    messages: List[Dict[str, str]] = field(default_factory=list)  # {role, content, speaker}
    started_at: datetime = field(default_factory=datetime.now)
    ended_at: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON export."""
        return {
            "model_a": self.model_a,
            "model_b": self.model_b,
            "initial_message": self.initial_message,
            "messages": self.messages,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None
        }
