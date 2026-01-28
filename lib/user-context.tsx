import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { v4 as uuidv4 } from "uuid";

// Avatar types: 'male' | 'female' | custom URI
export type AvatarType = 'male' | 'female' | string;

// User account types
export type AccountType = 'guest' | 'google' | 'apple';

interface UserContextType {
  username: string | null;
  userId: string; // Changed from number to string (UUID)
  avatar: AvatarType | null;
  accountType: AccountType;
  googleId: string | null;
  appleId: string | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  setUsername: (name: string) => Promise<void>;
  setAvatar: (avatar: AvatarType) => Promise<void>;
  setUserData: (name: string, avatar: AvatarType) => Promise<void>;
  loginAsGuest: (name: string, avatar: AvatarType) => Promise<void>;
  loginWithGoogle: (googleId: string, name: string, avatar: AvatarType) => Promise<void>;
  loginWithApple: (appleId: string, name: string, avatar: AvatarType) => Promise<void>;
  logout: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const USER_STORAGE_KEY = "@sahaat_muhawara:username";
const USER_ID_STORAGE_KEY = "@sahaat_muhawara:userId";
const USER_AVATAR_STORAGE_KEY = "@sahaat_muhawara:avatar";
const USER_ACCOUNT_TYPE_KEY = "@sahaat_muhawara:accountType";
const USER_GOOGLE_ID_KEY = "@sahaat_muhawara:googleId";
const USER_APPLE_ID_KEY = "@sahaat_muhawara:appleId";

export function UserProvider({ children }: { children: ReactNode }) {
  const [username, setUsernameState] = useState<string | null>(null);
  const [userId, setUserIdState] = useState<string>("");
  const [avatar, setAvatarState] = useState<AvatarType | null>(null);
  const [accountType, setAccountTypeState] = useState<AccountType>("guest");
  const [googleId, setGoogleIdState] = useState<string | null>(null);
  const [appleId, setAppleIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const isLoggedIn = !!username && !!userId;

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const storedUsername = await AsyncStorage.getItem(USER_STORAGE_KEY);
      if (storedUsername) {
        setUsernameState(storedUsername);
      }

      const storedAvatar = await AsyncStorage.getItem(USER_AVATAR_STORAGE_KEY);
      if (storedAvatar) {
        setAvatarState(storedAvatar as AvatarType);
      }

      const storedAccountType = await AsyncStorage.getItem(USER_ACCOUNT_TYPE_KEY);
      if (storedAccountType) {
        setAccountTypeState(storedAccountType as AccountType);
      }

      const storedGoogleId = await AsyncStorage.getItem(USER_GOOGLE_ID_KEY);
      if (storedGoogleId) {
        setGoogleIdState(storedGoogleId);
      }

      const storedAppleId = await AsyncStorage.getItem(USER_APPLE_ID_KEY);
      if (storedAppleId) {
        setAppleIdState(storedAppleId);
      }

      // Load or generate UUID
      let storedUserId = await AsyncStorage.getItem(USER_ID_STORAGE_KEY);
      if (storedUserId) {
        setUserIdState(storedUserId);
      }
      // Note: For guests, userId is generated on login, not on app start
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

  const setAvatar = async (newAvatar: AvatarType) => {
    try {
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      setAvatarState(newAvatar);
    } catch (error) {
      console.error("Failed to save avatar:", error);
      throw error;
    }
  };

  const setUserData = async (name: string, newAvatar: AvatarType) => {
    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, name);
      await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
      setUsernameState(name);
      setAvatarState(newAvatar);
    } catch (error) {
      console.error("Failed to save user data:", error);
      throw error;
    }
  };

