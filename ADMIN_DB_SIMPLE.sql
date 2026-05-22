-- ============================================
-- 1. إضافة حقول جديدة لجدول Users
-- ============================================
ALTER TABLE users ADD COLUMN role ENUM('user', 'moderator', 'admin') DEFAULT 'user';
ALTER TABLE users ADD COLUMN permissions JSON DEFAULT NULL;

-- ============================================
-- 2. إضافة حقول جديدة لجدول Rooms
-- ============================================
ALTER TABLE rooms ADD COLUMN isPinned BOOLEAN DEFAULT false;
ALTER TABLE rooms ADD COLUMN pinnedBy INT DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN pinnedAt TIMESTAMP DEFAULT NULL;
ALTER TABLE rooms ADD COLUMN autoDeleteEnabled BOOLEAN DEFAULT true;

-- إضافة Foreign Key للـ pinnedBy
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_pinnedBy FOREIGN KEY (pinnedBy) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================
-- 3. إنشاء جدول moderation_logs
-- ============================================
CREATE TABLE IF NOT EXISTS moderation_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  moderatorId INT NOT NULL,
  targetUserId INT DEFAULT NULL,
  roomId INT DEFAULT NULL,
  action ENUM('ban', 'unban', 'room_close', 'pin_room', 'unpin_room') NOT NULL,
  reason VARCHAR(500) DEFAULT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (moderatorId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (targetUserId) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE SET NULL,
  
  INDEX idx_moderatorId (moderatorId),
  INDEX idx_targetUserId (targetUserId),
  INDEX idx_roomId (roomId),
  INDEX idx_action (action),
  INDEX idx_createdAt (createdAt)
);

-- ============================================
-- 4. إنشاء جدول banned_users
-- ============================================
CREATE TABLE IF NOT EXISTS banned_users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL UNIQUE,
  bannedBy INT NOT NULL,
  reason VARCHAR(500) DEFAULT NULL,
  bannedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unbannedAt TIMESTAMP DEFAULT NULL,
  
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (bannedBy) REFERENCES users(id) ON DELETE CASCADE,
  
  INDEX idx_userId (userId),
  INDEX idx_bannedAt (bannedAt),
  INDEX idx_unbannedAt (unbannedAt)
);
