from django.shortcuts import render

# Create your views here.

from rest_framework import generics

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .serializers import EchoSerializer


import os
import json
import numpy as np
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from sklearn.metrics.pairwise import cosine_similarity
from mistralai import Mistral
from .models import TextEmbedding
from .serializers import TextEmbeddingSerializer

# Set up Mistral API Key
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
        if not os.path.exists(TRANSCRIPT_FILE):
            return Response({"error": "transcript.json file not found"}, status=status.HTTP_404_NOT_FOUND)

        with open(TRANSCRIPT_FILE, "r") as f:
            transcript_data = json.load(f)

        new_texts = []
        for text_data in transcript_data:
            text_id = text_data.get("id")
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
                text_id=text_data["id"],
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
        # Load transcript.json
        if not os.path.exists(TRANSCRIPT_FILE):
            return Response({"error": "transcript.json file not found"}, status=status.HTTP_404_NOT_FOUND)

        with open(TRANSCRIPT_FILE, "r") as f:
            transcript_data = json.load(f)

        return Response(transcript_data, status=status.HTTP_200_OK)