  const loginAsGuest = async (name: string, newAvatar: AvatarType) => {
    console.log("[UserContext] loginAsGuest called with:", { name, avatar: newAvatar });
    
    // Validate inputs
    if (!name || name.trim().length === 0) {
      throw new Error("الاسم مطلوب");
    }
    if (!newAvatar) {
      throw new Error("الصورة مطلوبة");
    }
    
    try {
      // Generate new UUID for guest
      let newUserId: string;
      try {
        newUserId = uuidv4();
        console.log("[UserContext] Generated UUID:", newUserId);
      } catch (uuidError) {
        console.error("[UserContext] UUID generation failed:", uuidError);
        // Fallback to timestamp-based ID
        newUserId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        console.log("[UserContext] Using fallback ID:", newUserId);
      }
      
      // Save to AsyncStorage with individual error handling
      console.log("[UserContext] Saving to AsyncStorage...");
      
      try {
        await AsyncStorage.setItem(USER_ID_STORAGE_KEY, newUserId);
        console.log("[UserContext] Saved userId");
      } catch (e) {
        console.error("[UserContext] Failed to save userId:", e);
        throw new Error("فشل حفظ معرف المستخدم");
      }
      
      try {
        await AsyncStorage.setItem(USER_STORAGE_KEY, name);
        console.log("[UserContext] Saved username");
      } catch (e) {
        console.error("[UserContext] Failed to save username:", e);
        throw new Error("فشل حفظ الاسم");
      }
      
      try {
        await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
        console.log("[UserContext] Saved avatar");
      } catch (e) {
        console.error("[UserContext] Failed to save avatar:", e);
        throw new Error("فشل حفظ الصورة");
      }
      
      try {
        await AsyncStorage.setItem(USER_ACCOUNT_TYPE_KEY, "guest");
        console.log("[UserContext] Saved accountType");
      } catch (e) {
        console.error("[UserContext] Failed to save accountType:", e);
        // Non-critical, continue
      }
      
      // Clear any existing Google/Apple IDs (non-critical)
      try {
        await AsyncStorage.removeItem(USER_GOOGLE_ID_KEY);
        await AsyncStorage.removeItem(USER_APPLE_ID_KEY);
      } catch (e) {
        console.warn("[UserContext] Failed to clear social IDs:", e);
      }
      
      // Update state
      setUserIdState(newUserId);
      setUsernameState(name);
      setAvatarState(newAvatar);
      setAccountTypeState("guest");
      setGoogleIdState(null);
      setAppleIdState(null);
      
      console.log("[UserContext] Logged in as guest successfully:", { userId: newUserId, name });
    } catch (error) {
      console.error("[UserContext] Failed to login as guest:", error);
      throw error;
    }
  };

  const loginWithGoogle = async (newGoogleId: string, name: string, newAvatar: AvatarType) => {
    console.log("[UserContext] loginWithGoogle called with:", { googleId: newGoogleId, name, avatar: newAvatar });
    
    // Validate inputs
    if (!name || name.trim().length === 0) {
      throw new Error("الاسم مطلوب");
    }
    if (!newAvatar) {
      throw new Error("الصورة مطلوبة");
    }
    if (!newGoogleId) {
      throw new Error("معرف Google مطلوب");
    }
    
    try {
      // For Google users, use googleId as the base for UUID (consistent across devices)
      const newUserId = `google_${newGoogleId}`;
      console.log("[UserContext] Generated Google userId:", newUserId);
      
      // Save to AsyncStorage with individual error handling
      console.log("[UserContext] Saving Google user to AsyncStorage...");
      
      try {
        await AsyncStorage.setItem(USER_ID_STORAGE_KEY, newUserId);
        console.log("[UserContext] Saved userId");
      } catch (e) {
        console.error("[UserContext] Failed to save userId:", e);
        throw new Error("فشل حفظ معرف المستخدم");
      }
      
      try {
        await AsyncStorage.setItem(USER_STORAGE_KEY, name);
        console.log("[UserContext] Saved username");
      } catch (e) {
        console.error("[UserContext] Failed to save username:", e);
        throw new Error("فشل حفظ الاسم");
      }
      
      try {
        await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
        console.log("[UserContext] Saved avatar");
      } catch (e) {
        console.error("[UserContext] Failed to save avatar:", e);
        throw new Error("فشل حفظ الصورة");
      }
      
      try {
        await AsyncStorage.setItem(USER_ACCOUNT_TYPE_KEY, "google");
        await AsyncStorage.setItem(USER_GOOGLE_ID_KEY, newGoogleId);
        console.log("[UserContext] Saved accountType and googleId");
      } catch (e) {
        console.error("[UserContext] Failed to save accountType/googleId:", e);
        // Non-critical, continue
      }
      
      // Clear Apple ID (non-critical)
      try {
        await AsyncStorage.removeItem(USER_APPLE_ID_KEY);
      } catch (e) {
        console.warn("[UserContext] Failed to clear Apple ID:", e);
      }
      
      // Update state
      setUserIdState(newUserId);
      setUsernameState(name);
      setAvatarState(newAvatar);
      setAccountTypeState("google");
      setGoogleIdState(newGoogleId);
      setAppleIdState(null);
      
      console.log("[UserContext] Logged in with Google successfully:", { userId: newUserId, name });
    } catch (error) {
      console.error("[UserContext] Failed to login with Google:", error);
      throw error;
    }
  };

