-- ============================================
-- نظام المدراء والمشرفين - تعديلات قاعدة البيانات
-- ============================================

-- 1. إضافة حقول جديدة لجدول Users
ALTER TABLE users ADD COLUMN role ENUM('user', 'moderator', 'admin') DEFAULT 'user' AFTER role;
ALTER TABLE users ADD COLUMN permissions JSON DEFAULT NULL AFTER role;

-- 2. إضافة حقول جديدة لجدول Rooms
ALTER TABLE rooms ADD COLUMN isPinned BOOLEAN DEFAULT false AFTER isActive;
ALTER TABLE rooms ADD COLUMN pinnedBy INT DEFAULT NULL AFTER isPinned;
ALTER TABLE rooms ADD COLUMN pinnedAt TIMESTAMP DEFAULT NULL AFTER pinnedBy;
ALTER TABLE rooms ADD COLUMN autoDeleteEnabled BOOLEAN DEFAULT true AFTER pinnedAt;

-- إضافة Foreign Key للـ pinnedBy
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_pinnedBy 
FOREIGN KEY (pinnedBy) REFERENCES users(id) ON DELETE SET NULL;

-- 3. إنشاء جدول moderation_logs
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

-- 4. إضافة جدول للمستخدمين المحظورين
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

-- ============================================
-- دوال مساعدة
-- ============================================

-- دالة للتحقق من أن المستخدم مشرف
-- SELECT isUserModerator('user-id') AS isModerator;
DELIMITER //
CREATE FUNCTION isUserModerator(userId VARCHAR(255))
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE userRole VARCHAR(50);
  SELECT role INTO userRole FROM users WHERE id = userId;
  RETURN userRole IN ('moderator', 'admin');
END //
DELIMITER ;

-- دالة للتحقق من أن المستخدم مدير
-- SELECT isUserAdmin('user-id') AS isAdmin;
DELIMITER //
CREATE FUNCTION isUserAdmin(userId VARCHAR(255))
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE userRole VARCHAR(50);
  SELECT role INTO userRole FROM users WHERE id = userId;
  RETURN userRole = 'admin';
END //
DELIMITER ;

-- دالة للتحقق من أن المستخدم محظور
-- SELECT isUserBanned('user-id') AS isBanned;
DELIMITER //
CREATE FUNCTION isUserBanned(userId INT)
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE bannedCount INT;
  SELECT COUNT(*) INTO bannedCount FROM banned_users 
  WHERE userId = userId AND unbannedAt IS NULL;
  RETURN bannedCount > 0;
END //
DELIMITER ;

-- دالة للتحقق من أن الساحة مثبتة
-- SELECT isRoomPinned(room_id) AS isPinned;
DELIMITER //
CREATE FUNCTION isRoomPinned(roomId INT)
RETURNS BOOLEAN
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE pinnedStatus BOOLEAN;
  SELECT isPinned INTO pinnedStatus FROM rooms WHERE id = roomId;
  RETURN pinnedStatus;
END //
DELIMITER ;

-- ============================================
-- Stored Procedures
-- ============================================

