import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

type Group = {
  id: string;
  label: string;
  icon: string;
  color: string;
  ancestor_ids: number[];
};

type GroupsContextType = {
  groups: Group[];
  loading: boolean;
  error: string | null;
};

const GroupsContext = createContext<GroupsContextType>({
  groups: [],
  loading: true,
  error: null,
});

export const useGroups = () => useContext(GroupsContext);

export const GroupsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/groups`)
      .then(res => res.json())
      .then(data => {
        setGroups(data.groups || []);
        setLoading(false);
      })
      .catch(err => {
        setError('Erro ao carregar os grupos');
        setLoading(false);
      });
  }, []);

  return (
    <GroupsContext.Provider value={{ groups, loading, error }}>
      {children}
    </GroupsContext.Provider>
  );
};