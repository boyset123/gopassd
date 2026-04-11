import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import io, { Socket } from 'socket.io-client';
import { API_URL } from './api'; // Assuming your API_URL is configured for the backend

interface SocketProviderProps {
  children: ReactNode;
}

const SocketContext = createContext<Socket | null>(null);

export const useSocket = () => {
  return useContext(SocketContext);
};

const socket = io(API_URL.replace('/api', ''), { // Connect to the base URL
  transports: ['websocket'], // Force websocket connection
});

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from Socket.IO server');
    });

    // Clean up the connection when the component unmounts
    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
