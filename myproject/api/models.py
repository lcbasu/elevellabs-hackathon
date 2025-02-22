from django.db import models

# Create your models here.
from django.db import models

class TextEmbedding(models.Model):
    text_id = models.CharField(max_length=255, unique=True)  # Unique ID for text
    timestamp = models.IntegerField()  # Timestamp of the text start
    duration = models.FloatField()  # Duration in seconds
    text = models.TextField()  # Actual text content
    embedding = models.JSONField()  # Stores embedding as JSON

    def __str__(self):
        return f"{self.text_id} - {self.text[:50]}"

