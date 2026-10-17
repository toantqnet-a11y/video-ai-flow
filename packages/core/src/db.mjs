/**
 * Canonical project database. Why Node's built-in SQLite here: it matches the
 * dependency-free SP-04 queue and lets domain/queue share ONE WAL database file.
 * Re-evaluate ORM only after the migration baseline is stable.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, renameSync, chmodSync, unlinkSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const migrations = [
  { version: 1, sql: `
    CREATE TABLE channels (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
      preset_json TEXT NOT NULL, preset_version INTEGER NOT NULL DEFAULT 1,
      row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_channels_status ON channels(status,updated_at);
    CREATE TABLE videos (
      id TEXT PRIMARY KEY, channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
      title TEXT NOT NULL, brief TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','content_ready','scenes_ready','assets_processing','editing','rendering','rendered','failed')),
      master_script TEXT NOT NULL DEFAULT '', preset_snapshot_json TEXT NOT NULL,
      preset_source_version INTEGER NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_videos_channel ON videos(channel_id,updated_at);
    CREATE TABLE scenes (
      id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL, text TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 18000,
      media_type TEXT NOT NULL DEFAULT 'image_motion' CHECK(media_type IN ('image_motion','ai_video','import_video')),
      visual_prompt TEXT NOT NULL DEFAULT '',
      voice_asset_id TEXT, visual_asset_id TEXT,
      row_version INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(video_id,idx)
    );
    CREATE TABLE timeline_documents (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      data_json TEXT NOT NULL, row_version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL
    );
    CREATE TABLE asset_revisions (
      id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('voice','image','video')),
      source TEXT NOT NULL, file_path TEXT NOT NULL UNIQUE,
      sha256 TEXT NOT NULL, bytes INTEGER NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('committed','missing')),
      metadata_json TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_asset_scene ON asset_revisions(scene_id,kind,created_at);
    CREATE TABLE domain_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT, entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL, event_name TEXT NOT NULL, created_at INTEGER NOT NULL,
      detail_json TEXT NOT NULL
    );
  ` },
  { version: 2, sql: `
    CREATE TABLE preset_revisions (
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      version INTEGER NOT NULL, preset_json TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(channel_id,version)
    );
    INSERT INTO preset_revisions (channel_id,version,preset_json,created_at)
      SELECT id,preset_version,preset_json,created_at FROM channels;
    CREATE TABLE config_keys (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
  ` },
  { version: 3, sql: `
    ALTER TABLE asset_revisions ADD COLUMN job_id TEXT;
    CREATE UNIQUE INDEX idx_assets_queue_job ON asset_revisions(job_id) WHERE job_id IS NOT NULL;
  ` },
  { version: 4, sql: `
    -- Tombstone preserves channel/video/media and permits restoring mistaken deletes.
    ALTER TABLE channels ADD COLUMN deleted_at INTEGER;
    CREATE INDEX idx_channels_deleted ON channels(deleted_at,status,updated_at);
    -- Idempotency survives app restart, protecting users who retry a slow create.
    CREATE TABLE channel_create_keys (
      request_key TEXT PRIMARY KEY, payload_sha256 TEXT NOT NULL,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT
    );
  ` },
  { version: 5, sql: `
    -- Prevent promoting an asset from another video's scene (two valid FKs alone
    -- cannot enforce the relation between scene_id and video_id).
    CREATE TRIGGER asset_scene_video_insert BEFORE INSERT ON asset_revisions
    WHEN (SELECT video_id FROM scenes WHERE id=NEW.scene_id) <> NEW.video_id
    BEGIN SELECT RAISE(ABORT,'ASSET_VIDEO_SCENE_MISMATCH'); END;
    CREATE TRIGGER asset_scene_video_update BEFORE UPDATE OF scene_id,video_id ON asset_revisions
    WHEN (SELECT video_id FROM scenes WHERE id=NEW.scene_id) <> NEW.video_id
    BEGIN SELECT RAISE(ABORT,'ASSET_VIDEO_SCENE_MISMATCH'); END;
    CREATE INDEX idx_videos_status_updated ON videos(status,updated_at);
    PRAGMA user_version=5;
  ` },
  { version: 6, sql: `
    -- Historical channel presets are legal records; write new versions instead.
    CREATE TRIGGER preset_revision_immutable_update BEFORE UPDATE ON preset_revisions
    BEGIN SELECT RAISE(ABORT,'PRESET_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER preset_revision_immutable_delete BEFORE DELETE ON preset_revisions
    BEGIN SELECT RAISE(ABORT,'PRESET_REVISION_IMMUTABLE'); END;
    PRAGMA user_version=6;
  ` }
  ,{ version: 7, sql: `
    -- Preserve the original channel snapshot forever. Video-level changes are
    -- new immutable revisions, not edits to preset_snapshot_json.
    ALTER TABLE videos ADD COLUMN config_revision INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE videos ADD COLUMN video_overrides_json TEXT NOT NULL DEFAULT '{}';
    CREATE TABLE video_config_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK(version>=1),
      source_preset_version INTEGER NOT NULL CHECK(source_preset_version>=1),
      overrides_json TEXT NOT NULL,
      resolved_json TEXT NOT NULL,
      impact_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,version)
    );
    INSERT INTO video_config_revisions(video_id,version,source_preset_version,overrides_json,resolved_json,impact_json,created_at)
      SELECT id,1,preset_source_version,'{}',preset_snapshot_json,'{"changedPaths":[],"affected":[],"requiresReview":false}',created_at
      FROM videos;
    CREATE TRIGGER video_config_revision_immutable_update BEFORE UPDATE ON video_config_revisions
      BEGIN SELECT RAISE(ABORT,'VIDEO_CONFIG_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER video_config_revision_immutable_delete BEFORE DELETE ON video_config_revisions
      BEGIN SELECT RAISE(ABORT,'VIDEO_CONFIG_REVISION_IMMUTABLE'); END;
    -- Source snapshot is the user's audit trail. Only create-video may set it.
    CREATE TRIGGER video_source_snapshot_immutable BEFORE UPDATE OF preset_snapshot_json,preset_source_version ON videos
      BEGIN SELECT RAISE(ABORT,'VIDEO_SOURCE_SNAPSHOT_IMMUTABLE'); END;
    CREATE INDEX idx_video_config_revisions_video ON video_config_revisions(video_id,version);
    PRAGMA user_version=7;
  ` },
  { version: 8, sql: `
    -- R0-07: registry stores safe metadata only. Secrets remain in encrypted vault.
    CREATE TABLE provider_accounts (
      id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, name TEXT NOT NULL,
      credential_id TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      priority INTEGER NOT NULL DEFAULT 100, row_version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE provider_models (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE RESTRICT,
      model_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('llm','tts','image','video')),
      location TEXT NOT NULL CHECK(location IN ('local','remote')),
      cost_tier TEXT NOT NULL CHECK(cost_tier IN ('local','free_unverified','paid')),
      endpoint TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
      priority INTEGER NOT NULL DEFAULT 100,quota_source TEXT NOT NULL DEFAULT 'unknown'
        CHECK(quota_source IN ('unknown','estimated','provider_verified')),
      quota_limit INTEGER, quota_used INTEGER, quota_reset_at INTEGER,
      row_version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      UNIQUE(account_id,model_id,kind)
    );
    CREATE TABLE provider_usage_events (
      request_id TEXT PRIMARY KEY, model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE RESTRICT,
      units INTEGER NOT NULL CHECK(units>0), created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_provider_models_account ON provider_models(account_id,status,priority);
    CREATE INDEX idx_provider_usage_model ON provider_usage_events(model_id,created_at);
    PRAGMA user_version=8;
  ` },
  { version: 9, sql: `
    -- R0-12: preserve deleted videos and keep authoritative resume hints.
    ALTER TABLE videos ADD COLUMN deleted_at INTEGER;
    ALTER TABLE videos ADD COLUMN last_active_step TEXT NOT NULL DEFAULT 'content'
      CHECK(last_active_step IN ('content','scenes','timeline','video-config'));
    ALTER TABLE videos ADD COLUMN target_duration_sec INTEGER NOT NULL DEFAULT 2100
      CHECK(target_duration_sec BETWEEN 60 AND 14400);
    ALTER TABLE videos ADD COLUMN actual_duration_sec INTEGER;
    UPDATE videos SET target_duration_sec=CAST(json_extract(preset_snapshot_json,'$.content.targetMinutes') AS INTEGER)*60;
    CREATE INDEX idx_videos_library ON videos(channel_id,deleted_at,updated_at DESC,id DESC);
    -- Retry/double-click keys survive application restarts; unique by action.
    CREATE TABLE video_request_keys (
      action TEXT NOT NULL CHECK(action IN ('create','clone')),
      request_key TEXT NOT NULL,
      payload_sha256 TEXT NOT NULL,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE RESTRICT,
      PRIMARY KEY(action,request_key)
    );
    PRAGMA user_version=9;
  ` }
  ,{ version: 10, sql: `
    -- R0-13: Job-scoped approvals; secrets, prompt text and payment credentials
    -- are deliberately absent. All money is integer micro-USD.
    CREATE TABLE paid_approvals (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE RESTRICT,
      model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE RESTRICT,
      total_micro_usd INTEGER NOT NULL CHECK(total_micro_usd BETWEEN 1 AND 10000000000),
      per_call_micro_usd INTEGER NOT NULL CHECK(per_call_micro_usd BETWEEN 1 AND total_micro_usd),
      reserved_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK(reserved_micro_usd >= 0),
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      CHECK(expires_at > created_at)
    );
    CREATE INDEX idx_paid_approvals_job ON paid_approvals(job_id,model_id,created_at);
    CREATE TABLE paid_invocations (
      invocation_key TEXT PRIMARY KEY,
      approval_id TEXT NOT NULL REFERENCES paid_approvals(id) ON DELETE RESTRICT,
      job_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      estimate_micro_usd INTEGER NOT NULL CHECK(estimate_micro_usd > 0),
      status TEXT NOT NULL CHECK(status IN ('reserved','settled','uncertain')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_paid_invocations_approval ON paid_invocations(approval_id,created_at);
    CREATE TABLE paid_policy_audit (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL CHECK(action IN ('approved','revoked','reserved','settled','uncertain')),
      approval_id TEXT NOT NULL,
      invocation_key TEXT,
      amount_micro_usd INTEGER NOT NULL DEFAULT 0,
      at INTEGER NOT NULL
    );
    -- Audit is append-only, to preserve approvals and spending history.
    CREATE TRIGGER paid_audit_no_update BEFORE UPDATE ON paid_policy_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PAID_AUDIT'); END;
    CREATE TRIGGER paid_audit_no_delete BEFORE DELETE ON paid_policy_audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_PAID_AUDIT'); END;
    PRAGMA user_version=10;
  ` }

  ,{ version: 11, sql: `
    -- R0-VID-01: bounded declarations about video models; no secrets and no
    -- claim that external billing/quota or actual model inference is verified.
    CREATE TABLE video_model_capabilities (
      model_id TEXT PRIMARY KEY REFERENCES provider_models(id) ON DELETE RESTRICT,
      capabilities_json TEXT NOT NULL CHECK(json_valid(capabilities_json)),
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
      updated_at INTEGER NOT NULL
    );
    PRAGMA user_version=11;
  ` }

  ,{ version: 12, sql: `
    -- Keep image files outside the public web root. Revision rows never change;
    -- only the current channel pointer advances under optimistic locking.
    ALTER TABLE channels ADD COLUMN avatar_id TEXT;
    CREATE TABLE channel_avatar_revisions (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
      file_name TEXT NOT NULL UNIQUE,
      sha256 TEXT NOT NULL,
      mime_type TEXT NOT NULL CHECK(mime_type IN ('image/png','image/jpeg')),
      bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 262144),
      width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 2048),
      height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 2048),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_channel_avatar_owner ON channel_avatar_revisions(channel_id,created_at);
    CREATE TRIGGER channel_avatar_revision_immutable_update BEFORE UPDATE ON channel_avatar_revisions
      BEGIN SELECT RAISE(ABORT,'CHANNEL_AVATAR_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER channel_avatar_revision_immutable_delete BEFORE DELETE ON channel_avatar_revisions
      BEGIN SELECT RAISE(ABORT,'CHANNEL_AVATAR_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER channel_avatar_owner_guard BEFORE UPDATE OF avatar_id ON channels
      WHEN NEW.avatar_id IS NOT NULL AND NOT EXISTS(
        SELECT 1 FROM channel_avatar_revisions WHERE id=NEW.avatar_id AND channel_id=NEW.id)
      BEGIN SELECT RAISE(ABORT,'CHANNEL_AVATAR_OWNER_MISMATCH'); END;
    PRAGMA user_version=12;
  ` },
  { version: 13, sql: `
    -- R1-01: dedicated brief state, separate from immutable master script.
    CREATE TABLE content_briefs (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1),
      data_json TEXT NOT NULL CHECK(json_valid(data_json)),
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE content_brief_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1),
      data_json TEXT NOT NULL CHECK(json_valid(data_json)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,revision)
    );
    CREATE TRIGGER content_brief_revision_no_update BEFORE UPDATE ON content_brief_revisions
      BEGIN SELECT RAISE(ABORT,'CONTENT_BRIEF_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER content_brief_revision_no_delete BEFORE DELETE ON content_brief_revisions
      BEGIN SELECT RAISE(ABORT,'CONTENT_BRIEF_REVISION_IMMUTABLE'); END;
    PRAGMA user_version=13;
  ` }
  ,{ version: 14, sql: `
    -- R1-02. Editable current outline with immutable historical revisions;
    -- each AI run pins a brief revision and never changes master_script.
    CREATE TABLE content_outlines (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision >= 1),
      data_json TEXT NOT NULL CHECK(json_valid(data_json)),
      source_run_id TEXT, updated_at INTEGER NOT NULL
    );
    CREATE TABLE content_outline_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision >= 1),
      data_json TEXT NOT NULL CHECK(json_valid(data_json)),
      source_run_id TEXT, created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,revision)
    );
    CREATE TRIGGER content_outline_revision_no_update BEFORE UPDATE ON content_outline_revisions
      BEGIN SELECT RAISE(ABORT,'CONTENT_OUTLINE_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER content_outline_revision_no_delete BEFORE DELETE ON content_outline_revisions
      BEGIN SELECT RAISE(ABORT,'CONTENT_OUTLINE_REVISION_IMMUTABLE'); END;
    CREATE TABLE content_outline_runs (
      id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL, brief_revision INTEGER NOT NULL CHECK(brief_revision >= 1),
      outline_revision INTEGER NOT NULL CHECK(outline_revision >= 0),
      model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE RESTRICT,
      brief_json TEXT NOT NULL CHECK(json_valid(brief_json)),
      status TEXT NOT NULL CHECK(status IN ('pending','queued','generated','needs_review','failed')),
      job_id TEXT, result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(video_id,request_key)
    );
    CREATE INDEX idx_outline_runs_video ON content_outline_runs(video_id,created_at DESC);
    PRAGMA user_version=14;
  ` },
  { version:15, sql:`
    -- Generated drafts are NEVER master-script approvals (R1-06).
    CREATE TABLE content_generation_batches (
      id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL, brief_revision INTEGER NOT NULL, outline_revision INTEGER NOT NULL,
      model_ids_json TEXT NOT NULL CHECK(json_valid(model_ids_json)),
      brief_json TEXT NOT NULL CHECK(json_valid(brief_json)),
      outline_json TEXT NOT NULL CHECK(json_valid(outline_json)),
      created_at INTEGER NOT NULL, UNIQUE(video_id,request_key)
    );
    CREATE TABLE content_generation_jobs (
      batch_id TEXT NOT NULL REFERENCES content_generation_batches(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL, job_id TEXT NOT NULL UNIQUE,
      PRIMARY KEY(batch_id,model_id,chapter_idx)
    );
    CREATE TABLE content_chapter_drafts (
      batch_id TEXT NOT NULL REFERENCES content_generation_batches(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL,
      text TEXT NOT NULL, summary TEXT NOT NULL, word_count INTEGER NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(batch_id,model_id,chapter_idx)
    );
    CREATE TRIGGER chapter_draft_no_update BEFORE UPDATE ON content_chapter_drafts
      BEGIN SELECT RAISE(ABORT,'CHAPTER_DRAFT_IMMUTABLE'); END;
    CREATE TRIGGER chapter_draft_no_delete BEFORE DELETE ON content_chapter_drafts
      BEGIN SELECT RAISE(ABORT,'CHAPTER_DRAFT_IMMUTABLE'); END;
    CREATE INDEX idx_chapter_batches_video ON content_generation_batches(video_id,created_at DESC);
    PRAGMA user_version=15;
  ` },
  { version:16, sql:`
    -- Stable identifiers for independently scored immutable model/chapter drafts.
    -- Backfill drafts generated before the scoring feature existed.
    CREATE TABLE content_draft_variants (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL, model_id TEXT NOT NULL, chapter_idx INTEGER NOT NULL,
      FOREIGN KEY(batch_id,model_id,chapter_idx) REFERENCES content_chapter_drafts(batch_id,model_id,chapter_idx) ON DELETE CASCADE,
      UNIQUE(batch_id,model_id,chapter_idx)
    );
    INSERT INTO content_draft_variants(id,batch_id,model_id,chapter_idx)
      SELECT lower(hex(randomblob(16))), batch_id,model_id,chapter_idx FROM content_chapter_drafts;
    CREATE TRIGGER draft_variant_no_update BEFORE UPDATE ON content_draft_variants
      BEGIN SELECT RAISE(ABORT,'DRAFT_VARIANT_IMMUTABLE'); END;
    CREATE TRIGGER draft_variant_no_delete BEFORE DELETE ON content_draft_variants
      BEGIN SELECT RAISE(ABORT,'DRAFT_VARIANT_IMMUTABLE'); END;
    CREATE TABLE content_evaluation_runs (
      id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      variant_id TEXT NOT NULL REFERENCES content_draft_variants(id) ON DELETE CASCADE,
      evaluator_model_id TEXT NOT NULL, request_key TEXT NOT NULL,
      rubric_version INTEGER NOT NULL CHECK(rubric_version=1),
      draft_sha256 TEXT NOT NULL CHECK(length(draft_sha256)=64),
      job_id TEXT, created_at INTEGER NOT NULL,
      UNIQUE(variant_id,request_key), UNIQUE(job_id)
    );
    CREATE INDEX idx_evaluation_runs_variant ON content_evaluation_runs(variant_id,created_at DESC);
    CREATE TABLE content_evaluation_results (
      evaluation_id TEXT PRIMARY KEY REFERENCES content_evaluation_runs(id) ON DELETE CASCADE,
      score_total REAL NOT NULL CHECK(score_total >= 0 AND score_total <= 100),
      result_json TEXT NOT NULL CHECK(json_valid(result_json)), created_at INTEGER NOT NULL
    );
    CREATE TRIGGER evaluation_result_no_update BEFORE UPDATE ON content_evaluation_results
      BEGIN SELECT RAISE(ABORT,'EVALUATION_IMMUTABLE'); END;
    CREATE TRIGGER evaluation_result_no_delete BEFORE DELETE ON content_evaluation_results
      BEGIN SELECT RAISE(ABORT,'EVALUATION_IMMUTABLE'); END;
    PRAGMA user_version=16;
  ` },
  { version:17, sql:`
    -- Retries are private, single-chapter generation batches: this preserves
    -- all existing draft-variant FKs used by immutable AI evaluation history.
    CREATE TABLE content_retry_runs (
      id TEXT PRIMARY KEY,video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      source_variant_id TEXT NOT NULL REFERENCES content_draft_variants(id) ON DELETE CASCADE,
      evaluation_id TEXT NOT NULL REFERENCES content_evaluation_runs(id) ON DELETE RESTRICT,
      model_id TEXT NOT NULL,request_key TEXT NOT NULL,source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
      feedback TEXT NOT NULL CHECK(length(feedback)>=10 AND length(feedback)<=4000),
      batch_id TEXT NOT NULL UNIQUE REFERENCES content_generation_batches(id) ON DELETE RESTRICT,
      chapter_idx INTEGER NOT NULL,job_id TEXT UNIQUE,created_at INTEGER NOT NULL,
      UNIQUE(source_variant_id,request_key)
    );
    CREATE INDEX idx_content_retry_video ON content_retry_runs(video_id,source_variant_id,created_at DESC);
    PRAGMA user_version=17;
  ` },
  { version:18, sql:`
    -- R1-06 separates reviewable script revisions from user-approved publishing.
    -- Approval rows and historical revisions cannot be rewritten by later edits.
    CREATE TABLE content_master_state (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1),
      approved_revision INTEGER CHECK(approved_revision IS NULL OR approved_revision>=1),
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE content_master_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1),
      outline_revision INTEGER NOT NULL CHECK(outline_revision>=0),
      source_json TEXT NOT NULL CHECK(json_valid(source_json)),
      script_text TEXT NOT NULL CHECK(length(script_text)>0 AND length(script_text)<=300000),
      script_sha256 TEXT NOT NULL CHECK(length(script_sha256)=64),
      word_count INTEGER NOT NULL CHECK(word_count>0),
      warnings_json TEXT NOT NULL CHECK(json_valid(warnings_json)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,revision)
    );
    CREATE TABLE content_master_approvals (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      approved_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,revision),
      FOREIGN KEY(video_id,revision) REFERENCES content_master_revisions(video_id,revision) ON DELETE RESTRICT
    );
    CREATE TRIGGER content_master_revision_no_update BEFORE UPDATE ON content_master_revisions
      BEGIN SELECT RAISE(ABORT,'MASTER_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER content_master_revision_no_delete BEFORE DELETE ON content_master_revisions
      BEGIN SELECT RAISE(ABORT,'MASTER_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER content_master_approval_no_update BEFORE UPDATE ON content_master_approvals
      BEGIN SELECT RAISE(ABORT,'MASTER_APPROVAL_IMMUTABLE'); END;
    CREATE TRIGGER content_master_approval_no_delete BEFORE DELETE ON content_master_approvals
      BEGIN SELECT RAISE(ABORT,'MASTER_APPROVAL_IMMUTABLE'); END;
    -- Once master review exists, even a future direct SQL writer cannot bypass
    -- the approved revision. The approval transaction sets the pointer first.
    CREATE TRIGGER content_master_publish_guard BEFORE UPDATE OF master_script ON videos
      WHEN EXISTS(SELECT 1 FROM content_master_state WHERE video_id=OLD.id)
        AND NOT EXISTS(
          SELECT 1 FROM content_master_state s JOIN content_master_revisions r
            ON r.video_id=s.video_id AND r.revision=s.approved_revision
          WHERE s.video_id=OLD.id AND r.script_text=NEW.master_script)
      BEGIN SELECT RAISE(ABORT,'MASTER_APPROVAL_REQUIRED'); END;
    PRAGMA user_version=18;
  ` }

  ,{ version: 19, sql: `
    -- Scene edits are immutable snapshots linked to the exact approved script.
    -- No asset is invalidated without an explicit regeneration in later R2 tasks.
    CREATE TABLE scene_build_state (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1), updated_at INTEGER NOT NULL
    );
    CREATE TABLE scene_build_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1),
      master_revision INTEGER NOT NULL CHECK(master_revision>=1),
      source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
      scene_count INTEGER NOT NULL CHECK(scene_count>=1 AND scene_count<=1200),
      scenes_json TEXT NOT NULL CHECK(json_valid(scenes_json)),
      coverage_json TEXT NOT NULL CHECK(json_valid(coverage_json)),
      acknowledge_edits INTEGER NOT NULL CHECK(acknowledge_edits IN (0,1)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,revision),
      FOREIGN KEY(video_id,master_revision) REFERENCES content_master_revisions(video_id,revision)
    );
    CREATE TRIGGER scene_build_revisions_immutable_update BEFORE UPDATE ON scene_build_revisions
      BEGIN SELECT RAISE(ABORT,'SCENE_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER scene_build_revisions_immutable_delete BEFORE DELETE ON scene_build_revisions
      BEGIN SELECT RAISE(ABORT,'SCENE_REVISION_IMMUTABLE'); END;
    PRAGMA user_version=19;
  ` },
  { version: 20, sql: `
    -- R2-02: visual prompts are immutable, version-pinned proposals only.
    -- The actual scene is edited only by an explicit R2-01 commit afterwards.
    CREATE TABLE scene_visual_runs (
      id TEXT PRIMARY KEY,
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL,
      scene_revision INTEGER NOT NULL CHECK(scene_revision>=1),
      video_row_version INTEGER NOT NULL CHECK(video_row_version>=1),
      config_revision INTEGER NOT NULL CHECK(config_revision>=1),
      source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
      model_id TEXT NOT NULL,
      input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
      scenes_json TEXT NOT NULL CHECK(json_valid(scenes_json)),
      style_json TEXT NOT NULL CHECK(json_valid(style_json)),
      created_at INTEGER NOT NULL,
      UNIQUE(video_id,request_key),
      FOREIGN KEY(video_id,scene_revision) REFERENCES scene_build_revisions(video_id,revision)
    );
    CREATE INDEX idx_scene_visual_runs_video ON scene_visual_runs(video_id,created_at DESC);
    CREATE TRIGGER scene_visual_runs_immutable_update BEFORE UPDATE ON scene_visual_runs
      BEGIN SELECT RAISE(ABORT,'VISUAL_RUN_IMMUTABLE'); END;
    CREATE TRIGGER scene_visual_runs_immutable_delete BEFORE DELETE ON scene_visual_runs
      BEGIN SELECT RAISE(ABORT,'VISUAL_RUN_IMMUTABLE'); END;
    PRAGMA user_version=20;
  ` },
  { version: 21, sql: `
    -- R2-03: Latest requested voice snapshot is the authoritative promotion fence.
    -- The SP-04 job remains immutable; this pointer may change when a user
    -- requests a new text, voice or speed while an old job is still running.
    CREATE TABLE scene_voice_intents (
      scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL, input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
      text_sha256 TEXT NOT NULL CHECK(length(text_sha256)=64),
      config_revision INTEGER NOT NULL CHECK(config_revision>=1),
      provider_id TEXT NOT NULL CHECK(provider_id='edge'),
      voice_id TEXT NOT NULL, rate INTEGER NOT NULL CHECK(rate>=-50 AND rate<=100),
      requested_at INTEGER NOT NULL
    );
    CREATE INDEX idx_scene_voice_intents_job ON scene_voice_intents(job_id);
    PRAGMA user_version=21;
  ` }

  ,{ version: 22, sql: `
    -- R2-04: replace the edge-only intent CHECK without editing v21 or losing
    -- existing jobs; keep the FK/index and freeze explicit local fallback choices.
    ALTER TABLE scene_voice_intents RENAME TO scene_voice_intents_pre_r204;
    CREATE TABLE scene_voice_intents (
      scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL, input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
      text_sha256 TEXT NOT NULL CHECK(length(text_sha256)=64),
      config_revision INTEGER NOT NULL CHECK(config_revision>=1),
      provider_id TEXT NOT NULL CHECK(provider_id IN ('edge','piper','vieneu')),
      voice_id TEXT NOT NULL, rate INTEGER NOT NULL CHECK(rate>=-50 AND rate<=100),
      fallback_provider_id TEXT CHECK(fallback_provider_id IS NULL OR fallback_provider_id IN ('piper','vieneu')),
      fallback_voice_id TEXT,
      requested_at INTEGER NOT NULL,
      CHECK ((fallback_provider_id IS NULL AND fallback_voice_id IS NULL) OR
             (provider_id='edge' AND fallback_provider_id IS NOT NULL AND fallback_voice_id IS NOT NULL))
    );
    INSERT INTO scene_voice_intents
      (scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at)
      SELECT scene_id,job_id,input_hash,text_sha256,config_revision,provider_id,voice_id,rate,requested_at
      FROM scene_voice_intents_pre_r204;
    DROP TABLE scene_voice_intents_pre_r204;
    CREATE INDEX idx_scene_voice_intents_job ON scene_voice_intents(job_id);
    PRAGMA user_version=22;
  ` }

  ,{ version: 23, sql: `
    -- R2-05: last explicit image-generation intent. Manual choice deletes the
    -- pointer; old jobs may finish but cannot become the active image.
    CREATE TABLE scene_image_intents (
      scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
      job_id TEXT NOT NULL,
      input_hash TEXT NOT NULL CHECK(length(input_hash)=64),
      source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64),
      config_revision INTEGER NOT NULL CHECK(config_revision>=1),
      requested_at INTEGER NOT NULL
    );
    CREATE INDEX idx_scene_image_intents_job ON scene_image_intents(job_id);
    CREATE TABLE scene_image_manual_selections (
      scene_id TEXT PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES asset_revisions(id) ON DELETE RESTRICT,
      selected_at INTEGER NOT NULL
    );
    -- Preserve pre-R2-05 manually imported selected images. Existing legacy
    -- unpinned generated images are deliberately NOT promoted as current.
    INSERT INTO scene_image_manual_selections (scene_id,asset_id,selected_at)
      SELECT s.id,a.id,s.updated_at FROM scenes s
      JOIN asset_revisions a ON a.id=s.visual_asset_id
      WHERE a.kind='image' AND a.source='manual_import' AND a.state='committed';
    PRAGMA user_version=23;
  ` }
  ,{ version: 24, sql: `
    -- R2-06: one index entry per byte identity; revisions remain per-scene,
    -- immutable and separately selectable even when bytes are identical.
    CREATE TABLE asset_content_index (
      sha256 TEXT PRIMARY KEY CHECK(length(sha256)=64),
      bytes INTEGER NOT NULL CHECK(bytes>0), first_seen_at INTEGER NOT NULL
    );
    INSERT INTO asset_content_index(sha256,bytes,first_seen_at)
      SELECT sha256,MIN(bytes),MIN(created_at) FROM asset_revisions GROUP BY sha256;
    -- A SHA collision or inconsistent historic size must not be silently
    -- registered as a valid dedupe hit. Never modify an old revision in place.
    CREATE TRIGGER asset_content_size_guard BEFORE INSERT ON asset_revisions
      WHEN EXISTS(SELECT 1 FROM asset_content_index
        WHERE sha256=NEW.sha256 AND bytes<>NEW.bytes)
      BEGIN SELECT RAISE(ABORT,'ASSET_CONTENT_SIZE_MISMATCH'); END;
    CREATE TRIGGER asset_content_register AFTER INSERT ON asset_revisions
      BEGIN INSERT OR IGNORE INTO asset_content_index(sha256,bytes,first_seen_at)
        VALUES(NEW.sha256,NEW.bytes,NEW.created_at); END;
    CREATE TRIGGER asset_revision_immutable_fields BEFORE UPDATE OF
      id,video_id,scene_id,kind,source,file_path,sha256,bytes,metadata_json,created_at,job_id
      ON asset_revisions
      BEGIN SELECT RAISE(ABORT,'ASSET_REVISION_IMMUTABLE'); END;
    CREATE INDEX idx_asset_content_lookup ON asset_revisions(sha256,state,kind);
    PRAGMA user_version=24;
  ` }

  ,{ version: 25, sql: `
    -- R2-07: one explicit operator-approved asset batch, fully tied to the
    -- existing SP-04 queue. No provider payload or credentials in this ledger.
    CREATE TABLE asset_dag_runs (
      id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      request_key TEXT NOT NULL, request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
      config_revision INTEGER NOT NULL, final_job_id TEXT NOT NULL,
      created_at INTEGER NOT NULL, UNIQUE(video_id,request_key)
    );
    CREATE TABLE asset_dag_nodes (
      run_id TEXT NOT NULL REFERENCES asset_dag_runs(id) ON DELETE CASCADE,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      stage TEXT NOT NULL CHECK(stage IN ('voice','image','gate')),
      job_id TEXT NOT NULL,
      PRIMARY KEY(run_id,scene_id,stage),UNIQUE(run_id,job_id)
    );
    CREATE INDEX idx_asset_dag_runs_video ON asset_dag_runs(video_id,created_at DESC);
    CREATE INDEX idx_asset_dag_nodes_job ON asset_dag_nodes(job_id);
    PRAGMA user_version=25;
  ` }
  ,{ version: 26, sql: `
    -- R2-08: append-only accounting identity with conservative uncertain holds.
    -- Never store prompts, credentials, auth headers or provider responses.
    CREATE TABLE provider_quota_calls (
      invocation_key TEXT PRIMARY KEY,
      model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE RESTRICT,
      reserved_units INTEGER NOT NULL CHECK(reserved_units BETWEEN 1 AND 1000000000),
      actual_units INTEGER CHECK(actual_units BETWEEN 1 AND 1000000000),
      status TEXT NOT NULL CHECK(status IN ('reserved','settled','uncertain')),
      created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
      CHECK ((status='settled' AND actual_units IS NOT NULL) OR
             (status<>'settled' AND actual_units IS NULL))
    );
    CREATE INDEX idx_provider_quota_pending ON provider_quota_calls(model_id,status);
    CREATE TRIGGER quota_call_identity_guard BEFORE UPDATE OF
      invocation_key,model_id,reserved_units,created_at ON provider_quota_calls
      BEGIN SELECT RAISE(ABORT,'QUOTA_CALL_IMMUTABLE'); END;
    CREATE TRIGGER quota_call_no_delete BEFORE DELETE ON provider_quota_calls
      BEGIN SELECT RAISE(ABORT,'QUOTA_CALL_IMMUTABLE'); END;
    PRAGMA user_version=26;
  ` }
  ,{ version: 27, sql: `
    -- R2-12: only completed, real runtime switches are recorded; a dry-run is
    -- NOT a switch. Never persist prompts, remote responses or credentials.
    CREATE TABLE provider_switch_events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL, attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 100000),
      from_model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE RESTRICT,
      to_model_id TEXT NOT NULL REFERENCES provider_models(id) ON DELETE RESTRICT,
      account_id TEXT NOT NULL REFERENCES provider_accounts(id) ON DELETE RESTRICT,
      provider_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status='succeeded'),
      consent TEXT NOT NULL CHECK(consent='explicit_remote_runtime'),
      billing_gate TEXT NOT NULL CHECK(billing_gate='confirmed_free_allowlist'),
      created_at INTEGER NOT NULL,
      UNIQUE(job_id,attempt,to_model_id),CHECK(from_model_id<>to_model_id)
    );
    CREATE INDEX idx_provider_switch_events_recent ON provider_switch_events(seq DESC);
    CREATE TRIGGER provider_switch_event_no_update BEFORE UPDATE ON provider_switch_events
      BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SWITCH_EVENT'); END;
    CREATE TRIGGER provider_switch_event_no_delete BEFORE DELETE ON provider_switch_events
      BEGIN SELECT RAISE(ABORT,'IMMUTABLE_SWITCH_EVENT'); END;
    PRAGMA user_version=27;
  ` }
  ,{ version: 28, sql: `
    -- R2-EXT-01: engine-independent, immutable render composition pins.
    CREATE TABLE composition_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1),
      digest TEXT NOT NULL CHECK(length(digest)=64),
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,revision)
    );
    CREATE TRIGGER composition_revision_no_update BEFORE UPDATE ON composition_revisions
      BEGIN SELECT RAISE(ABORT,'COMPOSITION_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER composition_revision_no_delete BEFORE DELETE ON composition_revisions
      BEGIN SELECT RAISE(ABORT,'COMPOSITION_REVISION_IMMUTABLE'); END;
    PRAGMA user_version=28;
  ` }
  ,{ version: 29, sql: `
    -- EXT-08: append-only branded motion style revisions, scoped to video.
    CREATE TABLE motion_brand_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1),
      digest TEXT NOT NULL CHECK(length(digest)=64),
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
      created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,revision)
    );
    CREATE TRIGGER motion_brand_revision_no_update BEFORE UPDATE ON motion_brand_revisions
      BEGIN SELECT RAISE(ABORT,'MOTION_STYLE_IMMUTABLE'); END;
    CREATE TRIGGER motion_brand_revision_no_delete BEFORE DELETE ON motion_brand_revisions
      BEGIN SELECT RAISE(ABORT,'MOTION_STYLE_IMMUTABLE'); END;
    PRAGMA user_version=29;
  ` }

  ,{ version: 30, sql: `
    -- R3-07: append-only timeline snapshots; undo and redo are NEW revisions.
    CREATE TABLE timeline_revisions (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      row_version INTEGER NOT NULL CHECK(row_version>=1),
      action TEXT NOT NULL, document_json TEXT NOT NULL CHECK(json_valid(document_json)),
      created_at INTEGER NOT NULL, PRIMARY KEY(video_id,row_version)
    );
    CREATE TRIGGER timeline_rev_immutable_update BEFORE UPDATE ON timeline_revisions
      BEGIN SELECT RAISE(ABORT,'TIMELINE_REVISION_IMMUTABLE'); END;
    CREATE TRIGGER timeline_rev_immutable_delete BEFORE DELETE ON timeline_revisions
      BEGIN SELECT RAISE(ABORT,'TIMELINE_REVISION_IMMUTABLE'); END;
    CREATE TABLE timeline_action_stacks (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      head_version INTEGER NOT NULL, undo_json TEXT NOT NULL CHECK(json_valid(undo_json)),
      redo_json TEXT NOT NULL CHECK(json_valid(redo_json))
    );
    PRAGMA user_version=30;
  ` }
  ,{ version: 31, sql: `
    -- R3-08: pinned render input and content-addressed, checksum-verified segments.
    CREATE TABLE render_snapshots (
      job_id TEXT PRIMARY KEY, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      engine TEXT NOT NULL, composition_digest TEXT NOT NULL,
      style_digest TEXT, composition_revision INTEGER NOT NULL,
      payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), created_at INTEGER NOT NULL
    );
    CREATE TRIGGER render_snapshots_no_update BEFORE UPDATE ON render_snapshots
      BEGIN SELECT RAISE(ABORT,'RENDER_SNAPSHOT_IMMUTABLE'); END;
    CREATE TRIGGER render_snapshots_no_delete BEFORE DELETE ON render_snapshots
      BEGIN SELECT RAISE(ABORT,'RENDER_SNAPSHOT_IMMUTABLE'); END;
    CREATE TABLE render_segment_cache (
      video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      segment_hash TEXT NOT NULL CHECK(length(segment_hash)=64),
      file_sha256 TEXT NOT NULL CHECK(length(file_sha256)=64),
      frames INTEGER NOT NULL CHECK(frames>0), bytes INTEGER NOT NULL CHECK(bytes>0),
      relative_path TEXT NOT NULL, created_at INTEGER NOT NULL,
      PRIMARY KEY(video_id,segment_hash)
    );
    CREATE TRIGGER render_segment_cache_no_update BEFORE UPDATE ON render_segment_cache
      BEGIN SELECT RAISE(ABORT,'RENDER_SEGMENT_CACHE_IMMUTABLE'); END;
    CREATE TRIGGER render_segment_cache_no_delete BEFORE DELETE ON render_segment_cache
      BEGIN SELECT RAISE(ABORT,'RENDER_SEGMENT_CACHE_IMMUTABLE'); END;
    PRAGMA user_version=31;
  ` },
  { version: 32, sql: `
    -- R4-05: captions are independent drafts, NEVER silently rewrite frozen Composition.
    CREATE TABLE r4_subtitle_drafts (
      video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL CHECK(revision>=1), source_digest TEXT NOT NULL,
      cues_json TEXT NOT NULL, updated_at INTEGER NOT NULL
    );
    PRAGMA user_version=32;
  ` }
];

export function transact(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const output = fn(); db.exec('COMMIT'); return output; }
  catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
}

/**
 * The file-based backup uses SQLite's VACUUM INTO, NOT fs.copyFile.
 * Why: database pages may still live in a hot WAL file; ordinary copying of
 * studio.sqlite can silently omit committed transactions and corrupt recovery.
 * A temporary snapshot is verified and renamed atomically before migrations.
 * This API is synchronous because the canonical openProjectDb() is synchronous.
 */
