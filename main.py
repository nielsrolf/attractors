#!/usr/bin/env python3
"""Main entry point for running LLM pairwise conversations."""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from models import ModelConfig
from orchestrator import run_all_pairwise

from dotenv import load_dotenv

load_dotenv(override=True)


def main():
    if len(sys.argv) < 2:
        print("Usage: python main.py <config.json>")
        sys.exit(1)

    # Load config
    with open(sys.argv[1]) as f:
        config = json.load(f)

    # Create model configs
    models = [
        ModelConfig(
            name=m["name"],
            model_id=m["model_id"],
            system_prompt=m["system_prompt"],
            temperature=m.get("temperature", 0.7),
            max_tokens=m.get("max_tokens")
        )
        for m in config["models"]
    ]

    # Run conversations
    run_all_pairwise(
        models=models,
        initial_message=config["initial_message"],
        max_turns=config.get("max_turns", 10),
        output_dir=config.get("output_dir", "conversations"),
        end_codeword=config.get("end_codeword")
    )


if __name__ == "__main__":
    main()
