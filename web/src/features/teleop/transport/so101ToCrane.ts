import type { OperatorLiveJointTelemetry } from "@/features/teleop/perception/operatorPerceptionStore";
import type { OperatorLeaderState } from "@/features/teleop/transport/operatorHelperApi";

type BuildTelemetrySampleFn = (
  state: OperatorLeaderState,
  sourceId: string,
  sourceLabel: string,
  positionRad: number,
  velocityRadPerSec: number | null,
  torqueNm: number | null,
  motorId: number | null | undefined
) => OperatorLiveJointTelemetry;

/**
 * Script converting 3 degrees of freedom from SO101 teleop 
 * into movements for the crane in simulation.
 */
export const applySo101ToCraneMapping = (
  state: OperatorLeaderState,
  leaderEntries: Array<readonly [string, OperatorLeaderState["joints"][string]]>,
  targetJointNames: readonly string[],
  sourceId: string,
  sourceLabel: string,
  sourceMotorIds: readonly number[],
  buildTelemetrySample: BuildTelemetrySampleFn
): Record<string, OperatorLiveJointTelemetry> | null => {
  const isCrane =
    targetJointNames.includes("base_yaw") &&
    targetJointNames.includes("boom_luff") &&
    targetJointNames.includes("finger_slide");

  if (isCrane && leaderEntries.length >= 7) {
    const baseYawTelemetry = leaderEntries[0]?.[1]; // SO101 Joint 1 (Base Pan)
    const boomLuffTelemetry = leaderEntries[1]?.[1]; // SO101 Joint 2 (Shoulder Lift)
    const fingerSlideTelemetry = leaderEntries[6]?.[1]; // SO101 Gripper

    const result: Record<string, OperatorLiveJointTelemetry> = {};

    // 1. Map Base Yaw directly
    if (baseYawTelemetry && Number.isFinite(baseYawTelemetry.positionRad)) {
      result["base_yaw"] = buildTelemetrySample(
        state,
        sourceId,
        sourceLabel,
        baseYawTelemetry.positionRad,
        baseYawTelemetry.velocityRadPerSec,
        baseYawTelemetry.torqueNm,
        baseYawTelemetry.motorId ?? sourceMotorIds[0]
      );
    }

    // 2. Map Boom Luff directly
    if (boomLuffTelemetry && Number.isFinite(boomLuffTelemetry.positionRad)) {
      result["boom_luff"] = buildTelemetrySample(
        state,
        sourceId,
        sourceLabel,
        boomLuffTelemetry.positionRad,
        boomLuffTelemetry.velocityRadPerSec,
        boomLuffTelemetry.torqueNm,
        boomLuffTelemetry.motorId ?? sourceMotorIds[1]
      );
    }

    // 3. Map Gripper (revolute to prismatic)
    if (fingerSlideTelemetry && Number.isFinite(fingerSlideTelemetry.positionRad)) {
      // SO101 gripper: ~0.08 (closed) to ~1.25 (open)
      // Crane finger_slide: 0.0 (closed) to 0.02 (open)
      const mappedPrismaticM = Math.max(
        0,
        Math.min(0.02, ((fingerSlideTelemetry.positionRad - 0.08) / 1.17) * 0.02)
      );

      result["finger_slide"] = buildTelemetrySample(
        state,
        sourceId,
        sourceLabel,
        mappedPrismaticM,
        fingerSlideTelemetry.velocityRadPerSec,
        fingerSlideTelemetry.torqueNm,
        fingerSlideTelemetry.motorId ?? sourceMotorIds[6]
      );
    }

    return result;
  }

  return null;
};
