export type TelegramInboundMessage = {
  chatId: string;
  userId: string;
  text: string;
  requiresAudioReply?: boolean;
};

export type TelegramOutboundMessage = {
  text: string;
  isAudio?: boolean;
  filename?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: {
      id: number;
    };
    from?: {
      id: number;
    };
    text?: string;
  };
};
