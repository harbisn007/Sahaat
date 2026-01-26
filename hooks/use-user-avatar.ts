import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AVATAR_STORAGE_KEY = "@sahaat_muhawara:userAvatar";

export interface UserAvatar {
  type: "male" | "female" | "custom";
  customUri?: string | null;
}

export function useUserAvatar() {
  const [avatar, setAvatar] = useState<UserAvatar | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadAvatar();
  }, []);

  const loadAvatar = async () => {
    try {
      const stored = await AsyncStorage.getItem(AVATAR_STORAGE_KEY);
      if (stored) {
        setAvatar(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load avatar:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAvatar = async (newAvatar: UserAvatar) => {
    try {
      await AsyncStorage.setItem(AVATAR_STORAGE_KEY, JSON.stringify(newAvatar));
      setAvatar(newAvatar);
    } catch (error) {
      console.error("Failed to save avatar:", error);
      throw error;
    }
  };

  const clearAvatar = async () => {
    try {
      await AsyncStorage.removeItem(AVATAR_STORAGE_KEY);
      setAvatar(null);
    } catch (error) {
      console.error("Failed to clear avatar:", error);
      throw error;
    }
  };

  return { avatar, isLoading, saveAvatar, clearAvatar, loadAvatar };
}
