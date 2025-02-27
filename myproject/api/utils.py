import os
import json
import re
import hashlib

# Path to transcript.json file
TRANSCRIPT_FILE = os.path.join(os.path.dirname(__file__), "transcript.json")

# Function to convert timestamp (e.g., "0:00", "1:23", "10:45") to seconds
def timestamp_to_seconds(timestamp):
    parts = list(map(int, re.findall(r'\d+', timestamp)))  # Extract numbers
    if len(parts) == 2:  # Format: MM:SS
        minutes, seconds = parts
        return minutes * 60 + seconds
    elif len(parts) == 3:  # Format: HH:MM:SS
        hours, minutes, seconds = parts
        return hours * 3600 + minutes * 60 + seconds
    return 0  # Default case (shouldn't happen)


# Function to process transcript.json and return structured data
def process_transcript():
    if not os.path.exists(TRANSCRIPT_FILE):
        return {"error": "transcript.json file not found"}

    with open(TRANSCRIPT_FILE, "r") as f:
        transcript_data = json.load(f)

    # Ensure transcript_data is a list
    if not isinstance(transcript_data, list):
        transcript_data = [transcript_data]

    # text_id = generate_text_id(text)  # Generate a hash-based ID

    processed_data = []
    for i, entry in enumerate(transcript_data):
        text = entry["text"]
        text_id = generate_text_id(text)  # Generate a hash-based ID
        timestamp = timestamp_to_seconds(entry["timestamp"])

        # Compute duration
        if i < len(transcript_data) - 1:
            next_timestamp = timestamp_to_seconds(transcript_data[i + 1]["timestamp"])
            duration = next_timestamp - timestamp
        else:
            duration = 3  # Last entry duration

        processed_data.append({
            "text_id": text_id,
            "timestamp": timestamp,
            "duration": duration,
            "text": text
        })

    return processed_data

# Function to generate a unique hash ID based on text content
def generate_text_id(text):
    return hashlib.sha256(text.encode()).hexdigest()
