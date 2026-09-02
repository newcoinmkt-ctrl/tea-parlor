-- Invite mechanism + gold grant ledger.
-- This migration is intentionally database-portable SQL for the future
-- persistent wallet-service store. Current tests use the in-memory model.

ALTER TABLE users
  ADD COLUMN referred_by VARCHAR(64),
  ADD COLUMN invite_bound_at TIMESTAMP,
  ADD COLUMN first_game_finished_at TIMESTAMP,
  ADD COLUMN invite_risk_status VARCHAR(32) NOT NULL DEFAULT 'normal',
  ADD COLUMN invite_risk_reason VARCHAR(128),
  ADD COLUMN valid_invite_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN share_reward_date DATE,
  ADD COLUMN gold_balance NUMERIC(20, 8) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS gold_ledger (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  amount NUMERIC(20, 8) NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (
    type IN (
      'recharge',
      'game_win',
      'game_lose',
      'table_fee',
      'share',
      'invite_success',
      'newbie_invite',
      'newbie_organic',
      'relief',
      'invite_milestone'
    )
  ),
  ref_user_id VARCHAR(64),
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_user_created ON gold_ledger(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_type_created ON gold_ledger(type, created_at);
CREATE INDEX IF NOT EXISTS idx_gold_ledger_ref_user ON gold_ledger(ref_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_ledger_invite_success_once
  ON gold_ledger(ref_user_id, type)
  WHERE type = 'invite_success' AND amount > 0;
CREATE TABLE IF NOT EXISTS invite_share_claims (
  user_id VARCHAR(64) NOT NULL,
  claim_date DATE NOT NULL,
  gold_ledger_id VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, claim_date)
);

CREATE TABLE IF NOT EXISTS invite_reward_reviews (
  id VARCHAR(96) PRIMARY KEY,
  invitee_user_id VARCHAR(64) NOT NULL UNIQUE,
  inviter_user_id VARCHAR(64) NOT NULL,
  amount NUMERIC(20, 8) NOT NULL DEFAULT 4000,
  status VARCHAR(32) NOT NULL DEFAULT 'pending_review',
  reason VARCHAR(160),
  operator_id VARCHAR(64),
  ledger_entry_id VARCHAR(64),
  reversal_ledger_entry_id VARCHAR(64),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP,
  frozen_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  type VARCHAR(32) NOT NULL,
  title VARCHAR(128) NOT NULL,
  body VARCHAR(512) NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invite_risk_logs (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  ref_user_id VARCHAR(64),
  ip VARCHAR(128),
  device_hash VARCHAR(128),
  source VARCHAR(64),
  result VARCHAR(64) NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created ON user_notifications(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invite_risk_logs_user_created ON invite_risk_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_invite_risk_logs_ref_user ON invite_risk_logs(ref_user_id);
