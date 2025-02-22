from django.shortcuts import render

# Create your views here.

from rest_framework import generics

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .serializers import EchoSerializer

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
