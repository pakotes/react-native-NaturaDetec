import React, { createContext, useState, useContext } from 'react';

const PhotoContext = createContext<any>(null);

export const PhotoProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [photo, setPhoto] = useState(null);
  return (
    <PhotoContext.Provider value={{ photo, setPhoto }}>
      {children}
    </PhotoContext.Provider>
  );
};

export const usePhoto = () => useContext(PhotoContext);