export function backupProjectDb(db, filename, targetVersion) {
  if (filename === ':memory:') return null;
  const directory = dirname(filename);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join(directory, `${basename(filename)}.pre-v${targetVersion}-${stamp}-${randomUUID().slice(0,8)}.sqlite`);
  const temp = `${path}.incomplete`;
  let snapshot;
  try {
    // SQLite string literal quoting prevents path contents becoming SQL.
    db.exec(`VACUUM INTO '${temp.replaceAll("'", "''")}'`);
    snapshot = new DatabaseSync(temp, { readOnly: true });
    assertHealthy(snapshot);
    snapshot.close();snapshot=null;
    chmodSync(temp, 0o600);
    renameSync(temp, path);
    return path;
  } catch (error) {
    try { snapshot?.close(); } catch {}
    try { unlinkSync(temp); } catch {}
    throw new Error('MIGRATION_BACKUP_FAILED', { cause:error });
  }
}

/** Validate storage before mutating schema; FK and quick-check catch different failures. */
export function assertHealthy(db) {
  const checked=db.prepare('PRAGMA quick_check').all();
  if (checked.length !== 1 || checked[0].quick_check !== 'ok')
    throw new Error('DATABASE_INTEGRITY_FAILED');
  if (db.prepare('PRAGMA foreign_key_check').all().length)
    throw new Error('DATABASE_FOREIGN_KEY_FAILED');
}

