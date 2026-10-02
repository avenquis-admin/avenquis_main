import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { PoolClient } from "pg";
import { pool } from "../db";
import { ProvisioningCommand } from "../contracts/platform";
import { ApiError } from "../middlewares/errorHandler";

type ProvisioningData = Record<string, unknown>;

function fingerprint(command: ProvisioningCommand): string {
  return createHash("sha256").update(JSON.stringify(command)).digest("hex");
}

async function getFirm(client: PoolClient, controlFirmId: string): Promise<{ id: number; status: string }> {
  const result = await client.query(
    'SELECT id, status FROM firms WHERE control_firm_id = $1 FOR UPDATE',
    [controlFirmId],
  );
  if (!result.rows[0]) throw new ApiError(404, "FIRM_NOT_PROVISIONED", "The firm has not been provisioned in Core.");
  return result.rows[0];
}

async function audit(client: PoolClient, command: ProvisioningCommand, data: ProvisioningData): Promise<void> {
  await client.query(`
    INSERT INTO audit_events (
      actor, actor_user_id, actor_role_context, action, severity,
      target_tenant_id, target_user_id, target_resource_type, target_resource_id,
      previous_state, new_state, correlation_id, reason, source_application, details
    ) VALUES (
      'Control Platform', NULL, 'PLATFORM_AUTHORITY', $1, $2,
      $3, $4, $5, $6, $7, $8, $9, $10, 'control', $11
    )
  `, [
    command.action,
    command.action.endsWith("suspend") || command.action.endsWith("disable") ? "warning" : "info",
    command.firmId,
    typeof data.coreUserId === "number" ? String(data.coreUserId) : null,
    command.action.startsWith("user.") ? "USER" : "FIRM",
    typeof data.coreUserId === "number" ? String(data.coreUserId) : command.firmId,
    data.previousState ? String(data.previousState) : null,
    data.newState ? String(data.newState) : null,
    command.correlationId,
    "reason" in command.payload ? String(command.payload.reason) : null,
    JSON.stringify({ provisioningOperationId: command.provisioningOperationId, eventId: command.eventId, ...data }),
  ]);
}

