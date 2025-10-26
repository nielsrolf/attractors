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
    end_codeword: str = None,
    conversations_per_pair: int = 1
):
    """
    Run conversations for all pairwise combinations of models.

    Args:
        models: List of model configurations
        initial_message: Initial message to start conversations
        max_turns: Maximum turns per conversation
        output_dir: Directory to save conversations
        end_codeword: Optional codeword to end conversations early
        conversations_per_pair: Number of conversations to run per pair
    """
    if len(models) < 2:
        raise ValueError("Need at least 2 models")

    pairs = list(combinations(models, 2))
    total = len(pairs) * 2 * conversations_per_pair  # Each pair runs twice (A starts, then B starts) × runs
    print(f"\n[INFO] Running {total} conversations ({len(pairs)} pairs × 2 directions × {conversations_per_pair} runs)")
    print(f"[INFO] Models: {[m.name for m in models]}\n")

    count = 0
    for model_a, model_b in pairs:
        for run in range(1, conversations_per_pair + 1):
            run_label = f" (run {run}/{conversations_per_pair})" if conversations_per_pair > 1 else ""

            # Direction 1: A starts
            count += 1
            print(f"[{count}/{total}] {model_a.name} → {model_b.name}{run_label}")
            conversation = run_conversation(model_a, model_b, initial_message, max_turns, end_codeword, output_dir, run)
            json_path, _ = export_conversation(conversation, output_dir, run)
            print(f"  Saved: {json_path}\n")

            # Direction 2: B starts
            count += 1
            print(f"[{count}/{total}] {model_b.name} → {model_a.name}{run_label}")
            conversation = run_conversation(model_b, model_a, initial_message, max_turns, end_codeword, output_dir, run)
            json_path, _ = export_conversation(conversation, output_dir, run)
            print(f"  Saved: {json_path}\n")

    print(f"[INFO] Done! Check '{output_dir}/' for results")
