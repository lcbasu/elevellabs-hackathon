"use client";

import {useEffect, useRef, useState} from "react";
import styles from "./page.module.css";
import axios from "axios";
import {getAudioFromDB, storeAudioInDB} from "./indexedDB";
import posthog from 'posthog-js'

posthog.init('phc_Fd0YRwxWRWZMeYFgfWQUC4tKT6xze3fvAx6j2sFK5zD',
  {
    api_host: 'https://us.i.posthog.com',
    person_profiles: 'identified_only' // or 'always' to create profiles for anonymous users as well
  }
)
const otherTexts = [
  {
    id: 'external',
    text: "I am so sorry. Let me share a way for you to meet someone from our sales team.",
  },
  {
    id: 'warmup',
    text: "Hi Lokesh, great to have you on the call today!",
  },
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

const CalendarModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
      }}
      onClick={onClose} // Close when clicking the overlay
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          width: '80%',
          maxWidth: '600px',
          height: '80%',
          maxHeight: '800px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
      >
        <iframe
          src="https://cal.com/lokesh-basu-hluoli" // Replace with your Cal.com URL
          style={{ width: '100%', height: '100%', border: 'none' }}
          title="Cal.com Scheduling"
        />
      </div>
    </div>
  );
};

export default function Home() {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState([]);
  const [currentTextId, setCurrentTextId] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const wsRef = useRef(null);
  let mediaRecorder = useRef(null);
  const ttsCache = useRef({}); // In-memory cache for TTS audio
  const otherAudioRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const activeSegmentRef = useRef(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [demoStarted, setDemoStarted] = useState(false);
  const [demoPaused, setDemoPaused] = useState(false);

  const DEEPGRAM_API_KEY = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY;

  const cacheAudioSequentially = async (transcriptData) => {
    for (const entry of transcriptData) {
      await cacheAudio(entry.text); // Call sequentially [Eleven labs limit]
    }
  };

  // Fetch transcript and cache audio
  const fetchTranscriptAndCacheAudio = async () => {
    try {
      const response = await axios.get("http://127.0.0.1:8000/api/transcript/");
      const transcriptData = response.data;
      setTranscript(transcriptData);

      // Preload and cache audio
      await cacheAudioSequentially(transcriptData); // Call the function sequentially

      // preload other tetxts as audio as well
      await cacheAudioSequentially(otherTexts);
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

  // Function to play TTS audio for a given segment.
  const playSegmentAudio = async (segment) => {
    console.log(`Playing segment ${segment.timestamp}: with playback rate of = ${videoRef.current.playbackRate}`
    );
    try {
      // For concurrent playback, do not pause video immediately.
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
      activeSegmentRef.current = segment;
      let audioDataUrl;
      const textId = await generateTextId(segment.text);
      const cachedAudio = await getAudioFromDB(textId);
      audioDataUrl = URL.createObjectURL(cachedAudio);
      console.log('audioDataUrl:', audioDataUrl);
      if (audioDataUrl) {
        ttsCache.current[segment.text] = audioDataUrl;
      } else if (ttsCache.current[segment.text]) {
        audioDataUrl = ttsCache.current[segment.text];
      } else {
        console.error(`No cached audio found for ID ${textId}`);
      }

      const ttsAudio = new Audio(audioDataUrl);
      ttsAudioRef.current = ttsAudio;

      ttsAudio.addEventListener("loadedmetadata", () => {
        const audioDuration = ttsAudio.duration;
        const newPlaybackRate = segment.duration / audioDuration;
        // console.log(
        //   `Segment at ${segment.timestamp}: TTS duration = ${audioDuration.toFixed(
        //     2
        //   )}, desired duration = ${segment.duration}, video playbackRate = ${newPlaybackRate.toFixed(2)}`
        // );
        videoRef.current.playbackRate = newPlaybackRate;
      });

      ttsAudio.play().catch((err) => {
        console.warn("TTS play error:", err);
      });
      videoRef.current.play().catch((err) => {
        console.warn("Video play error:", err);
      });
    } catch (error) {
      console.error("Error playing TTS:", error);
      videoRef.current.play().catch((err) => {
        console.warn("Video play error:", err);
      });
    }
  };

  // Effect: Monitor video playback and trigger TTS when reaching the next segment's timestamp.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !demoStarted) return;

    const handleTimeUpdate = () => {
      if (currentSegmentIndex < transcript.length) {
        const currentTime = video.currentTime;
        const nextSegment = transcript[currentSegmentIndex];
        if (currentTime >= nextSegment.timestamp) {
          console.log("Triggering segment at index:", currentSegmentIndex);
          playSegmentAudio(nextSegment);
          setCurrentSegmentIndex((prev) => prev + 1);
        }
      }
      if (
        activeSegmentRef.current &&
        video.currentTime >= activeSegmentRef.current.timestamp + activeSegmentRef.current.duration
      ) {
        video.playbackRate = 1;
        activeSegmentRef.current = null;
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [currentSegmentIndex, demoStarted, demoPaused]);

  const queryEmbeddings = async (queryText) => {
    if (otherAudioRef.current) {
      otherAudioRef.current.pause();
    }
    handlePauseDemo();
    console.log("Calling /api/query with user voice input: ", queryText);
    try {
      const response = await fetch("http://localhost:8000/api/query/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: queryText })
      })
      if (!response.ok) {
        console.error("Query error", response.statusText);
        return;
      }
      const data = await response.json();
      console.log("Query response:", data);
      // (Optional: Seek video to data.timestamp or process as needed)
      if (data) {
        let intent = ''
        if (data.confidence > 0.4) {
          // Process the query response here.
          // handleResumeDemo();
          switch (data.intent) {
            case 'external':
              intent = 'external';
              break;
            case 'pause':
              intent = 'pause';
              break;
            case 'resume':
              intent = 'resume_without_action';
              break;
            case 'new_section':
              intent = 'before_new_section_resumes';
              break;
            case 'go_back':
              intent = 'go_back';
              break;
            case 'some_action':
              intent = 'some_action';
              break;
            default:
              intent = 'before_new_section_resumes';
              break;
          }
        } else {
          // Handle low confidence or no response.
          intent = 'sorry';
        }

        // Process the query response here.
        console.log('intent: ', intent);
        const textObject = otherTexts.find((item) => item.id === intent);
        console.log('textObject:', textObject);
        if (textObject) {

          // Convert searchText to lower case for case-insensitive matching
          const lowerSearchText = data.best_match.text.toLowerCase();
          const index = transcript.findIndex(item => item.text.toLowerCase().includes(lowerSearchText));

          console.log('index:', index);

          let audioDataUrl;
          const textId = await generateTextId(textObject.text);
          const cachedAudio = await getAudioFromDB(textId);
          audioDataUrl = URL.createObjectURL(cachedAudio);
          console.log('audioDataUrl:', audioDataUrl);
          const otherTtsAudio = new Audio(audioDataUrl);
          otherAudioRef.current = otherTtsAudio;
          otherTtsAudio.play().catch((err) => {
            console.warn("TTS play error:", err);
          });
          otherTtsAudio.onended = () => {
            console.log("Audio playback has ended.");
            console.log('intent:', intent);
            // Execute your code here.
            // take some action based on the response
            switch (intent) {
              case 'external':
                console.log('external');
                openCalendarModal();
                break;
              case 'pause':
                // Already paused, So do not do anything. Just wait for next command.
                break;
              case 'resume_without_action':
                handleResumeDemo();
                break;
              case 'before_new_section_resumes':
                console.log('before_new_section_resumes');
                handleStartFromGivenSection(index);
                break;
              case 'some_action':
                console.log('some_action');
                break;
              case 'go_back':
                console.log('start from last section');
                handleStartFromGivenSection((currentSegmentIndex - 1) < 0 ? 0 : (currentSegmentIndex - 1));
                break;
              case 'sorry':
                console.log('sorry');
                break;
            }
          };
        } else {
          console.log("Go to the provided section.")
        }
      }
    } catch (error) {
      console.error("Error calling query API:", error);
      handleResumeDemo();
    }
  };

  // Function to start continuous voice capture using MediaRecorder.
  useEffect(() => {
    let mediaRecorder;
    let stream;
    if (demoStarted) {


// Step 1: Get microphone access with echo cancellation enabled
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true }
      })
        .then(s => {
          stream = s;
          const mediaRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm'});
          const deepgramSocket = new WebSocket(
            'wss://api.deepgram.com/v1/listen?utterances=true',
            ['token', DEEPGRAM_API_KEY]
          );

          deepgramSocket.onopen = () => {
            mediaRecorder.ondataavailable = (event) => {
              if (deepgramSocket.readyState === WebSocket.OPEN) {
                deepgramSocket.send(event.data);
              }
            };

            // Start recording and send data every 250ms (adjust as needed)
            mediaRecorder.start(250);
          };

          deepgramSocket.onmessage = (message) => {
            // Handle recognition results from Deepgram here
            // console.log('Deepgram message: ', message.data);
            const data = JSON.parse(message.data);
            // console.log('Deepgram data: ', data);
            const transcript = data.channel.alternatives[0].transcript;
            // console.log('Deepgram transcript: ', transcript);

            // Check for an endpoint/utterance end
            if (data.speech_final) {
              // A complete utterance has been detected.
              const finalTranscript = data.channel.alternatives[0].transcript;
              // console.log('Utterance ended:', finalTranscript);

              if (finalTranscript.length > 3) {
                // Send the final transcript to the server for processing.
                queryEmbeddings(finalTranscript);
              }

              // You can now trigger any logic based on the complete utterance,
              // for example, executing a command or clearing a transcript display.
            }
            // Otherwise, process interim results if needed.
            else {
              const interimTranscript = data.channel.alternatives[0].transcript;
              console.log('Interim transcript:', interimTranscript);
            }

          };

          deepgramSocket.onerror = (error) => {
            console.error('Deepgram WebSocket error: ', error);
          };
        })
        .catch(error => {
          console.error('Error accessing microphone:', error);
        });
    }
    return () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [demoStarted]);

  // Control panel handlers.
  const handleStartDemo = () => {
    //fetchTranscriptAndCacheAudio();
    setDemoStarted(true);
    setDemoPaused(false);
    setCurrentSegmentIndex(0);
    videoRef.current.currentTime = 0;
    videoRef.current.playbackRate = 1;
    if (ttsAudioRef.current) ttsAudioRef.current.pause();
    videoRef.current.play().catch((err) => console.warn("Video play error:", err));
  };

  const handleStopDemo = () => {
    setDemoStarted(false);
    setDemoPaused(false);
    setCurrentSegmentIndex(0);
    videoRef.current.pause();
    videoRef.current.currentTime = 0;
    videoRef.current.playbackRate = 1;
    if (ttsAudioRef.current) ttsAudioRef.current.pause();
  };

  const handlePauseDemo = () => {
    setDemoPaused(true);
    videoRef.current.pause();
    if (ttsAudioRef.current) ttsAudioRef.current.pause();
  };

  const handleResumeDemo = () => {
    setDemoPaused(false);
    videoRef.current.play().catch((err) => console.warn("Video play error:", err));
    if (ttsAudioRef.current) {
      ttsAudioRef.current.play().catch((err) => console.warn("TTS play error:", err));
    }
  };

  const handleStartFromBeginning = () => {
    setCurrentSegmentIndex(0);
    videoRef.current.currentTime = 0;
    if (demoPaused) handleResumeDemo();
  };

  const handleStartFromRandomSection = () => {
    const randomIndex = Math.floor(Math.random() * transcript.length);
    setCurrentSegmentIndex(randomIndex);
    videoRef.current.currentTime = transcript[randomIndex].timestamp;
    if (demoPaused) handleResumeDemo();
  };

  const handleStartFromGivenSection = (index) => {
    console.log('index:', index);
    setCurrentSegmentIndex(index);
    videoRef.current.currentTime = transcript[index].timestamp;
    if (demoPaused) handleResumeDemo();
  };

  const handleToggleDemo = async () => {
    if (!demoStarted) {
      // Optionally, preload the transcript and cache audio
      await fetchTranscriptAndCacheAudio();
      const textObject = otherTexts.find((item) => item.id === "warmup");
      console.log('textObject:', textObject);
      if (textObject) {
        // play the warmup
        let audioDataUrl;
        const textId = await generateTextId(textObject.text);
        const cachedAudio = await getAudioFromDB(textId);
        audioDataUrl = URL.createObjectURL(cachedAudio);
        console.log('audioDataUrl:', audioDataUrl);
        const warmupTtsAudio = new Audio(audioDataUrl);
        warmupTtsAudio.play().catch((err) => {
          console.warn("warmup TTS play error:", err);
        });
        warmupTtsAudio.onended = () => {
          console.log("Audio playback has ended.");
          setCurrentSegmentIndex(0);
          videoRef.current.currentTime = 0;
          videoRef.current.playbackRate = 1;
          if (ttsAudioRef.current) ttsAudioRef.current.pause();
          videoRef.current.play().catch((err) => console.warn("Video play error:", err));
          setDemoStarted(true);
        };
      } else {
        setCurrentSegmentIndex(0);
        videoRef.current.currentTime = 0;
        videoRef.current.playbackRate = 1;
        if (ttsAudioRef.current) ttsAudioRef.current.pause();
        videoRef.current.play().catch((err) => console.warn("Video play error:", err));
        setDemoStarted(true);
      }
    } else {
      if (demoPaused) {
        handleResumeDemo()
      } else {
        handlePauseDemo()
      }
      // setDemoStarted(false);
      // setCurrentSegmentIndex(0);
      // videoRef.current.pause();
      // videoRef.current.currentTime = 0;
      // videoRef.current.playbackRate = 1;
      // if (ttsAudioRef.current) ttsAudioRef.current.pause();
    }
  };


  const handleToggleMute = () => {
    console.log("Mute button clicked");
  };

  const handleNotes = () => {
    console.log("Notes button clicked");
  };

  const handleWarmupProceed = () => {
    console.log("Warmup proceed button clicked");
  };
  const [isMuted, setIsMuted] = useState(false);
  const [showWarmup, setShowWarmup] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);

  function openCalendarModal() {
    console.log("Opening Cal.com modal");
    setIsModalOpen(true);
  }

  const closeCalendarModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className={styles.container}>
      <div className={styles.videoWrapper}>
        <video
          ref={videoRef}
          className={styles.video}
          muted
        >
          <source src="/main.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      </div>
      <div className={styles.bottomBar}>
        <button className={styles.sideButton} onClick={handleToggleMute}>
          {isMuted ? "Unmute" : "Mute"}
        </button>
        <button className={styles.hangupButton} onClick={handleToggleDemo}>
          {!demoStarted ? "Call" : demoPaused ? "Resume" : "Pause"}
        </button>
        <button className={styles.sideButton} onClick={handleNotes}>
          Notes
        </button>
      </div>
      {showWarmup && (
        <div className={styles.warmupOverlay}>
          <div className={styles.warmupContent}>
            <h2>Welcome to the Mixpanel Demo</h2>
            <p>Please wait while we warm up.</p>
            <button className={styles.proceedButton} onClick={handleWarmupProceed}>
              Proceed
            </button>
          </div>
        </div>
      )}
      <CalendarModal isOpen={isModalOpen} onClose={closeCalendarModal} />
    </div>
  );
}