-- إجراء لحظر مستخدم
-- CALL banUser(targetUserId, moderatorId, 'سبب الحظر');
DELIMITER //
CREATE PROCEDURE banUser(
  IN targetUserId INT,
  IN moderatorId INT,
  IN reason VARCHAR(500)
)
BEGIN
  -- التحقق من أن المشرف له صلاحيات
  IF NOT isUserModerator(moderatorId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ليس لديك صلاحيات كافية';
  END IF;
  
  -- إدراج في جدول banned_users
  INSERT INTO banned_users (userId, bannedBy, reason)
  VALUES (targetUserId, moderatorId, reason);
  
  -- تسجيل الإجراء
  INSERT INTO moderation_logs (moderatorId, targetUserId, action, reason)
  VALUES (moderatorId, targetUserId, 'ban', reason);
END //
DELIMITER ;

-- إجراء لإلغاء حظر مستخدم
-- CALL unbanUser(targetUserId, moderatorId);
DELIMITER //
CREATE PROCEDURE unbanUser(
  IN targetUserId INT,
  IN moderatorId INT
)
BEGIN
  -- التحقق من أن المشرف له صلاحيات
  IF NOT isUserModerator(moderatorId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ليس لديك صلاحيات كافية';
  END IF;
  
  -- تحديث جدول banned_users
  UPDATE banned_users 
  SET unbannedAt = NOW() 
  WHERE userId = targetUserId AND unbannedAt IS NULL;
  
  -- تسجيل الإجراء
  INSERT INTO moderation_logs (moderatorId, targetUserId, action)
  VALUES (moderatorId, targetUserId, 'unban');
END //
DELIMITER ;

-- إجراء لتثبيت ساحة
-- CALL pinRoom(roomId, moderatorId);
DELIMITER //
CREATE PROCEDURE pinRoom(
  IN roomId INT,
  IN moderatorId INT
)
BEGIN
  -- التحقق من أن المشرف له صلاحيات
  IF NOT isUserModerator(moderatorId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ليس لديك صلاحيات كافية';
  END IF;
  
  -- تحديث الساحة
  UPDATE rooms 
  SET isPinned = true, pinnedBy = moderatorId, pinnedAt = NOW(), autoDeleteEnabled = false
  WHERE id = roomId;
  
  -- تسجيل الإجراء
  INSERT INTO moderation_logs (moderatorId, roomId, action)
  VALUES (moderatorId, roomId, 'pin_room');
END //
DELIMITER ;

-- إجراء لإلغاء تثبيت ساحة
-- CALL unpinRoom(roomId, moderatorId);
DELIMITER //
CREATE PROCEDURE unpinRoom(
  IN roomId INT,
  IN moderatorId INT
)
BEGIN
  -- التحقق من أن المشرف له صلاحيات
  IF NOT isUserModerator(moderatorId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ليس لديك صلاحيات كافية';
  END IF;
  
  -- تحديث الساحة
  UPDATE rooms 
  SET isPinned = false, pinnedBy = NULL, pinnedAt = NULL, autoDeleteEnabled = true
  WHERE id = roomId;
  
  -- تسجيل الإجراء
  INSERT INTO moderation_logs (moderatorId, roomId, action)
  VALUES (moderatorId, roomId, 'unpin_room');
END //
DELIMITER ;

-- إجراء لإغلاق ساحة من قبل مشرف
-- CALL closeRoomByModerator(roomId, moderatorId, 'سبب الإغلاق');
DELIMITER //
CREATE PROCEDURE closeRoomByModerator(
  IN roomId INT,
  IN moderatorId INT,
  IN reason VARCHAR(500)
)
BEGIN
  -- التحقق من أن المشرف له صلاحيات
  IF NOT isUserModerator(moderatorId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ليس لديك صلاحيات كافية';
  END IF;
  
  -- إغلاق الساحة
  UPDATE rooms 
  SET isActive = 'false'
  WHERE id = roomId;
  
  -- تسجيل الإجراء
  INSERT INTO moderation_logs (moderatorId, roomId, action, reason)
  VALUES (moderatorId, roomId, 'room_close', reason);
END //
DELIMITER ;

-- إجراء لتعيين مشرف (من قبل admin فقط)
-- CALL setUserRole(targetUserId, 'moderator', adminId);
DELIMITER //
CREATE PROCEDURE setUserRole(
  IN targetUserId INT,
  IN newRole ENUM('user', 'moderator', 'admin'),
  IN adminId INT
)
BEGIN
  -- التحقق من أن المستخدم مدير
  IF NOT isUserAdmin(adminId) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ليس لديك صلاحيات كافية';
  END IF;
  
  -- تحديث الدور
  UPDATE users 
  SET role = newRole
  WHERE id = targetUserId;
END //
DELIMITER ;