/** Early schema-structure guard: checksum ledger alone cannot detect a dropped table. */
function assertSchemaTables(tables,version) {
  const required=['channels','videos','scenes','timeline_documents','asset_revisions','domain_events'];
  if (version>=2) required.push('preset_revisions','config_keys');
  if (version>=4) required.push('channel_create_keys');
  if (version>=7) required.push('video_config_revisions');
  if (version>=8) required.push('provider_accounts','provider_models','provider_usage_events');
  if (version>=9) required.push('video_request_keys');
  if (version>=10) required.push('paid_approvals','paid_invocations','paid_policy_audit');
  if (version>=11) required.push('video_model_capabilities');
  if (version>=12) required.push('channel_avatar_revisions');
  if (version>=13) required.push('content_briefs','content_brief_revisions');
  if (version>=14) required.push('content_outlines','content_outline_revisions','content_outline_runs');
  if (version>=15) required.push('content_generation_batches','content_generation_jobs','content_chapter_drafts');
  if (version>=16) required.push('content_draft_variants','content_evaluation_runs','content_evaluation_results');
  if (version>=17) required.push('content_retry_runs');
  if (version>=20) required.push('scene_visual_runs');
  if (version>=23) required.push('scene_image_intents','scene_image_manual_selections');
  if (version>=24) required.push('asset_content_index');
  if (version>=25) required.push('asset_dag_runs','asset_dag_nodes');
  if (version>=26) required.push('provider_quota_calls');
  if (version>=27) required.push('provider_switch_events');
  if (version>=28) required.push('composition_revisions');
  if (version>=29) required.push('motion_brand_revisions');
  if (version>=30) required.push('timeline_revisions','timeline_action_stacks');
  if (version>=31) required.push('render_snapshots','render_segment_cache');
  if (version>=32) required.push('r4_subtitle_drafts');
  if (required.some(t=>!tables.includes(t))) throw new Error('DATABASE_SCHEMA_INCOMPLETE');
}

