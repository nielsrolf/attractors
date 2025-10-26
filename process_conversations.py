#!/usr/bin/env python3
"""
Process conversation JSON files and cut them off after the first message ending with [END].
"""

import json
import os
import sys
from pathlib import Path


def process_conversation(data):
    """
    Process a conversation dict and cut off messages after first [END].

    Args:
        data: Dictionary containing conversation data

    Returns:
        Modified dictionary with messages cut off after first [END]
    """
    if "messages" not in data:
        return data

    new_messages = []
    found_end = False

    for message in data["messages"]:
        new_messages.append(message)

        # Check if this message's content ends with [END]
        if "content" in message:
            content = message["content"].strip()
            if content.strip().endswith("[END]"):
                found_end = True
                break

    # Create new data dict with truncated messages
    result = data.copy()
    result["messages"] = new_messages

    return result


def process_folder(input_folder, output_folder):
    """
    Process all JSON files in input_folder and save to output_folder.

    Args:
        input_folder: Path to folder containing conversation JSON files
        output_folder: Path to folder where processed files will be saved
    """
    input_path = Path(input_folder)
    output_path = Path(output_folder)

    # Create output folder if it doesn't exist
    output_path.mkdir(parents=True, exist_ok=True)

    # Find all JSON files in input folder
    json_files = list(input_path.glob("*.json"))

    if not json_files:
        print(f"No JSON files found in {input_folder}")
        return

    print(f"Found {len(json_files)} JSON files to process")

    processed_count = 0
    error_count = 0

    for json_file in json_files:
        try:
            # Read the conversation file
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # Process the conversation
            processed_data = process_conversation(data)

            # Write to output folder with same filename
            output_file = output_path / json_file.name
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(processed_data, f, indent=2, ensure_ascii=False)

            original_msg_count = len(data.get("messages", []))
            new_msg_count = len(processed_data.get("messages", []))

            if original_msg_count != new_msg_count:
                print(f"✓ {json_file.name}: {original_msg_count} → {new_msg_count} messages")
            else:
                print(f"  {json_file.name}: no [END] found, kept all {original_msg_count} messages")

            processed_count += 1

        except Exception as e:
            print(f"✗ Error processing {json_file.name}: {e}")
            error_count += 1

    print(f"\nProcessed {processed_count} files successfully")
    if error_count > 0:
        print(f"Failed to process {error_count} files")


def main():
    """Main entry point."""
    if len(sys.argv) < 3:
        print("Usage: python process_conversations.py <input_folder> <output_folder>")
        print("\nExample:")
        print("  python process_conversations.py ./conversations ./conversations_processed")
        sys.exit(1)

    input_folder = sys.argv[1]
    output_folder = sys.argv[2]

    if not os.path.exists(input_folder):
        print(f"Error: Input folder '{input_folder}' does not exist")
        sys.exit(1)

    if not os.path.isdir(input_folder):
        print(f"Error: '{input_folder}' is not a directory")
        sys.exit(1)

    process_folder(input_folder, output_folder)


if __name__ == "__main__":
    main()
