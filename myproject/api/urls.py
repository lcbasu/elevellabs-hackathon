"""
URL configuration for myproject project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.urls import path

from .views import EchoView, QueryEmbeddingView, GenerateEmbeddingsView, TranscriptView, TextToSpeechView

urlpatterns = [
    path('echo/', EchoView.as_view(), name='echo'),
    path("generate/", GenerateEmbeddingsView.as_view(), name="generate_embeddings"),
    path("query/", QueryEmbeddingView.as_view(), name="query_embedding"),
    path("transcript/", TranscriptView.as_view(), name="get_transcript"),  # New API
    path("tts/", TextToSpeechView.as_view(), name="tts"),
]