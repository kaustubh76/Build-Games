"use client";
import React, { useState } from "react";
import { FaGithub } from "react-icons/fa";

const Footer = () => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <footer className="arcade-footer-grey">
      <div className="footer-content">
        <div className="footer-title-red">
          Warriors AI-rena
        </div>
        <div className="footer-links">
          © {new Date().getFullYear()}
          <a
            href="https://github.com/yug49/WarriorsAI-rena"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            <FaGithub className="footer-icon" />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
