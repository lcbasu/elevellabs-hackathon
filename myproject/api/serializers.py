from rest_framework import serializers

class EchoSerializer(serializers.Serializer):
    query = serializers.CharField()