async function applyCommand(client: PoolClient, command: ProvisioningCommand): Promise<ProvisioningData> {
  switch (command.action) {
    case "firm.provision": {
      const current = await client.query('SELECT id, status FROM firms WHERE control_firm_id = $1 FOR UPDATE', [command.firmId]);
      const result = current.rows[0]
        ? await client.query(`UPDATE firms SET name=$2, subdomain=$3, status=$4, updated_at=now() WHERE control_firm_id=$1 RETURNING id, status`, [command.firmId, command.payload.firmName, command.payload.subdomain, command.payload.status])
        : await client.query(`INSERT INTO firms (name, subdomain, status, control_firm_id) VALUES ($1,$2,$3,$4) RETURNING id, status`, [command.payload.firmName, command.payload.subdomain, command.payload.status, command.firmId]);
      return { coreFirmId: result.rows[0].id, previousState: current.rows[0]?.status ?? null, newState: result.rows[0].status };
    }
    case "firm.activate":
    case "firm.suspend": {
      const firm = await getFirm(client, command.firmId);
      const status = command.action === "firm.activate" ? "active" : "suspended";
      await client.query('UPDATE firms SET status=$2, updated_at=now() WHERE id=$1', [firm.id, status]);
      return { coreFirmId: firm.id, previousState: firm.status, newState: status };
    }
    case "user.provision": {
      const firm = await getFirm(client, command.firmId);
      const existing = await client.query('SELECT id, platform_user_id AS "platformUserId", status FROM users WHERE platform_user_id=$1 OR lower(email)=lower($2) FOR UPDATE', [command.payload.platformUserId, command.payload.email]);
      const current = existing.rows[0];
      if (current?.platformUserId && current.platformUserId !== command.payload.platformUserId) {
        throw new ApiError(409, "IDENTITY_COLLISION", "The email is already bound to another platform identity.");
      }
      const status = command.payload.status === "disabled" ? "disabled" : "active";
      let coreUserId: number;
      if (current) {
        coreUserId = current.id;
        await client.query(`UPDATE users SET platform_user_id=$2, email=lower($3), full_name=$4, account_role=$5, status=$6, platform_role=NULL, updated_at=now() WHERE id=$1`, [coreUserId, command.payload.platformUserId, command.payload.email, command.payload.fullName, command.payload.role, status]);
      } else {
        const passwordHash = await bcrypt.hash(randomUUID(), 12);
        const created = await client.query(`INSERT INTO users (email,password_hash,must_change_password,full_name,status,account_role,platform_user_id,platform_role) VALUES (lower($1),$2,true,$3,$4,$5,$6,NULL) RETURNING id`, [command.payload.email, passwordHash, command.payload.fullName, status, command.payload.role, command.payload.platformUserId]);
        coreUserId = created.rows[0].id;
      }
      await client.query(`INSERT INTO firm_users (user_id,firm_id,role,status,revoked_at,revoked_reason) VALUES ($1,$2,$3,$4,NULL,NULL) ON CONFLICT (user_id,firm_id) DO UPDATE SET role=EXCLUDED.role,status=EXCLUDED.status,revoked_at=NULL,revoked_reason=NULL,updated_at=now()`, [coreUserId, firm.id, command.payload.role, status]);
      return { coreFirmId: firm.id, platformUserId: command.payload.platformUserId, coreUserId, previousState: current?.status ?? null, newState: status, passwordSetupRequired: true };
    }
    case "user.disable": {
      const firm = await getFirm(client, command.firmId);
      const user = await client.query('SELECT id, status FROM users WHERE platform_user_id=$1 FOR UPDATE', [command.payload.platformUserId]);
      if (!user.rows[0]) throw new ApiError(404, "USER_NOT_PROVISIONED", "The platform user has not been provisioned in Core.");
      await client.query('UPDATE users SET status=\'disabled\',updated_at=now() WHERE id=$1', [user.rows[0].id]);
      await client.query('UPDATE firm_users SET status=\'revoked\',revoked_at=now(),revoked_reason=$3,updated_at=now() WHERE user_id=$1 AND firm_id=$2', [user.rows[0].id, firm.id, command.payload.reason]);
      return { coreFirmId: firm.id, platformUserId: command.payload.platformUserId, coreUserId: user.rows[0].id, previousState: user.rows[0].status, newState: "disabled" };
    }
    case "entitlements.replace": {
      const firm = await getFirm(client, command.firmId);
      const current = await client.query('SELECT entitlement_version AS "version" FROM firm_entitlements WHERE firm_id=$1 FOR UPDATE', [firm.id]);
      if (current.rows[0] && Number(current.rows[0].version) >= command.payload.entitlementVersion) throw new ApiError(409, "STALE_ENTITLEMENT_VERSION", "Entitlement version must be newer than the current Core version.");
      await client.query(`INSERT INTO firm_subscriptions (firm_id,control_firm_id,subscription_id,subscription_status,entitlement_version) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (firm_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,subscription_status=EXCLUDED.subscription_status,entitlement_version=EXCLUDED.entitlement_version,updated_at=now() WHERE firm_subscriptions.entitlement_version < EXCLUDED.entitlement_version`, [firm.id, command.firmId, command.payload.subscriptionId, command.payload.subscriptionStatus, command.payload.entitlementVersion]);
      await client.query(`INSERT INTO firm_entitlements (firm_id,control_firm_id,subscription_id,plan_code,subscription_status,entitlement_version,modules,limits,effective_from,effective_until) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) ON CONFLICT (firm_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,plan_code=EXCLUDED.plan_code,subscription_status=EXCLUDED.subscription_status,entitlement_version=EXCLUDED.entitlement_version,modules=EXCLUDED.modules,limits=EXCLUDED.limits,effective_from=EXCLUDED.effective_from,effective_until=EXCLUDED.effective_until,updated_at=now()`, [firm.id, command.firmId, command.payload.subscriptionId, command.payload.planCode, command.payload.subscriptionStatus, command.payload.entitlementVersion, JSON.stringify(command.payload.modules), JSON.stringify(command.payload.limits), command.payload.effectiveFrom, command.payload.effectiveUntil]);
      return { coreFirmId: firm.id, subscriptionId: command.payload.subscriptionId, entitlementVersion: command.payload.entitlementVersion, previousState: current.rows[0]?.version ?? null, newState: command.payload.entitlementVersion };
    }
    case "subscription.status_changed": {
      const firm = await getFirm(client, command.firmId);
      const current = await client.query('SELECT subscription_status AS "status", entitlement_version AS "version" FROM firm_subscriptions WHERE firm_id=$1 FOR UPDATE', [firm.id]);
      if (current.rows[0] && Number(current.rows[0].version) >= command.payload.entitlementVersion) throw new ApiError(409, "STALE_ENTITLEMENT_VERSION", "Subscription entitlement version must be newer than the current Core version.");
      await client.query(`INSERT INTO firm_subscriptions (firm_id,control_firm_id,subscription_id,subscription_status,entitlement_version) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (firm_id) DO UPDATE SET subscription_id=EXCLUDED.subscription_id,subscription_status=EXCLUDED.subscription_status,entitlement_version=EXCLUDED.entitlement_version,updated_at=now()`, [firm.id, command.firmId, command.payload.subscriptionId, command.payload.subscriptionStatus, command.payload.entitlementVersion]);
      await client.query(`UPDATE firm_entitlements SET subscription_id=$2,subscription_status=$3,entitlement_version=$4,updated_at=now() WHERE firm_id=$1 AND entitlement_version < $4`, [firm.id, command.payload.subscriptionId, command.payload.subscriptionStatus, command.payload.entitlementVersion]);
      return { coreFirmId: firm.id, subscriptionId: command.payload.subscriptionId, entitlementVersion: command.payload.entitlementVersion, previousState: current.rows[0]?.status ?? null, newState: command.payload.subscriptionStatus };
    }
  }
}

