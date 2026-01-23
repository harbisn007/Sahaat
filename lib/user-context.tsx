import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface UserContextType {
  username: string | null;
  userId: number;
  isLoading: boolean;
  setUsername: (name: string) => Promise<void>;
  clearUsername: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@sahaat_muhawara:username";
const USER_ID_STORAGE_KEY = "@sahaat_muhawara:userId";

export function UserProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [userId, setUserIdState] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (storedUsername) {
        setUsernameState(storedUsername);
      }

      let storedUserId = await AsyncStorage.getItem(USER_ID_STORAGE_KEY);
      if (storedUserId) {
        setUserIdState(Number(storedUserId));
      } else {
        // Generate a new userId if not exists
        const newUserId = Math.floor(Math.random() * 1000000);
        await AsyncStorage.setItem(USER_ID_STORAGE_KEY, String(newUserId));
        setUserIdState(newUserId);
      }
    } catch (error) {
      console.error("Failed to load user data:", error);
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
      // Note: We keep userId even after logout
      setUsernameState(null);
    } catch (error) {
      console.error("Failed to clear username:", error);
      throw error;
    }
  };

  return (
    <UserContext.Provider value={{ username, userId, isLoading, setUsername, clearUsername }}>
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
