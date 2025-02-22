"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import styles from "./page.module.css";

export default function Home() {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const toggleVideo = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {/* Video Component */}
        <div className={styles.videoContainer}>
          <video ref={videoRef} className={styles.video} width="640" height="360">
            <source src="/testing.mp4" type="video/mp4" />
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