export async function processProvisioningCommand(command: ProvisioningCommand): Promise<ProvisioningData> {
  const client = await pool.connect();
  const requestFingerprint = fingerprint(command);
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`avenquis:core-provisioning:${command.idempotencyKey}`]);
    const existing = await client.query(`SELECT event_id AS "eventId",request_fingerprint AS "requestFingerprint",result FROM provisioning_receipts WHERE idempotency_key=$1 LIMIT 1`, [command.idempotencyKey]);
    if (existing.rows[0]) {
      if (existing.rows[0].eventId !== command.eventId || existing.rows[0].requestFingerprint !== requestFingerprint) throw new ApiError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key is already associated with a different command.");
      await client.query("COMMIT");
      return existing.rows[0].result;
    }
    const duplicateEvent = await client.query('SELECT idempotency_key AS "idempotencyKey" FROM provisioning_receipts WHERE event_id=$1 LIMIT 1', [command.eventId]);
    if (duplicateEvent.rows[0]) throw new ApiError(409, "EVENT_ID_REUSED", "The event ID is already associated with another command.");
    const data = await applyCommand(client, command);
    const result = { contractVersion: command.contractVersion, provisioningOperationId: command.provisioningOperationId, correlationId: command.correlationId, firmId: command.firmId, status: "COMPLETED", processedAt: new Date().toISOString(), ...data };
    await audit(client, command, data);
    await client.query(`INSERT INTO provisioning_receipts (provisioning_operation_id,event_id,idempotency_key,correlation_id,contract_version,action,control_firm_id,request_fingerprint,result) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`, [command.provisioningOperationId, command.eventId, command.idempotencyKey, command.correlationId, command.contractVersion, command.action, command.firmId, requestFingerprint, JSON.stringify(result)]);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
