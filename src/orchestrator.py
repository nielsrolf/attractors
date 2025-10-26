"""Orchestrates pairwise conversations between multiple models."""
from itertools import combinations
from models import ModelConfig
from conversation_manager import run_conversation
from exporters import export_conversation


def run_all_pairwise(
    models: list[ModelConfig],
    initial_message: str,
    max_turns: int = 10,
    output_dir: str = "conversations",
    end_codeword: str = None
):
    """
    Run conversations for all pairwise combinations of models.

    Args:
        models: List of model configurations
        initial_message: Initial message to start conversations
        max_turns: Maximum turns per conversation
        output_dir: Directory to save conversations
    """
    if len(models) < 2:
        raise ValueError("Need at least 2 models")

    pairs = list(combinations(models, 2))
    total = len(pairs) * 2  # Each pair runs twice (A starts, then B starts)
    print(f"\n[INFO] Running {total} conversations ({len(pairs)} pairs × 2 directions)")
    print(f"[INFO] Models: {[m.name for m in models]}\n")

    count = 0
    for model_a, model_b in pairs:
        # Direction 1: A starts
        count += 1
        print(f"[{count}/{total}] {model_a.name} → {model_b.name}")
        conversation = run_conversation(model_a, model_b, initial_message, max_turns, end_codeword, output_dir)
        json_path, _ = export_conversation(conversation, output_dir)
        print(f"  Saved: {json_path}\n")

        # Direction 2: B starts
        count += 1
        print(f"[{count}/{total}] {model_b.name} → {model_a.name}")
        conversation = run_conversation(model_b, model_a, initial_message, max_turns, end_codeword, output_dir)
        json_path, _ = export_conversation(conversation, output_dir)
        print(f"  Saved: {json_path}\n")

    print(f"[INFO] Done! Check '{output_dir}/' for results")
