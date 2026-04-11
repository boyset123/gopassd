import React, { createContext, useContext, useState } from 'react';

type CreateModalContextType = {
  hasOngoingSubmission: boolean;
  setHasOngoingSubmission: (value: boolean) => void;
};

const CreateModalContext = createContext<CreateModalContextType | null>(null);

export function CreateModalProvider({ children }: { children: React.ReactNode }) {
  const [hasOngoingSubmission, setHasOngoingSubmission] = useState(false);

  const value: CreateModalContextType = {
    hasOngoingSubmission,
    setHasOngoingSubmission,
  };

  return (
    <CreateModalContext.Provider value={value}>
      {children}
    </CreateModalContext.Provider>
  );
}

export function useCreateModal() {
  const ctx = useContext(CreateModalContext);
  if (!ctx) throw new Error('useCreateModal must be used within CreateModalProvider');
  return ctx;
}

export function useCreateModalOptional() {
  return useContext(CreateModalContext);
}
