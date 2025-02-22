from rest_framework import serializers
from .models import TextEmbedding

class EchoSerializer(serializers.Serializer):
    query = serializers.CharField()

class TextEmbeddingSerializer(serializers.ModelSerializer):
    class Meta:
        model = TextEmbedding
        fields = ["text_id", "timestamp", "duration", "text", "embedding"]