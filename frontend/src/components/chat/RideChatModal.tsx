import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { rideService } from '../../services/rideService';
import type { RideMessage } from '../../types';
import { Send, MessageSquare, Check, CheckCheck, X } from 'lucide-react';

interface RideChatModalProps {
  rideId: string;
  recipientName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const RideChatModal: React.FC<RideChatModalProps> = ({
  rideId,
  recipientName,
  isOpen,
  onClose
}) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState<RideMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen || !rideId) return;

    // Cargar historial previo de mensajes
    rideService.getRideMessages(rideId).then((data) => {
      setMessages(data);
      // Marcar como leídos
      rideService.markMessagesAsRead(rideId);
    });

    if (!socket) return;

    // Escuchar mensajes entrantes en tiempo real
    const handleNewMessage = (msg: RideMessage) => {
      if (msg.rideId === rideId) {
        setMessages((prev) => [...prev, msg]);
        if (msg.senderId !== user?.id) {
          socket.emit('chat:read_receipt', { rideId });
        }
      }
    };

    // Escuchar indicador de escritura (REQ-07)
    const handleTyping = (data: { userId: string; isTyping: boolean }) => {
      if (data.userId !== user?.id) {
        setIsOtherTyping(data.isTyping);
      }
    };

    // Escuchar acuse de lectura (REQ-08)
    const handleRead = (data: { readerId: string; rideId: string; readAt: string }) => {
      if (data.rideId === rideId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === user?.id ? { ...m, isRead: true, readAt: data.readAt } : m
          )
        );
      }
    };

    socket.on('chat:new_message', handleNewMessage);
    socket.on('chat:user_typing', handleTyping);
    socket.on('chat:messages_read', handleRead);

    return () => {
      socket.off('chat:new_message', handleNewMessage);
      socket.off('chat:user_typing', handleTyping);
      socket.off('chat:messages_read', handleRead);
    };
  }, [isOpen, rideId, socket, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOtherTyping]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    if (!socket) return;

    socket.emit('chat:typing', { rideId, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:typing', { rideId, isTyping: false });
    }, 1500);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    socket.emit('chat:send_message', {
      rideId,
      content: inputText.trim()
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('chat:typing', { rideId, isTyping: false });

    setInputText('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md h-[550px] shadow-2xl flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-400 text-slate-900 rounded-full">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base">{recipientName}</h3>
              <p className="text-xs text-slate-300">Chat en viaje en curso</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50">
          {messages.length === 0 ? (
            <div className="text-center text-sm text-slate-400 py-12">
              No hay mensajes aún. Inicia la conversación.
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderId === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      isMine
                        ? 'bg-amber-400 text-slate-950 rounded-br-none'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                    }`}
                  >
                    <p>{msg.content}</p>
                    <div
                      className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                        isMine ? 'text-slate-700' : 'text-slate-400'
                      }`}
                    >
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {isMine && (
                        <span>
                          {msg.isRead ? (
                            <CheckCheck className="w-3.5 h-3.5 text-blue-600" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-slate-500" />
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {isOtherTyping && (
            <div className="text-xs text-slate-500 italic flex items-center gap-1.5 animate-pulse">
              <span>{recipientName} está escribiendo...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Footer */}
        <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder="Escribe un mensaje..."
            className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="bg-amber-400 text-slate-950 p-2.5 rounded-xl hover:bg-amber-500 disabled:opacity-40 transition"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
};
