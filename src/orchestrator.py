"""Orchestrates pairwise conversations between multiple models."""
from itertools import combinations
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from tqdm import tqdm
from models import ModelConfig
from conversation_manager import run_conversation
from exporters import export_conversation


def _run_single_conversation(
    model_a: ModelConfig,
    model_b: ModelConfig,
    initial_message: str,
    max_turns: int,
    end_codeword: str,
    output_dir: str,
    run: int,
    progress_callback
) -> str:
    """
    Run a single conversation between two models (thread worker function).

    Returns:
        json_path of saved conversation
    """
    conversation = run_conversation(
        model_a, model_b, initial_message, max_turns,
        end_codeword, output_dir, run, None, progress_callback
    )
    json_path, _ = export_conversation(conversation, output_dir, run)
    return json_path


def run_all_pairwise(
    models: list[ModelConfig],
    initial_message: str,
    max_turns: int = 10,
    output_dir: str = "conversations",
    end_codeword: str = None,
    conversations_per_pair: int = 1,
    max_workers: int = None
):
    """
    Run conversations for all pairwise combinations of models in parallel.

    Args:
        models: List of model configurations
        initial_message: Initial message to start conversations
        max_turns: Maximum turns per conversation
        output_dir: Directory to save conversations
        end_codeword: Optional codeword to end conversations early
        conversations_per_pair: Number of conversations to run per pair
        max_workers: Maximum number of parallel threads (None = auto)
    """
    if len(models) < 2:
        raise ValueError("Need at least 2 models")

    pairs = list(combinations(models, 2))
    num_conversations = len(pairs) * 2 * conversations_per_pair
    total_possible_messages = num_conversations * max_turns

    print(f"\n[INFO] Running {num_conversations} conversations in parallel")
    print(f"[INFO] {len(pairs)} pairs × 2 directions × {conversations_per_pair} runs")
    print(f"[INFO] Models: {[m.name for m in models]}")
    print(f"[INFO] Max parallel workers: {max_workers or 'auto'}")
    print(f"[INFO] Max possible messages: {total_possible_messages}\n")

    # Create all tasks
    tasks = []
    for model_a, model_b in pairs:
        for run in range(1, conversations_per_pair + 1):
            # Direction 1: A starts
            tasks.append((model_a, model_b, run))
            # Direction 2: B starts
            tasks.append((model_b, model_a, run))

    # Create progress bar
    progress_bar = tqdm(
        total=total_possible_messages,
        desc="Messages",
        unit="msg",
        ncols=80
    )

    # Thread-safe progress callback
    def update_progress():
        progress_bar.update(1)

    # Run all conversations in parallel
    completed_conversations = 0
    errors = []

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        futures = {
            executor.submit(
                _run_single_conversation,
                model_a, model_b, initial_message, max_turns,
                end_codeword, output_dir, run, update_progress
            ): (model_a.name, model_b.name, run)
            for model_a, model_b, run in tasks
        }

        # Wait for completion
        for future in as_completed(futures):
            try:
                json_path = future.result()
                completed_conversations += 1
            except Exception as e:
                model_a_name, model_b_name, run = futures[future]
                errors.append(f"{model_a_name} → {model_b_name} (run {run}): {str(e)}")

    progress_bar.close()

    print(f"\n[INFO] Done! Completed {completed_conversations}/{num_conversations} conversations.")
    if errors:
        print(f"[WARNING] {len(errors)} conversation(s) failed:")
        for error in errors:
            print(f"  - {error}")
    print(f"[INFO] Check '{output_dir}/' for results")
