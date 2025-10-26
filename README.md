# LLM Attractors

A Python system for orchestrating pairwise conversations between multiple language models using OpenRouter.

## Features

- **Pairwise Conversations**: Automatically creates conversations between all possible pairs of configured language models
- **OpenRouter Integration**: Uses OpenRouter API to access multiple LLM providers
- **Flexible Configuration**: Configure models with custom system prompts, temperatures, and other parameters
- **Export Formats**: Saves conversations in both JSON (structured data) and Markdown (human-readable) formats
- **Extensible Architecture**: Designed for future extensions like tools, custom termination conditions, and more

## Installation

1. Install Python dependencies:

```bash
pip install -r requirements.txt
```

2. Set up your OpenRouter API key in `.env`:

```bash
OPENROUTER_API_KEY=your_api_key_here
```

Get your API key from [OpenRouter](https://openrouter.ai/).

## Usage

### Basic Usage

1. Create a configuration file (or use `config.example.json` as a template):

```json
{
  "initial_message": "Hello! What are your thoughts on the nature of consciousness?",
  "max_turns": 6,
  "output_dir": "conversations",
  "models": [
    {
      "name": "Claude",
      "model_id": "anthropic/claude-3.5-sonnet",
      "system_prompt": "You are Claude, an AI assistant created by Anthropic.",
      "temperature": 0.7
    },
    {
      "name": "GPT-4",
      "model_id": "openai/gpt-4-turbo",
      "system_prompt": "You are a helpful AI assistant.",
      "temperature": 0.8
    }
  ]
}
```

2. Run the conversations:

```bash
python main.py config.example.json
```

### Configuration Options

#### Top-Level Options

- `initial_message` (required): The first message to start each conversation
- `max_turns` (optional, default: 10): Maximum number of turns per conversation
- `output_dir` (optional, default: "conversations"): Directory to save exported conversations
- `models` (required): Array of model configurations (minimum 2)

#### Model Configuration

Each model in the `models` array supports:

- `name` (required): Display name for the model
- `model_id` (required): OpenRouter model ID (e.g., "anthropic/claude-3.5-sonnet")
- `system_prompt` (required): System prompt for the model
- `temperature` (optional, default: 0.7): Sampling temperature
- `max_tokens` (optional): Maximum tokens to generate
- `top_p` (optional): Nucleus sampling parameter
- `frequency_penalty` (optional): Frequency penalty
- `presence_penalty` (optional): Presence penalty
- `stop_sequences` (optional): Array of stop sequences
- `metadata` (optional): Custom metadata dictionary

### Available Models

To see available models on OpenRouter, check [OpenRouter Models](https://openrouter.ai/models).

Popular options include:
- `anthropic/claude-3.5-sonnet`
- `openai/gpt-4-turbo`
- `google/gemini-pro`
- `meta-llama/llama-3-70b-instruct`
- `mistralai/mistral-large`

## Project Structure

```
attractors/
├── .env                    # Environment variables (API key)
├── requirements.txt        # Python dependencies
├── config.example.json     # Example configuration
├── main.py                 # Main entry point
├── src/
│   ├── __init__.py        # Package initialization
│   ├── models.py          # Data models
│   ├── openrouter_client.py  # OpenRouter API client
│   ├── conversation_manager.py  # Manages individual conversations
│   ├── exporters.py       # Export to JSON/Markdown
│   └── orchestrator.py    # Orchestrates pairwise conversations
└── conversations/          # Output directory (created automatically)
```

## Architecture

### Core Components

1. **ModelConfig**: Defines a language model with its parameters
2. **ConversationConfig**: Configures a conversation between two models
3. **Conversation**: Stores the conversation history and metadata
4. **OpenRouterClient**: Handles API calls to OpenRouter
5. **ConversationManager**: Manages a single conversation between two models
6. **ConversationOrchestrator**: Runs all pairwise conversations
7. **Exporters**: Export conversations to JSON and Markdown

### Extensibility Points

The architecture is designed for future extensions:

#### 1. Tools Support
```python
ModelConfig(
    name="Claude",
    model_id="anthropic/claude-3.5-sonnet",
    system_prompt="...",
    tools=[
        {
            "type": "function",
            "function": {
                "name": "search",
                "description": "Search the web",
                "parameters": {...}
            }
        }
    ]
)
```

#### 2. Termination Conditions
```python
ConversationConfig(
    model_a=model_a,
    model_b=model_b,
    initial_message="...",
    termination_conditions={
        "keywords": ["goodbye", "end conversation"],
        "max_message_length": 100,
        "sentiment_threshold": -0.5
    }
)
```

The `ConversationManager._should_terminate()` method can be extended to implement these conditions.

#### 3. Custom Callbacks

The orchestrator supports message callbacks for real-time monitoring:

```python
def custom_callback(speaker: str, role: str, content: str):
    # Custom logic (logging, analysis, etc.)
    pass

manager = ConversationManager(
    client=client,
    config=config,
    on_message_callback=custom_callback
)
```

## Output Formats

### JSON Format

Structured data with complete conversation information:

```json
{
  "config": {
    "model_a": {...},
    "model_b": {...},
    "initial_message": "...",
    "max_turns": 10
  },
  "messages": [
    {
      "role": "user",
      "content": "...",
      "timestamp": "2025-01-15T10:30:00",
      "metadata": {"speaker": "Claude"}
    }
  ],
  "started_at": "2025-01-15T10:30:00",
  "ended_at": "2025-01-15T10:35:00",
  "metadata": {}
}
```

### Markdown Format

Human-readable format with conversation flow:

```markdown
# Conversation: Claude ↔ GPT-4

**Started:** 2025-01-15 10:30:00
**Ended:** 2025-01-15 10:35:00
**Turns:** 5

## Model Configurations
...

## Conversation

### Message 1 - Claude (Initial)
*10:30:00*

Hello! What are your thoughts on consciousness?

---
```

## Example Use Cases

1. **Research**: Study how different LLMs approach similar problems
2. **Model Comparison**: Compare reasoning styles and outputs across models
3. **Conversation Dynamics**: Analyze how conversations evolve between different model pairs
4. **Emergent Behavior**: Discover interesting patterns in model-to-model interactions
5. **Prompt Engineering**: Test system prompts across different model combinations

## Future Enhancements

Planned features (structure already supports):
- [ ] Tool/function calling support
- [ ] Custom termination conditions (keywords, sentiment, topic detection)
- [ ] Conversation analysis and metrics
- [ ] Real-time streaming output
- [ ] Parallel conversation execution
- [ ] Conversation resumption from checkpoints
- [ ] Custom export formats (HTML, PDF)
- [ ] Web UI for monitoring conversations

## License

MIT License

## Contributing

Contributions welcome! The architecture is designed to be modular and extensible.
