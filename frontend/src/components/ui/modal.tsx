import * as React from "react";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

const Modal = ({ isOpen, onClose, children, className }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/80"
        onClick={onClose}
      />
      <div className={`relative bg-background rounded-lg shadow-lg max-w-lg w-full mx-4 ${className}`}>
        {children}
      </div>
    </div>
  );
};

export { Modal };