  const loginWithApple = async (newAppleId: string, name: string, newAvatar: AvatarType) => {
    console.log("[UserContext] loginWithApple called with:", { appleId: newAppleId, name, avatar: newAvatar });
    
    // Validate inputs
    if (!name || name.trim().length === 0) {
      throw new Error("الاسم مطلوب");
    }
    if (!newAvatar) {
      throw new Error("الصورة مطلوبة");
    }
    if (!newAppleId) {
      throw new Error("معرف Apple مطلوب");
    }
    
    try {
      // For Apple users, use appleId as the base for UUID (consistent across devices)
      const newUserId = `apple_${newAppleId}`;
      console.log("[UserContext] Generated Apple userId:", newUserId);
      
      // Save to AsyncStorage with individual error handling
      console.log("[UserContext] Saving Apple user to AsyncStorage...");
      
      try {
        await AsyncStorage.setItem(USER_ID_STORAGE_KEY, newUserId);
        console.log("[UserContext] Saved userId");
      } catch (e) {
        console.error("[UserContext] Failed to save userId:", e);
        throw new Error("فشل حفظ معرف المستخدم");
      }
      
      try {
        await AsyncStorage.setItem(USER_STORAGE_KEY, name);
        console.log("[UserContext] Saved username");
      } catch (e) {
        console.error("[UserContext] Failed to save username:", e);
        throw new Error("فشل حفظ الاسم");
      }
      
      try {
        await AsyncStorage.setItem(USER_AVATAR_STORAGE_KEY, newAvatar);
        console.log("[UserContext] Saved avatar");
      } catch (e) {
        console.error("[UserContext] Failed to save avatar:", e);
        throw new Error("فشل حفظ الصورة");
      }
      
      try {
        await AsyncStorage.setItem(USER_ACCOUNT_TYPE_KEY, "apple");
        await AsyncStorage.setItem(USER_APPLE_ID_KEY, newAppleId);
        console.log("[UserContext] Saved accountType and appleId");
      } catch (e) {
        console.error("[UserContext] Failed to save accountType/appleId:", e);
        // Non-critical, continue
      }
      
      // Clear Google ID (non-critical)
      try {
        await AsyncStorage.removeItem(USER_GOOGLE_ID_KEY);
      } catch (e) {
        console.warn("[UserContext] Failed to clear Google ID:", e);
      }
      
      // Update state
      setUserIdState(newUserId);
      setUsernameState(name);
      setAvatarState(newAvatar);
      setAccountTypeState("apple");
      setAppleIdState(newAppleId);
      setGoogleIdState(null);
      
      console.log("[UserContext] Logged in with Apple successfully:", { userId: newUserId, name });
    } catch (error) {
      console.error("[UserContext] Failed to login with Apple:", error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      const currentAccountType = accountType;
      
      if (currentAccountType === "guest") {
        // For guests, clear ALL data including userId
        await clearAllData();
      } else {
        // For Google/Apple users, just clear session but keep the IDs
        await AsyncStorage.removeItem(USER_STORAGE_KEY);
        await AsyncStorage.removeItem(USER_AVATAR_STORAGE_KEY);
        setUsernameState(null);
        setAvatarState(null);
      }
      
      console.log("[UserContext] Logged out, accountType was:", currentAccountType);
    } catch (error) {
      console.error("Failed to logout:", error);
      throw error;
    }
  };

  const clearAllData = async () => {
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_ID_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_AVATAR_STORAGE_KEY);
      await AsyncStorage.removeItem(USER_ACCOUNT_TYPE_KEY);
      await AsyncStorage.removeItem(USER_GOOGLE_ID_KEY);
      await AsyncStorage.removeItem(USER_APPLE_ID_KEY);
      
      setUsernameState(null);
      setUserIdState("");
      setAvatarState(null);
      setAccountTypeState("guest");
      setGoogleIdState(null);
      setAppleIdState(null);
      
      console.log("[UserContext] All user data cleared");
    } catch (error) {
      console.error("Failed to clear all data:", error);
      throw error;
    }
  };

  return (
    <UserContext.Provider value={{ 
      username, 
      userId, 
      avatar, 
      accountType,
      googleId,
      appleId,
      isLoading, 
      isLoggedIn,
      setUsername, 
      setAvatar, 
      setUserData,
      loginAsGuest,
      loginWithGoogle,
      loginWithApple,
      logout,
      clearAllData
    }}>
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
