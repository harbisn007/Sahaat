import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface UserContextType {
  username: string | null;
  isLoading: boolean;
  setUsername: (name: string) => Promise<void>;
  clearUsername: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@sahaat_muhawara:username";

export function UserProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUsername();
  }, []);

  const loadUsername = async () => {
    try {
      const stored = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (stored) {
        setUsernameState(stored);
      }
    } catch (error) {
      console.error("Failed to load username:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const setUsername = async (name: string) => {
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      setUsernameState(name);
    } catch (error) {
      console.error("Failed to save username:", error);
      throw error;
    }
  };

  const clearUsername = async () => {
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
      setUsernameState(null);
    } catch (error) {
      console.error("Failed to clear username:", error);
      throw error;
    }
  };

  return (
    <UserContext.Provider value={{ username, isLoading, setUsername, clearUsername }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
