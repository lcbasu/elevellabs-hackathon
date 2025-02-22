"use client";

import {useRef, useState} from "react";
import styles from "./page.module.css";
import axios from "axios";
import {getAudioFromDB, storeAudioInDB} from "./indexedDB";

export default function Home() {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [currentTextId, setCurrentTextId] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);

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
        if (currentAudio) {
          currentAudio.pause();
        }
      } else {
        videoRef.current.play();
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

    console.log("Current Time: ", currentTime);
    console.log("Segment: ", segment);

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
