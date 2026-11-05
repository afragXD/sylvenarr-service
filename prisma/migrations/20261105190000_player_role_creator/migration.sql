-- Роль creator: пока полный админ-доступ (как admin).
ALTER TYPE "PlayerRole" ADD VALUE IF NOT EXISTS 'creator';
