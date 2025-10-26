"""Orchestrates pairwise conversations between multiple models."""
from itertools import combinations
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
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
    task_id: int,
    total: int,
    print_lock: Lock
) -> tuple[int, str]:
    """
    Run a single conversation between two models (thread worker function).

    Returns:
        Tuple of (task_id, json_path)
    """
    run_label = f" (run {run})" if run > 1 else ""

    with print_lock:
        print(f"[{task_id}/{total}] Starting: {model_a.name} → {model_b.name}{run_label}")

    conversation = run_conversation(
        model_a, model_b, initial_message, max_turns,
        end_codeword, output_dir, run, print_lock
    )
    json_path, _ = export_conversation(conversation, output_dir, run)

    with print_lock:
        print(f"[{task_id}/{total}] Completed: {model_a.name} → {model_b.name}{run_label}")
        print(f"  Saved: {json_path}\n")

    return task_id, json_path


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
    total = len(pairs) * 2 * conversations_per_pair  # Each pair runs twice (A starts, then B starts) × runs
    print(f"\n[INFO] Running {total} conversations in parallel ({len(pairs)} pairs × 2 directions × {conversations_per_pair} runs)")
    print(f"[INFO] Models: {[m.name for m in models]}")
    print(f"[INFO] Max parallel workers: {max_workers or 'auto'}\n")

    # Create all tasks
    tasks = []
    task_id = 0
    for model_a, model_b in pairs:
        for run in range(1, conversations_per_pair + 1):
            # Direction 1: A starts
            task_id += 1
            tasks.append((task_id, model_a, model_b, run))

            # Direction 2: B starts
            task_id += 1
            tasks.append((task_id, model_b, model_a, run))

    # Run all conversations in parallel
    print_lock = Lock()
    completed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        futures = {
            executor.submit(
                _run_single_conversation,
                model_a, model_b, initial_message, max_turns,
                end_codeword, output_dir, run, tid, total, print_lock
            ): tid
            for tid, model_a, model_b, run in tasks
        }

        # Wait for completion
        for future in as_completed(futures):
            try:
                tid, json_path = future.result()
                completed += 1
            except Exception as e:
                tid = futures[future]
                with print_lock:
                    print(f"[{tid}/{total}] ERROR: {str(e)}\n")

    print(f"[INFO] Done! Completed {completed}/{total} conversations. Check '{output_dir}/' for results")
