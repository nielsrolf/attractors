"""Manages conversations between two language models."""
import os
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime

from models import ModelConfig, Conversation

load_dotenv()


def run_conversation(
    model_a: ModelConfig,
    model_b: ModelConfig,
    initial_message: str,
    max_turns: int = 10
) -> Conversation:
    """
    Run a conversation between two models.

    Args:
        model_a: First model configuration
        model_b: Second model configuration
        initial_message: Initial message to start the conversation
        max_turns: Maximum number of turns

    Returns:
        Completed Conversation object
    """
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.getenv("OPENROUTER_API_KEY")
    )

    conversation = Conversation(
        model_a=model_a.name,
        model_b=model_b.name,
        initial_message=initial_message
    )

    # Track message history - we'll flip roles based on perspective
    history = [{"content": initial_message, "speaker": model_a.name}]

    conversation.messages.append({
        "role": "user",
        "content": initial_message,
        "speaker": model_a.name
    })

    # Alternate between models
    current_model = model_b
    other_model = model_a

    for turn in range(max_turns):
        try:
            # Build message history from current model's perspective
            # The other model's messages are "user", this model's messages are "assistant"
            messages = []
            for msg in history:
                if msg["speaker"] == current_model.name:
                    # This model's previous messages
                    messages.append({"role": "assistant", "content": msg["content"]})
                else:
                    # Other model's messages
                    messages.append({"role": "user", "content": msg["content"]})

            # Generate response
            response = client.chat.completions.create(
                model=current_model.model_id,
                messages=[
                    {"role": "system", "content": current_model.system_prompt},
                    *messages
                ],
                temperature=current_model.temperature,
                max_tokens=current_model.max_tokens
            )

            content = response.choices[0].message.content

            # Add to history
            history.append({"content": content, "speaker": current_model.name})
            conversation.messages.append({
                "role": "assistant",
                "content": content,
                "speaker": current_model.name
            })

            print(f"  [{current_model.name}] {content}")

            # Swap models
            current_model, other_model = other_model, current_model

        except Exception as e:
            print(f"  [ERROR] {str(e)}")
            break

    conversation.ended_at = datetime.now()
    return conversation