/** Prevent a stamped migration ledger from hiding a manually altered schema. */
function assertSchemaStructures(db,version) {
  if (!version) return;
  const requirements={
    channels:['id','name','description','status','preset_json','preset_version','row_version','created_at','updated_at'],
    videos:['id','channel_id','title','status','preset_snapshot_json','preset_source_version','row_version'],
    scenes:['id','video_id','idx','text','duration_ms','media_type'],
    asset_revisions:['id','video_id','scene_id','kind','file_path','sha256'],
  };
  if (version>=3) requirements.asset_revisions.push('job_id');
  if (version>=4) requirements.channels.push('deleted_at');
  if (version>=12) requirements.channels.push('avatar_id');
  if (version>=7) requirements.videos.push('config_revision','video_overrides_json');
  if (version>=9) requirements.videos.push('deleted_at','last_active_step','target_duration_sec','actual_duration_sec');
  if (version>=26) requirements.provider_quota_calls=['invocation_key','model_id','reserved_units','actual_units','status','created_at','updated_at'];
  if (version>=28) requirements.composition_revisions=['video_id','revision','digest','payload_json','created_at'];
  if (version>=29) requirements.motion_brand_revisions=['video_id','revision','digest','payload_json','created_at'];
  if (version>=30) {requirements.timeline_revisions=['video_id','row_version','document_json'];requirements.timeline_action_stacks=['video_id','head_version'];}
  if (version>=31) {requirements.render_snapshots=['job_id','video_id','composition_digest','payload_json'];requirements.render_segment_cache=['video_id','segment_hash','file_sha256'];}
  if (version>=27) requirements.provider_switch_events=['seq','job_id','attempt','from_model_id','to_model_id','account_id','provider_id','status','consent','billing_gate','created_at'];
  for (const [table,fields] of Object.entries(requirements)) {
    const columns=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name));
    if (fields.some(field=>!columns.has(field))) throw new Error('DATABASE_SCHEMA_INCOMPLETE');
  }
  if(version>=5) {
    const triggers=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(r=>r.name));
    if(!triggers.has('asset_scene_video_insert')||!triggers.has('asset_scene_video_update'))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=6 && (!triggers.has('preset_revision_immutable_update')||!triggers.has('preset_revision_immutable_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=7 && (!triggers.has('video_config_revision_immutable_update')||!triggers.has('video_config_revision_immutable_delete')||!triggers.has('video_source_snapshot_immutable')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=12 && (!triggers.has('channel_avatar_owner_guard')||!triggers.has('channel_avatar_revision_immutable_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=13 && (!triggers.has('content_brief_revision_no_update')||!triggers.has('content_brief_revision_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=14 && (!triggers.has('content_outline_revision_no_update')||!triggers.has('content_outline_revision_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=15 && (!triggers.has('chapter_draft_no_update')||!triggers.has('chapter_draft_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=16 && (!triggers.has('draft_variant_no_update')||!triggers.has('draft_variant_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=16 && (!triggers.has('evaluation_result_no_update')||!triggers.has('evaluation_result_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=24 && (!triggers.has('asset_content_register')||!triggers.has('asset_revision_immutable_fields')||!triggers.has('asset_content_size_guard')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=28 && (!triggers.has('composition_revision_no_update')||!triggers.has('composition_revision_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=27 && (!triggers.has('provider_switch_event_no_update')||!triggers.has('provider_switch_event_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=26 && (!triggers.has('quota_call_identity_guard')||!triggers.has('quota_call_no_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=20 && (!triggers.has('scene_visual_runs_immutable_update')||!triggers.has('scene_visual_runs_immutable_delete')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
    if(version>=18 && (!triggers.has('content_master_revision_no_update')||!triggers.has('content_master_approval_no_delete')||!triggers.has('content_master_publish_guard')))
      throw new Error('DATABASE_SCHEMA_INCOMPLETE');
  }
}


/** SQLite FK checks cannot enforce this denormalized video/scene relation by themselves. */
function assertDomainRelations(db, version) {
  if (!version) return;
  const mismatch=db.prepare(`SELECT a.id FROM asset_revisions a
    JOIN scenes s ON s.id=a.scene_id WHERE s.video_id<>a.video_id LIMIT 1`).get();
  if(mismatch) throw new Error('ASSET_VIDEO_SCENE_MISMATCH');
  if(version>=24) {
    const bad=db.prepare(`SELECT a.id FROM asset_revisions a
      LEFT JOIN asset_content_index c ON c.sha256=a.sha256 AND c.bytes=a.bytes
      WHERE c.sha256 IS NULL LIMIT 1`).get();
    if(bad) throw new Error('ASSET_CONTENT_INDEX_MISMATCH');
  }
  if(version>=12){
    const brokenAvatar=db.prepare(`SELECT c.id FROM channels c
      LEFT JOIN channel_avatar_revisions a ON a.id=c.avatar_id AND a.channel_id=c.id
      WHERE c.avatar_id IS NOT NULL AND a.id IS NULL LIMIT 1`).get();
    if(brokenAvatar)throw new Error('CHANNEL_AVATAR_REVISION_MISMATCH');
  }
  if(version>=7){
    // DB-level guard for the denormalized current revision pointer and source.
    // Invalid history must fail closed before new migrations alter the file.
    const mismatch=db.prepare(`SELECT v.id FROM videos v LEFT JOIN video_config_revisions r
      ON r.video_id=v.id AND r.version=v.config_revision
      WHERE r.video_id IS NULL OR v.preset_source_version<>r.source_preset_version
      LIMIT 1`).get();
    if(mismatch)throw new Error('VIDEO_CONFIG_REVISION_MISMATCH');
  }
}

/**
 * Migration rules:
 * - Reject unversioned domain tables / missing or modified historical migrations;
 * - Refuse to open databases created by newer app schema versions;
 * - Take a verified point-in-time backup BEFORE an existing database is upgraded;
 * - Keep each DDL+checksum ledger write in one transaction (safe on failure).
 *
 * @param {string} filename Canonical SQLite path or ':memory:'
 * @returns {DatabaseSync} Open DB. Caller must close it.
 */
export function openProjectDb(filename=':memory:') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), {recursive:true});
  const existed = filename !== ':memory:' && existsSync(filename);
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000');
    // Read-only preflight: never "repair" or stamp unknown legacy tables automatically.
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
    const hasLedger=tables.includes('schema_migrations');
    const domainTables=['channels','videos','scenes','timeline_documents','asset_revisions','domain_events','preset_revisions','config_keys','channel_create_keys','video_config_revisions','provider_accounts','provider_models','provider_usage_events','video_request_keys','paid_approvals','paid_invocations','paid_policy_audit','video_model_capabilities','content_briefs','content_brief_revisions','content_generation_batches','content_generation_jobs','content_chapter_drafts','content_draft_variants','content_evaluation_runs','content_evaluation_results','content_retry_runs','scene_build_state','scene_build_revisions','scene_visual_runs'];
    if (!hasLedger && tables.some(name=>domainTables.includes(name)))
      throw new Error('UNVERSIONED_DOMAIN_SCHEMA');
    // The shared queue is allowed to exist before domain initialization, but a
    // foreign SQLite file without the ledger must never be silently adopted.
    const queueTables=['jobs','dependencies','attempts','assets','outbox'];
    if (!hasLedger && tables.some(name=>!queueTables.includes(name)))
      throw new Error('UNVERSIONED_FOREIGN_SCHEMA');
    if (hasLedger) {
      assertHealthy(db);
      const recorded=db.prepare('SELECT version,checksum FROM schema_migrations ORDER BY version').all();
      const known=new Map(migrations.map(m=>[m.version,createHash('sha256').update(m.sql).digest('hex')]));
      for (let i=0;i<recorded.length;i++) {
        const {version,checksum}=recorded[i];
        if (!known.has(version)) throw new Error(`DATABASE_SCHEMA_NEWER_OR_UNKNOWN_${version}`);
        if (version!==i+1) throw new Error('MIGRATION_HISTORY_GAP');
        if (checksum!==known.get(version)) throw new Error(`MIGRATION_CHANGED_${version}`);
      }
      // Missing tables on a previously versioned DB indicate a partial/corrupt copy.
      if (recorded.length) {
        assertSchemaTables(tables,recorded.length);
        assertSchemaStructures(db,recorded.length);
        assertDomainRelations(db,recorded.length);
      }
      if (!recorded.length && tables.some(name=>domainTables.includes(name)))
        throw new Error('MIGRATION_HISTORY_MISSING');
    }
    const applied=hasLedger ? db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get().version ?? 0 : 0;
    const pending=migrations.filter(m=>m.version>applied);
    // Even queue-only DBs contain valuable jobs. Never initialize the domain
    // inside an existing SQLite file without first preserving its full contents.
    if (pending.length && existed && tables.length>0)
      backupProjectDb(db,filename,pending[pending.length-1].version);
    if (!hasLedger) db.exec(`CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
    for (const {version,sql} of pending) {
      const checksum=createHash('sha256').update(sql).digest('hex');
      transact(db,()=>{
        db.exec(sql);
        assertHealthy(db);
        db.prepare('INSERT INTO schema_migrations(version,checksum,applied_at) VALUES(?,?,?)')
          .run(version,checksum,Date.now());
      });
    }
    assertHealthy(db);
    assertSchemaTables(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r=>r.name),migrations.length);
    assertSchemaStructures(db,migrations.length);
    assertDomainRelations(db,migrations.length);
    if (filename !== ':memory:' && !existed) chmodSync(filename,0o600);
    return db;
  } catch (error) {
    try { db.close(); } catch {}
    throw error;
  }
}
