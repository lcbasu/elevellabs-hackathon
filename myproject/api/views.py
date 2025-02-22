# Create your views here.

import os
import uuid
from urllib.parse import unquote

import numpy as np
import requests
from django.http import JsonResponse, FileResponse, HttpResponse
from django.views import View
from mistralai import Mistral
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from sklearn.metrics.pairwise import cosine_similarity

from .models import TextEmbedding
from .serializers import EchoSerializer
from .utils import process_transcript, generate_text_id  # Import utility function

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = "9BWtsMINqrJLrRacOk9x"  # Replace with the desired voice ID
CACHE_DIR = "cached_audio"
# Ensure cache directory exists
os.makedirs(CACHE_DIR, exist_ok=True)
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY")
client = Mistral(api_key=MISTRAL_API_KEY)

TRANSCRIPT_FILE = os.path.join(os.path.dirname(__file__), "transcript.json")

class EchoView(APIView):
    def post(self, request, *args, **kwargs):
        serializer = EchoSerializer(data=request.data)
        if serializer.is_valid():
            # Extract the query text
            query_text = serializer.validated_data['query']
            # Return the same text back
            return Response({'query': query_text}, status=status.HTTP_200_OK)
        else:
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class GenerateEmbeddingsView(APIView):
    def post(self, request):
        transcript_data = process_transcript()

        new_texts = []
        for text_data in transcript_data:
            text_id = text_data.get("text_id")
            if not TextEmbedding.objects.filter(text_id=text_id).exists():
                new_texts.append(text_data)

        if not new_texts:
            return Response({"message": "All texts are already embedded."}, status=status.HTTP_200_OK)

        # Generate embeddings
        texts_to_embed = [text_data["text"] for text_data in new_texts]
        response = client.embeddings.create(model="mistral-embed", inputs=texts_to_embed)

        # Save embeddings to database
        for i, text_data in enumerate(new_texts):
            TextEmbedding.objects.create(
                text_id=text_data["text_id"],
                timestamp=text_data["timestamp"],
                duration=text_data["duration"],
                text=text_data["text"],
                embedding=response.data[i].embedding,
            )

        return Response({"message": f"Added {len(new_texts)} new embeddings."}, status=status.HTTP_201_CREATED)

class QueryEmbeddingView(APIView):
    def post(self, request):
        query_text = request.data.get("query", "")

        if not query_text:
            return Response({"error": "Query text is required"}, status=status.HTTP_400_BAD_REQUEST)

        # Generate embedding for query text
        response = client.embeddings.create(model="mistral-embed", inputs=[query_text])
        query_embedding = np.array(response.data[0].embedding).reshape(1, -1)

        # Retrieve stored embeddings
        stored_texts = TextEmbedding.objects.all()
        if not stored_texts:
            return Response({"error": "No stored embeddings found. Generate embeddings first."}, status=status.HTTP_400_BAD_REQUEST)

        # Compute cosine similarities
        texts = [obj.text for obj in stored_texts]
        embeddings = np.array([obj.embedding for obj in stored_texts])
        similarities = cosine_similarity(query_embedding, embeddings)[0]

        # Find best match
        best_match_index = int(np.argmax(similarities))
        best_match = stored_texts[best_match_index]

        return Response(
            {
                "query": query_text,
                "best_match": {
                    "id": best_match.text_id,
                    "timestamp": best_match.timestamp,
                    "duration": best_match.duration,
                    "text": best_match.text,
                },
                "confidence": round(float(similarities[best_match_index]), 2),
            },
            status=status.HTTP_200_OK,
        )

class TranscriptView(APIView):
    def get(self, request):
        transcript_data = process_transcript()

        return Response(transcript_data, status=status.HTTP_200_OK)

class TextToSpeechView(View):
    def get(self, request):

        raw_text = request.GET.get("text", "")
        if not raw_text:
            return JsonResponse({"error": "Text query parameter is required"}, status=400)

        text = unquote(raw_text)  # Decode URL-encoded text

        text_id = generate_text_id(text)
        # text_id = str(uuid.uuid4())  # Generate a random UUID
        audio_path = os.path.join(CACHE_DIR, f"{text_id}.mp3")

        # Return cached file if it exists
        if os.path.exists(audio_path):
            return FileResponse(open(audio_path, "rb"), content_type="audio/mpeg")

        # Call ElevenLabs API
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128"
        headers = {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
        }
        payload = {"text": text}

        tts_response = requests.post(url, headers=headers, json=payload)
        if tts_response.status_code == 200:
            # Save audio file
            with open(audio_path, "wb") as f:
                f.write(tts_response.content)

            # Return audio file as response
            with open(audio_path, "rb") as audio_file:
                response = HttpResponse(audio_file.read(), content_type="audio/mpeg")
                response["Content-Disposition"] = f'inline; filename="{text_id}.mp3"'
                return response

        return JsonResponse({"error": "Failed to generate audio"}, status=500)
