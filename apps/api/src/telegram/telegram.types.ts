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
      type?: string;
      title?: string;
      username?: string;
    };
    from?: {
      id: number;
      is_bot?: boolean;
      first_name?: string;
      username?: string;
    };
    text?: string;
    caption?: string;
    voice?: {
      file_id: string;
      mime_type?: string;
      file_size?: number;
    };
    audio?: {
      file_id: string;
      mime_type?: string;
      file_name?: string;
      file_size?: number;
    };
  };
};

export type TelegramFile = {
  file_id: string;
  file_path?: string;
  file_size?: number;
};

export type TelegramDownloadedFile = {
  filePath: string;
  content: Buffer;
};

export type TelegramBotIdentity = {
  id: number;
  username?: string;
  first_name: string;
};

export type TelegramRuntimeStatus = {
  configured: boolean;
  authenticated: boolean;
  pollingEnabled: boolean;
  identity?: TelegramBotIdentity;
  details?: string;
};
