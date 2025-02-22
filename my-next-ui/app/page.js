"use client";

import {useRef, useState} from "react";
import styles from "./page.module.css";
import axios from "axios";
import {getAudioFromDB, storeAudioInDB} from "./indexedDB";

const otherTexts = [
  {
    id: 'some_action',
    text: "Ok, I will do as you say.",
  },
  {
    id: 'pause',
    text: "Ok, I will pause and wait for you to complete.",
  },
  {
    id: 'before_new_section_resumes',
    text: "Alright. I will move to the desired section.",
  },
  {
    id: 'resume_without_action',
    text: "Cool. I will resume.",
  },
  {
    id: 'sorry',
    text: "I am so sorry. I could not understand you. Can you please repeat?",
  },
  {
    id: 'go_back',
    text: "Sure. I will start from last section.",
  },
  {
    id: 'go_to_start',
    text: "Sure. I will start from teh beginning.",
  },
]

export default function Home() {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [currentTextId, setCurrentTextId] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef(null);
  let mediaRecorder = useRef(null);

  const DEEPGRAM_API_KEY = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;

  const startListening = async () => {
    if (isListening) return;
    setIsListening(true);
    console.log("Listening...");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      mediaRecorder.current = new MediaRecorder(stream, { mimeType: "audio/webm" });

      wsRef.current = new WebSocket(`wss://api.deepgram.com/v1/listen`, ["token", DEEPGRAM_API_KEY]);

      wsRef.current.onopen = () => {
        console.log("Connected to Deepgram WebSocket");
        mediaRecorder.current.start(1000);
      };

      wsRef.current.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log("WebSocket message:", message);
        if (message.channel?.alternatives[0]?.transcript) {
          const transcript = message.channel.alternatives[0].transcript;
          console.log("actual user spoken message: ", transcript);
          queryEmbeddings(transcript)
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      mediaRecorder.current.ondataavailable = (event) => {
        console.log("Sending audio data...", event);
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        wsRef.current.close();
        setIsListening(false);
      };
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setIsListening(false);
    }
  };

  const queryEmbeddings = async (queryText) => {
    try {
      const response = await axios.post("http://127.0.0.1:8000/api/query/", {
        query: queryText,
      });
      console.log("Query embeddings response:", response);
      if (response.data) {
        console.log(response.data);
      }
    } catch (error) {
      console.error("Error querying embeddings:", error);
    }
  };

  const stopListening = () => {
    if (!isListening) return;
    setIsListening(false);
    mediaRecorder.current.stop();
  };

  const cacheAudioSequentially = async (transcriptData) => {
    for (const entry of transcriptData) {
      await cacheAudio(entry.text); // Call sequentially [Eleven labs limit]
    }
  };

  // Fetch transcript and cache audio
  const fetchTranscript = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:8000/api/transcript/");
      const transcriptData = response.data;
      setTranscript(transcriptData);

      // Preload and cache audio
      await cacheAudioSequentially(transcriptData); // Call the function sequentially

    } catch (error) {
      console.error("Error fetching transcript:", error);
    }
  };

  async function generateTextId(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer)); // Convert buffer to byte array
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join(""); // Convert bytes to hex string
    return hashHex;
  }

  // Cache audio in LocalStorage as Base64
  const cacheAudio = async (text) => {
    const textId = await generateTextId(text);
    const cachedAudio = await getAudioFromDB(textId);

    if (!cachedAudio) {
      try {
        const response = await axios.get(`http://127.0.0.1:8000/api/tts/`, {
          params: { text },
          responseType: "blob",
        });
        await storeAudioInDB(textId, response.data);
        console.log(`Audio cached in IndexedDB for textId: ${textId}`);
      } catch (error) {
        console.error(`Error fetching audio for ID ${textId}:`, error);
      }
    } else {
      console.log("Audio already cached for textId: " + textId);
    }
  };

  // Play cached audio
  const playAudio = async (text) => {
    const textId = await generateTextId(text);
    const cachedAudio = await getAudioFromDB(textId);
    if (cachedAudio) {
      const audioUrl = URL.createObjectURL(cachedAudio);
      const audio = new Audio(audioUrl);
      audio.play();
    } else {
      console.error(`No cached audio found for ID ${textId}`);
    }
  };

  const toggleVideo = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        stopListening();
        if (currentAudio) {
          currentAudio.pause();
        }
      } else {
        videoRef.current.play();
        startListening()
      }
      setIsPlaying(!isPlaying);
    }
  };


  const findTranscriptSegment = (currentTime) => {
    return transcript.find((entry) => {
      return currentTime >= entry.timestamp && currentTime < entry.timestamp + entry.duration;
    });
  };

  const playSegmentAudio = async (segment) => {
    if (!segment) return;

    console.log("Playing segment audio: ", segment);
    const textId = await generateTextId(segment.text);
    if (textId === currentTextId) return; // Prevent replaying the same audio

    const cachedAudio = await getAudioFromDB(textId);
    if (cachedAudio) {
      if (currentAudio) {
        currentAudio.pause();
      }

      setCurrentTextId(textId);

      const audioUrl = URL.createObjectURL(cachedAudio);
      const audio = new Audio(audioUrl);
      setCurrentAudio(audio);
      audio.onloadedmetadata = () => {
        const audioDuration = audio.duration || segment.duration; // Fallback if duration is unavailable
        if (videoRef.current) {
          const playbackRate = segment.duration / audioDuration;
          videoRef.current.playbackRate = playbackRate;
          console.log(`Setting playback rate: ${playbackRate}`);
        }
      };
      audio.play();
    } else {
      console.error(`No cached audio found for ID ${textId}`);
    }
  };

  const handleVideoUpdate = () => {
    if (!videoRef.current) return;

    const currentTime = videoRef.current.currentTime;
    const segment = findTranscriptSegment(currentTime);

    // console.log("Current Time: ", currentTime);
    // console.log("Segment: ", segment);

    if (segment) {
      playSegmentAudio(segment);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>

        <h1>Transcript & Text-to-Speech</h1>
        <button onClick={fetchTranscript} style={{marginBottom: "20px", padding: "10px"}}>
          Fetch Transcript & Cache Audio
        </button>

        <ul>
          {transcript.map((entry) => (
            <li key={entry.id} style={{marginBottom: "10px"}}>
              {entry.text}
              <button onClick={() => playAudio(entry.text)} style={{marginLeft: "10px"}}>
                ▶️ Play
              </button>
            </li>
          ))}
        </ul>

        {/* Video Component */}
        <div className={styles.videoContainer}>
          <video
            ref={videoRef}
            className={styles.video}
            width="640"
            height="360"
            muted
            onTimeUpdate={handleVideoUpdate} // Sync transcript on video progress
          >
            <source src="/main.mp4" type="video/mp4"/>
            Your browser does not support the video tag.
          </video>
        </div>

        {/* Button to Start/Pause Video */}
        <button className={styles.videoButton} onClick={toggleVideo}>
          {isPlaying ? "Pause" : "Start"}
        </button>
      </main>
    </div>
  );
}
