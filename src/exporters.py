"""Export conversations to JSON and Markdown."""
import json
from pathlib import Path
from models import Conversation


def export_conversation(conversation: Conversation, output_dir: str = "conversations") -> tuple[str, str]:
    """
    Export a conversation to both JSON and Markdown.

    Args:
        conversation: The conversation to export
        output_dir: Directory to save files

    Returns:
        Tuple of (json_path, markdown_path)
    """
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    # Generate filename
    timestamp = conversation.started_at.strftime("%Y%m%d_%H%M%S")
    filename = f"{conversation.model_a}_vs_{conversation.model_b}_{timestamp}"

    # Export JSON
    json_path = output_path / f"{filename}.json"
    with open(json_path, 'w') as f:
        json.dump(conversation.to_dict(), f, indent=2)

    # Export Markdown
    md_path = output_path / f"{filename}.md"
    with open(md_path, 'w') as f:
        f.write(f"# {conversation.model_a} ↔ {conversation.model_b}\n\n")
        f.write(f"**Started:** {conversation.started_at.strftime('%Y-%m-%d %H:%M:%S')}\n")
        if conversation.ended_at:
            f.write(f"**Ended:** {conversation.ended_at.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"**Messages:** {len(conversation.messages)}\n\n")
        f.write("---\n\n")

        for msg in conversation.messages:
            speaker = msg.get("speaker", "Unknown")
            f.write(f"### {speaker}\n\n")
            f.write(f"{msg['content']}\n\n")
            f.write("---\n\n")

    return str(json_path), str(md_path)
