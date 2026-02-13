'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWarriorMessage } from '../contexts/WarriorMessageContext';
import { getWarriorMessage, getRandomMessage, WARRIOR_MESSAGES } from '../utils/warriorMessages';

const WarriorAssistant: React.FC = () => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState<string>('');
  const { currentMessage, isVisible } = useWarriorMessage();

  // Warrior idle animation frames
  const warriorFrames = [
    '/warrior/Warrior_Idle_1.png',
    '/warrior/Warrior_Idle_2.png',
    '/warrior/Warrior_Idle_3.png',
    '/warrior/Warrior_Idle_4.png',
    '/warrior/Warrior_Idle_5.png',
    '/warrior/Warrior_Idle_6.png',
  ];

  // Set welcome message once on component mount
  useEffect(() => {
    setWelcomeMessage(getRandomMessage(WARRIOR_MESSAGES.WELCOME));
  }, []);

  // Cycle through warrior frames for idle animation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % 6);
    }, 120); // Changed from 150ms to 120ms (20% faster)

    return () => clearInterval(interval);
  }, []);

  // Hide welcome message after 6 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, 6000);

    return () => clearTimeout(timer);
  }, []);

  // Display message (welcome or context message)
  const displayMessage = currentMessage && isVisible ? currentMessage.text : 
                        showWelcome ? welcomeMessage : null;

  return (
    <div className="warrior-assistant">
      {/* Warrior Model */}
      <motion.div
        className="warrior-container warrior-entrance"
        initial={{ opacity: 0, y: 50, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <img
          src={warriorFrames[currentFrame]}
          alt="Warrior Assistant"
          className="warrior-sprite"
        />
      </motion.div>

      {/* Speech Bubble */}
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            className="warrior-speech-bubble"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Speech Bubble */}
            <div className="speech-bubble-content">
              {/* Pixelated cloud effect background */}
              <div className="pixelated-cloud-overlay" />
              
              {/* Text content */}
              <motion.p 
                className="speech-bubble-text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                {displayMessage}
              </motion.p>

              {/* Speech bubble tail */}
              <div className="speech-bubble-tail">
                <div className="speech-bubble-tail-border">
                  <div className="speech-bubble-tail-fill"></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WarriorAssistant;
