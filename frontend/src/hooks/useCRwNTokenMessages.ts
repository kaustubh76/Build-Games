import { useEffect } from 'react';
import { useWarriorMessage } from '../contexts/WarriorMessageContext';
import { WARRIOR_MESSAGES } from '../utils/warriorMessages';

interface UseCRwNTokenMessagesProps {
  isMinting?: boolean;
  mintSuccess?: boolean;
  isBurning?: boolean;
  burnSuccess?: boolean;
  transactionPending?: boolean;
  transactionConfirmed?: boolean;
  amount?: string;
  operation?: 'mint' | 'burn';
}

export const useCRwNTokenMessages = (props: UseCRwNTokenMessagesProps) => {
  const { showMessage } = useWarriorMessage();

  // Mint start messages
  useEffect(() => {
    if (props.isMinting && props.operation === 'mint') {
      showMessage({
        id: 'mint_start',
        text: WARRIOR_MESSAGES.CRWN_TOKEN.MINT_START[
          Math.floor(Math.random() * WARRIOR_MESSAGES.CRWN_TOKEN.MINT_START.length)
        ],
        duration: 4000
      });
    }
  }, [props.isMinting, props.operation, showMessage]);

  // Mint success messages
  useEffect(() => {
    if (props.mintSuccess && props.operation === 'mint') {
      showMessage({
        id: 'mint_success',
        text: WARRIOR_MESSAGES.CRWN_TOKEN.MINT_SUCCESS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.CRWN_TOKEN.MINT_SUCCESS.length)
        ],
        duration: 5000
      });
    }
  }, [props.mintSuccess, props.operation, showMessage]);

  // Burn start messages
  useEffect(() => {
    if (props.isBurning && props.operation === 'burn') {
      showMessage({
        id: 'burn_start',
        text: WARRIOR_MESSAGES.CRWN_TOKEN.BURN_START[
          Math.floor(Math.random() * WARRIOR_MESSAGES.CRWN_TOKEN.BURN_START.length)
        ],
        duration: 4000
      });
    }
  }, [props.isBurning, props.operation, showMessage]);

  // Burn success messages
  useEffect(() => {
    if (props.burnSuccess && props.operation === 'burn') {
      showMessage({
        id: 'burn_success',
        text: WARRIOR_MESSAGES.CRWN_TOKEN.BURN_SUCCESS[
          Math.floor(Math.random() * WARRIOR_MESSAGES.CRWN_TOKEN.BURN_SUCCESS.length)
        ],
        duration: 5000
      });
    }
  }, [props.burnSuccess, props.operation, showMessage]);

  // Transaction pending messages
  useEffect(() => {
    if (props.transactionPending) {
      showMessage({
        id: 'transaction_pending',
        text: WARRIOR_MESSAGES.CRWN_TOKEN.TRANSACTION_PENDING[
          Math.floor(Math.random() * WARRIOR_MESSAGES.CRWN_TOKEN.TRANSACTION_PENDING.length)
        ],
        duration: 4000
      });
    }
  }, [props.transactionPending, showMessage]);

  return { showMessage };
};
