'use client';

import { useEffect, useRef } from 'react';
import { useWarriorMessage } from '../contexts/WarriorMessageContext';
import { getWarriorMessage, WARRIOR_MESSAGES } from '../utils/warriorMessages';

interface UseWarriorsMinterMessagesProps {
  isFormComplete?: boolean;
  isMinting?: boolean;
  isActivating?: boolean;
  mintingSuccess?: boolean;
  mintingError?: boolean;
  activationSuccess?: boolean;
  imageUploaded?: boolean;
  aiGenerating?: boolean;
  aiSuccess?: boolean;
  promotionAvailable?: boolean;
  isPromoting?: boolean;
  promotionSuccess?: boolean;
  hasConnectionError?: boolean;
  isLoadingWarriors?: boolean;
  activeSection?: 'create' | 'manage' | 'ai';
}

export const useWarriorsMinterMessages = (props: UseWarriorsMinterMessagesProps) => {
  const { showMessage } = useWarriorMessage();
  const shownMessages = useRef<Set<string>>(new Set());

  // Helper function to show message only once
  const showMessageOnce = (id: string, text: string, duration: number = 3500) => {
    if (shownMessages.current.has(id)) {
      return; // Message already shown, skip
    }
    
    shownMessages.current.add(id);
    showMessage({ id, text, duration });
  };

  // Page load message - show once when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      showMessageOnce(
        'page_load',
        WARRIOR_MESSAGES.WARRIORS_MINTER.PAGE_LOAD[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.PAGE_LOAD.length)
        ],
        4000 // 4 seconds for welcome message
      );
    }, 1000); // Wait 1 second after component mounts

    return () => clearTimeout(timer);
  }, []); // Empty dependency array - only run once

  // Section switching messages - show once per section
  useEffect(() => {
    if (props.activeSection === 'manage') {
      showMessageOnce(
        'manage_warriors',
        WARRIOR_MESSAGES.WARRIORS_MINTER.MANAGE_WARRIORS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.MANAGE_WARRIORS.length)
        ],
        3500
      );
    }
  }, [props.activeSection]);

  // Form completion message - show once when form is complete
  useEffect(() => {
    if (props.isFormComplete) {
      showMessageOnce(
        'form_complete',
        WARRIOR_MESSAGES.WARRIORS_MINTER.FORM_COMPLETE[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.FORM_COMPLETE.length)
        ],
        3500
      );
    }
  }, [props.isFormComplete]);

  // Image upload success - show once when image is uploaded
  useEffect(() => {
    if (props.imageUploaded) {
      showMessageOnce(
        'image_success',
        WARRIOR_MESSAGES.WARRIORS_MINTER.IMAGE_UPLOAD_SUCCESS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.IMAGE_UPLOAD_SUCCESS.length)
        ],
        3500
      );
    }
  }, [props.imageUploaded]);

  // Minting process messages - show once per minting process
  useEffect(() => {
    if (props.isMinting) {
      showMessageOnce(
        'minting_start',
        WARRIOR_MESSAGES.WARRIORS_MINTER.MINTING_START[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.MINTING_START.length)
        ],
        4000
      );
    }
  }, [props.isMinting]);

  useEffect(() => {
    if (props.mintingSuccess) {
      showMessageOnce(
        'minting_success',
        WARRIOR_MESSAGES.WARRIORS_MINTER.MINTING_SUCCESS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.MINTING_SUCCESS.length)
        ],
        4000
      );
    }
  }, [props.mintingSuccess]);

  useEffect(() => {
    if (props.mintingError) {
      showMessageOnce(
        'minting_error',
        WARRIOR_MESSAGES.WARRIORS_MINTER.MINTING_ERROR[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.MINTING_ERROR.length)
        ],
        4000
      );
    }
  }, [props.mintingError]);

  // Activation process messages - show once per activation
  useEffect(() => {
    if (props.isActivating) {
      showMessageOnce(
        'activation_start',
        WARRIOR_MESSAGES.WARRIORS_MINTER.ACTIVATION_START[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.ACTIVATION_START.length)
        ],
        4000
      );
    }
  }, [props.isActivating]);

  useEffect(() => {
    if (props.activationSuccess) {
      showMessageOnce(
        'activation_success',
        WARRIOR_MESSAGES.WARRIORS_MINTER.ACTIVATION_SUCCESS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.ACTIVATION_SUCCESS.length)
        ],
        4000
      );
    }
  }, [props.activationSuccess]);

  // AI generation messages - show once per AI generation
  useEffect(() => {
    if (props.aiGenerating) {
      showMessageOnce(
        'ai_generation_start',
        WARRIOR_MESSAGES.WARRIORS_MINTER.AI_GENERATION_START[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.AI_GENERATION_START.length)
        ],
        4000
      );
    }
  }, [props.aiGenerating]);

  useEffect(() => {
    if (props.aiSuccess) {
      showMessageOnce(
        'ai_generation_success',
        WARRIOR_MESSAGES.WARRIORS_MINTER.AI_GENERATION_SUCCESS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.AI_GENERATION_SUCCESS.length)
        ],
        4000
      );
    }
  }, [props.aiSuccess]);

  // Promotion messages - show once per promotion event
  useEffect(() => {
    if (props.promotionAvailable) {
      showMessageOnce(
        'promotion_available',
        WARRIOR_MESSAGES.WARRIORS_MINTER.PROMOTION_AVAILABLE[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.PROMOTION_AVAILABLE.length)
        ],
        4000
      );
    }
  }, [props.promotionAvailable]);

  useEffect(() => {
    if (props.isPromoting) {
      showMessageOnce(
        'promotion_start',
        WARRIOR_MESSAGES.WARRIORS_MINTER.PROMOTION_START[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.PROMOTION_START.length)
        ],
        3500
      );
    }
  }, [props.isPromoting]);

  useEffect(() => {
    if (props.promotionSuccess) {
      showMessageOnce(
        'promotion_success',
        WARRIOR_MESSAGES.WARRIORS_MINTER.PROMOTION_SUCCESS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.PROMOTION_SUCCESS.length)
        ],
        4000
      );
    }
  }, [props.promotionSuccess]);

  // Loading and error states - show once per occurrence
  useEffect(() => {
    if (props.isLoadingWarriors) {
      showMessageOnce(
        'loading_warriors',
        WARRIOR_MESSAGES.WARRIORS_MINTER.LOADING_WARRIORS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.LOADING_WARRIORS.length)
        ],
        3500
      );
    }
  }, [props.isLoadingWarriors]);

  useEffect(() => {
    if (props.hasConnectionError) {
      showMessageOnce(
        'connection_error',
        WARRIOR_MESSAGES.WARRIORS_MINTER.CONNECTION_ERROR[
          Math.floor(Math.random() * WARRIOR_MESSAGES.WARRIORS_MINTER.CONNECTION_ERROR.length)
        ],
        4000
      );
    }
  }, [props.hasConnectionError]);

  return { showMessage };
};
